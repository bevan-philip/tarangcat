import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, before, after, afterEach } from 'node:test'

import esbuild from 'esbuild'

let adapter
let temporaryDirectory
const originalFetch = globalThis.fetch

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'tarangcat-adapter-'))
  const output = join(temporaryDirectory, 'tarang.mjs')
  await esbuild.build({
    entryPoints: [join(process.cwd(), 'src', 'data', 'tarang.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: output,
    define: { __TARANG_API_BASE__: '""' }
  })
  adapter = await import(pathToFileURL(output).href)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestBody(init) {
  return JSON.parse(init.body)
}

test('fetchSummary reads the current summary endpoint and converts an unassigned feed', async () => {
  let requestedUrl
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return jsonResponse({
      categories: [],
      feeds: [{
        pk: 42,
        name: 'Example',
        url: 'https://example.test/feed',
        category_id: null,
        category: null,
        metadata: '{}',
        refresh_interval: 3600,
        last_refresh: null,
        next_poll_at: null,
        articles: []
      }]
    })
  }

  const follows = await adapter.fetchSummary()
  assert.equal(requestedUrl, '/tarang/v1/summary')
  assert.equal(follows['42'].category, undefined)
  assert.equal(follows['42'].title, 'Example')
  assert.deepEqual(follows['42'].posts, [])
})

test('addFollow sends null for an unassigned category', async () => {
  let request
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return jsonResponse({ id: 42, name: 'Example' })
  }

  assert.equal(await adapter.addFollow({ url: 'https://example.test/feed' }), '42')
  assert.equal(request.url, '/tarang/v1/feed')
  assert.equal(request.init.method, 'POST')
  assert.equal(requestBody(request.init).category_id, null)
})

test('addFollow creates the selected category before posting the feed', async () => {
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return url === '/tarang/v1/category/News'
      ? jsonResponse({ id: 7, name: 'News' })
      : jsonResponse({ id: 42, name: 'Example' })
  }

  await adapter.addFollow({ url: 'https://example.test/feed', category: 'News' })
  assert.deepEqual(requests.map(({ url }) => url), [
    '/tarang/v1/category/News',
    '/tarang/v1/feed'
  ])
  assert.equal(requestBody(requests[1].init).category_id, 7)
})

test('editFollow sends a selected category id', async () => {
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return url === '/tarang/v1/category/News'
      ? jsonResponse({ id: 7, name: 'News' })
      : jsonResponse({})
  }

  await adapter.editFollow('42', { category: 'News', importance: 1 })
  assert.deepEqual(requests.map(({ url }) => url), [
    '/tarang/v1/category/News',
    '/tarang/v1/feed/42'
  ])
  assert.equal(requests[1].init.method, 'PATCH')
  assert.equal(requestBody(requests[1].init).category_id, 7)
})

test('editFollow clears a category with null', async () => {
  let request
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return jsonResponse({})
  }

  await adapter.editFollow('42', { importance: 0 })
  assert.equal(request.url, '/tarang/v1/feed/42')
  assert.equal(requestBody(request.init).category_id, null)
})
