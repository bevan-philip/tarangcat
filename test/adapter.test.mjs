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

test('bulk category preparation resolves once and patches only the category', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    if (init.method === 'POST') return jsonResponse({ id: 12 })
    return new Response(null, { status: 204 })
  }
  const update = await adapter.prepareFollowUpdate({ category: ' New category ' })
  await update('1')
  await update('2')
  assert.equal(calls[0].url, '/tarang/v1/category/New%20category')
  assert.equal(calls.length, 3)
  for (const call of calls.slice(1)) assert.deepEqual(requestBody(call.init), { category_id: 12 })
})

test('starred previews use article_id rather than feed_id and preserve server state', async () => {
  globalThis.fetch = async url => {
    assert.equal(url, '/tarang/v1/starred')
    return jsonResponse([{ article_id: 99, feed_id: 42, feed_name: 'Notes', title: null,
      url: 'https://example.test/old', summary: 'Summary', published_at: null,
      retrieved_at: 123, is_read: true, is_starred: true }])
  }
  const [post] = await adapter.fetchStarred()
  assert.equal(post.id, '99')
  assert.equal(post.feedTitle, 'Notes')
  assert.equal(post.title, '(untitled)')
  assert.equal(post.publishedAt.getTime(), 123000)
  assert.equal(post.isRead, true)
  assert.equal(post.isStarred, true)
  assert.equal(post.content, '')
})

test('article PATCH sends only supplied flags, including false, and propagates errors', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/tarang/v1/article/99')
    assert.equal(init.method, 'PATCH')
    assert.deepEqual(requestBody(init), { is_starred: false })
    return jsonResponse({ pk: 99, is_read: true, is_starred: false })
  }
  assert.deepEqual(await adapter.updateArticleState('99', { is_starred: false }), { pk: 99, is_read: true, is_starred: false })
  globalThis.fetch = async () => jsonResponse({ error: 'Unavailable' }, 503)
  await assert.rejects(adapter.updateArticleState('99', { is_read: true }), { status: 503 })
})

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

test('fetchSummary converts previews without full content or GUIDs', async () => {
  globalThis.fetch = async () => jsonResponse({ categories: [], feeds: [{
    pk: 42, name: 'Example', url: 'https://example.test/feed', category: null,
    refresh_interval: 300, articles: [{
      pk: 9, url: 'https://example.test/article', title: null,
      is_read: false, is_starred: true, summary: '<p>Summary</p>',
      published_at: null, retrieved_at: 1700000000,
    }, {
      pk: 10, url: 'https://example.test/empty', title: '',
      is_read: true, is_starred: false, summary: null, published_at: 1700000001, retrieved_at: 1700000002,
    }],
  }] })
  const follows = await adapter.fetchSummary()
  const [full, empty] = follows['42'].posts
  assert.equal(follows['42'].fetchesContent, true)
  assert.equal(full.content, '')
  assert.equal(full.summary, '<p>Summary</p>')
  assert.equal(full.title, '(untitled)')
  assert.equal(full.publishedAt.getTime(), 1700000000000)
  assert.equal(empty.content, '')
  assert.equal(empty.summary, null)
  assert.equal(empty.publishedAt.getTime(), 1700000001000)
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

test('fetchArticle loads full content directly with the feed id', async () => {
  const requests = []
  globalThis.fetch = async url => {
    requests.push(url)
    return jsonResponse({ pk: 9, feed: 42, title: 'Older article', url: 'https://example.test/9',
      guid: 'nine', content: '<p>Full content</p>', summary: null, published_at: null, retrieved_at: 1700000000,
      is_read: false, is_starred: true })
  }
  const result = await adapter.fetchArticle('9')
  assert.deepEqual(requests, ['/tarang/v1/article/9'])
  assert.equal(result.feedId, '42')
  assert.equal(result.post.content, '<p>Full content</p>')
  assert.equal(result.post.publishedAt.getTime(), 1700000000000)
})

test('fetchFollow uses feed metadata and category lookup without the summary', async () => {
  const requests = []
  globalThis.fetch = async url => {
    requests.push(url)
    return jsonResponse(url.endsWith('/category') ? [{ pk: 7, name: 'News' }] : {
      id: 42, feed: { pk: 42, name: 'Fresh name', url: 'https://example.test/feed', category_id: 7,
        refresh_interval: 21600 }, articles: [{ pk: 9 }] })
  }
  const follow = await adapter.fetchFollow('42')
  assert.deepEqual(requests, ['/tarang/v1/feed/42', '/tarang/v1/category'])
  assert.equal(follow.title, 'Fresh name')
  assert.equal(follow.category, 'News')
  assert.equal(follow.importance, 7)
  assert.deepEqual(follow.posts, [])
})

test('fetchFollow skips category requests for unassigned feeds', async () => {
  const requests = []
  globalThis.fetch = async url => {
    requests.push(url)
    return jsonResponse({ id: 42, feed: { pk: 42, name: 'Example', url: 'https://example.test/feed',
      category_id: null, refresh_interval: 300 }, articles: [] })
  }
  assert.equal((await adapter.fetchFollow('42')).category, undefined)
  assert.deepEqual(requests, ['/tarang/v1/feed/42'])
})
