//
// Build: esbuild for the bundle, dart-sass for the stylesheet, content hashes on both,
// plus the images/fonts the vendored view needs.
//
//   node build.mjs [--watch] [--dev]
//
// TARANG_API_BASE (env var) sets the backend origin baked into the bundle, e.g.
//   TARANG_API_BASE=http://127.0.0.1:3000 node build.mjs --dev
// Empty (the default) means same-origin — the right choice once this build is served
// from the same origin as Tarang itself.
//

import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

import esbuild from 'esbuild'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const vendor = join(here, 'vendor', 'fraidycat')
const outDir = join(here, 'dist')
const assetsDir = join(outDir, 'assets')

const watch = process.argv.includes('--watch')
const dev = watch || process.argv.includes('--dev')
const apiBase = process.env.TARANG_API_BASE ?? ''

// main.js imports the stylesheet so the dependency is visible in the source; dart-sass
// compiles it separately, so the bundler just needs it to disappear.
const stylesheetStub = {
  name: 'stylesheet-stub',
  setup(build) {
    build.onResolve({ filter: /\.s?css$/ }, (args) => ({ path: args.path, namespace: 'stylesheet-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'stylesheet-stub' }, () => ({ contents: '', loader: 'js' }))
  }
}

function hash(contents) {
  return createHash('sha256').update(contents).digest('hex').slice(0, 8).toUpperCase()
}

async function emit(name, contents) {
  const extension = extname(name)
  const stem = basename(name, extension)
  const filename = `${stem}-${hash(contents)}${extension}`
  await writeFile(join(assetsDir, filename), contents)
  return `/assets/${filename}`
}

//
// The vendored images, copied verbatim and mapped by bare name, which is how the view
// refers to them (upstream got the same map from Parcel's glob imports).
//
async function copyImages() {
  const source = join(vendor, 'images')
  const target = join(outDir, 'images')
  await mkdir(target, { recursive: true })

  const manifest = { png: {}, svg: {}, webp: {} }
  for (const file of await readdir(source)) {
    const extension = extname(file).slice(1)
    if (!(extension in manifest)) continue
    await cp(join(source, file), join(target, file))
    manifest[extension][basename(file, extname(file))] = `/images/${file}`
  }
  return manifest
}

// The vendored stylesheet references ../fonts/*.woff2, so the fonts have to sit one level
// up from /assets/.
async function copyFonts() {
  await cp(join(vendor, 'fonts'), join(outDir, 'fonts'), { recursive: true })
}

async function buildStyles() {
  const result = sass.compile(join(here, 'src', 'styles', 'app.scss'), {
    style: dev ? 'expanded' : 'compressed',
    loadPaths: [join(here, 'src', 'styles')],
    // The vendored sheet is 2021-era Sass; its deprecation warnings are upstream's, not
    // ours, and we do not modify the file (VENDORED.md).
    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div'],
    quietDeps: true
  })
  return emit('app.css', result.css)
}

async function buildScript(assetManifest) {
  const result = await esbuild.build({
    entryPoints: [join(here, 'src', 'main.js')],
    bundle: true,
    format: 'esm',
    target: ['safari15', 'chrome100', 'firefox100'],
    // The vendored view is JSX compiled against hyperapp's `h`, in .js files.
    loader: { '.js': 'jsx' },
    jsxFactory: 'h',
    jsxFragment: 'div',
    define: {
      __TARANGCAT_ASSETS__: JSON.stringify(assetManifest),
      __TARANG_API_BASE__: JSON.stringify(apiBase),
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
    },
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    write: false,
    logLevel: 'warning',
    nodePaths: [join(here, 'node_modules')],
    plugins: [stylesheetStub]
  })

  // With write:false and no outdir, esbuild returns a single <stdout> file.
  return emit('app.js', result.outputFiles[0].contents)
}

function indexHtml({ script, style }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>tarangcat</title>
  <meta name="description" content="Fraidycat's interface, fed from Tarang.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">

  <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon.png">

  <link rel="stylesheet" href="${style}">
</head>
<body>
  <div id="fraidy"></div>
  <script type="module" src="${script}"></script>
</body>
</html>
`
}

async function build() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(assetsDir, { recursive: true })

  const [assetManifest] = await Promise.all([copyImages(), copyFonts()])

  const [style, script] = await Promise.all([buildStyles(), buildScript(assetManifest)])
  await writeFile(join(outDir, 'index.html'), indexHtml({ script, style }))

  console.log(`built ${script} and ${style}${apiBase ? ` (api: ${apiBase})` : ''}`)
}

await build()

if (watch) {
  const { watch: watchFiles } = await import('node:fs')
  const targets = [join(here, 'src'), join(vendor, 'js'), join(vendor, 'css')]
  let queued = null
  for (const target of targets) {
    watchFiles(target, { recursive: true }, () => {
      clearTimeout(queued)
      queued = setTimeout(() => {
        build().catch((error) => console.error(error))
      }, 100)
    })
  }
  console.log('watching for changes')
}
