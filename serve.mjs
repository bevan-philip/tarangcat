//
// Tiny static file server for dist/, for local verification. Not a dev server: it does
// not rebuild on change — run `node build.mjs --watch` alongside it.
//
//   node serve.mjs [port]
//

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

const port = Number(process.argv[2] ?? 8080)
const root = join(import.meta.dirname, 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let path = decodeURIComponent(url.pathname)
  if (path === '/') path = '/index.html'

  const filePath = join(root, path)
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden')
    return
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not a file')
    const contents = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(contents)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => {
  console.log(`serving dist/ at http://localhost:${port}`)
})
