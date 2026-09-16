import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const content = `<section><p>A quiet place to read the articles already saved by Tarang.</p>
  <h2 id="landscape">Across the landscape</h2>
  <p>Cached writing preserves <strong>emphasis</strong>, <em>italics</em>, and <a href="/notes">relative links</a>.</p>
  <figure><img src="/landscape.png" alt="A mountain landscape"><figcaption>A view from the path.</figcaption></figure>
  <blockquote><p>Take enough time to notice the details.</p></blockquote>
  <ul><li>One trail</li><li>Another trail</li></ul>
  <pre><code>const articles = await fetchSummary()</code></pre>
  <table><thead><tr><th>Place</th><th>Distance</th></tr></thead><tbody><tr><td>Ridge</td><td>12 km</td></tr></tbody></table>
  <p><a href="#landscape">Return to heading</a></p></section>`

function article(pk, overrides = {}) {
  return { pk, feed: 42, guid: String(pk), title: `Article ${pk}`, url: `https://example.test/posts/${pk}`,
    content, summary: null, published_at: 1788566400, retrieved_at: 1788566400, ...overrides }
}
function summary(articles) {
  return { categories: [{ pk: 7, name: 'Outdoors' }], feeds: [{ pk: 42, name: 'Field notes',
    url: 'https://example.test/feed', category: { pk: 7, name: 'Outdoors' }, category_id: 7,
    refresh_interval: 3600, articles }] }
}

async function mockApi(page, getSummary = () => summary([article(1), article(2)])) {
  const requests = []
  await page.route('https://example.test/**', route => {
    requests.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600"><rect width="1600" height="600" fill="#d3e1e4"/><path d="M0 600L500 80L900 600ZM600 600L1150 160L1600 600Z" fill="#7d9490"/></svg>' })
  })
  await page.route('**/tarang/v1/summary', async route => {
    const result = getSummary()
    const preview = result && { ...result, feeds: result.feeds.map(feed => ({ ...feed,
      articles: feed.articles.map(({ content, guid, ...article }) => ({ ...article, is_read: false, is_starred: false })) })) }
    await route.fulfill(preview === null ? { status: 503, body: 'Unavailable' } : { json: preview })
  })
  await page.route('**/tarang/v1/article/*', async route => {
    const result = getSummary()
    const id = Number(route.request().url().split('/').pop())
    const post = result?.feeds.flatMap(feed => feed.articles).find(post => post.pk === id)
    await route.fulfill(result === null ? { status: 503 } : post ? { json: post } : { status: 404 })
  })
  await page.route('**/tarang/v1/feed/*', async route => {
    const result = getSummary()
    const feed = result?.feeds.find(feed => feed.pk === Number(route.request().url().split('/').pop()))
    await route.fulfill(feed ? { json: { id: feed.pk, feed, articles: [] } } : { status: 404 })
  })
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: getSummary()?.categories || [] }))
  return requests
}

async function openReader(page) {
  await page.goto('/#!/tag/Outdoors?importance=1')
  await page.getByRole('link', { name: 'Article 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
}

test('titleless feed entries use safe, bounded summary or content excerpts', async ({ page }) => {
  const details = []
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().includes('/tarang/v1/article/')) details.push(request.url().split('/').pop())
  })
  await mockApi(page, () => summary([
    article(1, { title: null, summary: '<p>Summary &amp; <strong>formatting</strong></p><p>Second paragraph.</p><script>window.injected = true</script>' }),
    article(2, { title: ' \t ', summary: null, content: '<p>Content-only fallback.</p>' }),
    article(3, { title: '', summary: '<p>' + 'Long excerpt '.repeat(30) + '</p>' }),
    article(4, { title: null, summary: null, content: '' }),
    article(5, { summary: '<p>Do not replace a supplied title.</p>' }),
  ]))
  await page.goto('/#!/tag/Outdoors?importance=1')
  const links = page.locator('#follows .article-link')
  const link = id => page.locator(`#follows .article-link[href="https://example.test/posts/${id}"]`)
  await expect(links).toHaveCount(5)
  await expect(link(1)).toHaveText('Summary & formatting Second paragraph.')
  await expect(link(2)).toHaveText('Content-only fallback.')
  expect((await link(3).textContent()).length).toBeLessThanOrEqual(160)
  await expect(link(3)).toContainText('…')
  await expect(link(4)).toHaveText('(untitled)')
  await expect(link(5)).toHaveText('Article 5')
  await expect(links.locator('strong, script, p')).toHaveCount(0)
  expect(await page.evaluate(() => window.injected)).toBeUndefined()
  expect(details.sort()).toEqual(['2', '4'])
  await link(2).click()
  await expect(page).toHaveURL(/#!\/view\/2$/)
  await expect(page.locator('.reader-content')).toContainText('Content-only fallback.')
})

test('opens cached content, preserves formatting, and returns to the same category', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const requests = await mockApi(page)
  await openReader(page)
  await expect(page).toHaveURL(/#!\/view\/1$/)
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeFocused()
  await expect(page.locator('.reader-content strong')).toHaveText('emphasis')
  await expect(page.locator('.reader-content pre code')).toContainText('fetchSummary')
  await expect(page.getByRole('link', { name: 'relative links' })).toHaveAttribute('href', 'https://example.test/notes')
  await expect(page.getByRole('img', { name: 'A mountain landscape' })).toHaveAttribute('src', 'https://example.test/landscape.png')
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', 'https://example.test/posts/1')
  await page.getByRole('link', { name: 'Return to heading' }).click()
  await expect(page).toHaveURL(/#!\/view\/1$/)
  await expect(page.getByRole('heading', { name: 'Across the landscape' })).toBeFocused()
  expect(requests.filter(url => url.includes('/posts/'))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#!\/tag\/Outdoors\?importance=1$/)
  await expect(page.locator('.reader-content')).toHaveCount(0)
  await page.getByRole('link', { name: 'Article 2', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Article 2', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.locator('#follows')).toBeVisible()
  expect(errors).toEqual([])
})

test('middle-click and modifier-click open the original while Enter opens the reader', async ({ page, context }, testInfo) => {
  // Serve the original from another origin so native tab navigation needs no popup interception.
  const source = new URL('/original-article.html', testInfo.project.use.baseURL)
  source.hostname = 'localhost'
  const originalUrl = source.href
  await writeFile('dist/original-article.html', '<h1>Original article</h1>')
  await mockApi(page, () => summary([article(1, { url: originalUrl })]))
  await page.goto('/#!/tag/Outdoors?importance=1')
  const link = page.getByRole('link', { name: 'Article 1', exact: true })
  await expect(link).toHaveAttribute('href', originalUrl)
  for (const options of [{ button: 'middle' }, { modifiers: ['ControlOrMeta'] }]) {
    const opened = context.waitForEvent('page')
    await link.click(options)
    const original = await opened
    await expect(original).toHaveURL(originalUrl)
    await expect(original.getByRole('heading', { name: 'Original article' })).toBeVisible()
    await expect(page).toHaveURL(/#!\/tag\/Outdoors\?importance=1$/)
    await expect(page.locator('.reader-content')).toHaveCount(0)
    await original.close()
  }
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#!\/view\/1$/)
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
})

test('loads every font from local assets and persists reading preferences', async ({ page }) => {
  await mockApi(page)
  await openReader(page)
  for (const [value, family] of [['serif', 'Reader Plex'], ['sans', 'Reader Inter'], ['mono', 'Reader Duo']]) {
    await page.getByLabel('Reader font').selectOption(value)
    await expect(page.locator('.reader-content')).toHaveCSS('font-family', new RegExp(family))
    expect(await page.evaluate(async family => {
      const faces = await document.fonts.load(`20px "${family}"`)
      return faces.length > 0 && faces.every(face => face.status === 'loaded')
    }, family)).toBe(true)
    for (const style of ['italic', 'bold', 'bold italic']) {
      expect(await page.evaluate(async ({ family, style }) => {
        const faces = await document.fonts.load(`${style} 20px "${family}"`)
        return faces.length > 0 && faces.every(face => face.status === 'loaded')
      }, { family, style })).toBe(true)
    }
  }
  await page.getByLabel('Reader text size').selectOption('large')
  await page.getByLabel('Reader appearance').selectOption('dark')
  await page.reload()
  await expect(page.getByLabel('Reader font')).toHaveValue('mono')
  await expect(page.getByLabel('Reader text size')).toHaveValue('large')
  await expect(page.getByLabel('Reader appearance')).toHaveValue('dark')
  await expect(page.locator('.reader-content')).toHaveCSS('font-size', '24px')
  await expect(page.locator('.reader-shell')).toHaveCSS('background-color', 'rgb(28, 29, 32)')
  await page.getByLabel('Reader appearance').selectOption('auto')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('.reader-shell')).toHaveCSS('background-color', 'rgb(250, 249, 246)')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('.reader-shell')).toHaveCSS('background-color', 'rgb(28, 29, 32)')
})

test('handles summary-only, empty, unsafe, and unknown articles', async ({ page }) => {
  await mockApi(page, () => summary([
    article(1, { content: ' ', summary: '<p>Cached summary text.</p>' }),
    article(2, { content: '<script>window.injected = true</script>', summary: null }),
    article(3, { url: 'javascript:alert(1)', content: '<p>Readable content</p>' }),
  ]))
  await page.goto('/#!/view/1')
  await expect(page.getByText('Only a summary is available in the cache.')).toBeVisible()
  await expect(page.getByText('Cached summary text.')).toBeVisible()
  await page.goto('/#!/view/2')
  await expect(page.getByText('No cached content is available', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => window.injected)).toBeUndefined()
  await page.goto('/#!/view/3')
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveCount(0)
  await page.goto('/#!/view/999')
  await expect(page.getByRole('heading', { name: 'Article unavailable' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to feeds', exact: false })).toBeVisible()
})

test('removes scripts, event handlers, unsafe URLs, embeds, publisher styles, and clobbering IDs', async ({ page }) => {
  const unsafe = `<style>body { display:none }</style><script>window.injected = true</script>
    <p id="fraidy" class="reader-toolbar" style="position:fixed" onclick="window.injected=true">Safe paragraph</p>
    <img src="javascript:alert(1)" onerror="window.injected=true" alt="bad image">
    <a href="java&#x0a;script:alert(1)">Bad link</a><a href="data:text/html,hello">Data link</a>
    <iframe src="https://example.test/embed"></iframe><form action="https://example.test/write"><input name="settings"></form>
    <svg onload="window.injected=true"><a href="javascript:alert(1)">svg</a></svg>
    <p id="reader-content-0">Collision</p><p id="fraidy">Duplicate</p><a href="#fraidy">Footnote</a>`
  await mockApi(page, () => summary([article(1, { content: unsafe })]))
  await page.goto('/#!/view/1')
  await expect(page.getByText('Safe paragraph', { exact: true })).toBeVisible()
  await expect(page.locator('.reader-content script, .reader-content style, .reader-content iframe, .reader-content form, .reader-content input, .reader-content svg')).toHaveCount(0)
  await expect(page.locator('.reader-content [onclick], .reader-content [onerror], .reader-content [style], .reader-content [class]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Bad link', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Data link', exact: true })).toHaveCount(0)
  await expect(page.locator('#fraidy')).toHaveCount(1)
  expect(await page.locator('.reader-content [id]').evaluateAll(elements => new Set(elements.map(el => el.id)).size === elements.length)).toBe(true)
  await page.getByRole('link', { name: 'Footnote' }).click()
  await expect(page.getByText('Safe paragraph', { exact: true })).toBeFocused()
  expect(await page.evaluate(() => window.injected)).toBeUndefined()
})

test('keeps the open article stable across refresh and recovers from initial API failure', async ({ page }) => {
  let current = null
  await mockApi(page, () => current)
  await page.goto('/#!/view/1')
  await expect(page.getByText('The article could not be loaded.', { exact: false })).toBeVisible()
  current = summary([article(1)])
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
  current = summary([])
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to feeds', exact: false }).click()
  await expect(page.locator('#follows')).toBeVisible()
  await page.goto('/#!/view/1')
  await expect(page.getByRole('heading', { name: 'Article unavailable' })).toBeVisible()
})

test('reader works when local storage is malformed or blocked', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => localStorage.setItem('tarangcat.settings', 'null'))
  await page.goto('/#!/view/1')
  await expect(page.getByLabel('Reader font')).toHaveValue('serif')
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable') }
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable') }
  })
  await page.getByLabel('Reader font').selectOption('sans')
  await expect(page.locator('.reader-content')).toHaveCSS('font-family', /Reader Inter/)
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
})

for (const width of [320, 390, 1280]) {
  test(`reader fits ${width}px viewport including large text and wide content`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await mockApi(page, () => summary([article(1, { title: 'A walk along the ridge',
      content: content + '<pre>' + 'wide_code_'.repeat(40) + '</pre>' })]))
    await page.goto('/#!/view/1')
    await page.getByLabel('Reader text size').selectOption('large')
    await expect(page.locator('.reader-content')).toBeVisible()
    expect(await page.getByRole('img', { name: 'A mountain landscape' }).evaluate(img => img.clientWidth <= img.parentElement.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`reader-${width}.png`), fullPage: true })
  })
}

test('edit bookmark loads and saves feed metadata without requesting a summary until leaving', async ({ page }) => {
  const requests = []
  page.on('request', req => { if (req.url().includes('/tarang/v1/')) requests.push(req.url().split('/tarang/v1/')[1]) })
  await mockApi(page)
  let saved
  await page.route('**/tarang/v1/feed/42', async route => {
    if (route.request().method() === 'PATCH') {
      saved = route.request().postDataJSON()
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: { id: 42, feed: { pk: 42, name: 'Fresh title',
      url: 'https://example.test/feed', category_id: null, refresh_interval: 3600 }, articles: [] } })
  })
  await page.goto('/#!/edit/42')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fresh title')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByLabel('Title', { exact: true }).fill('Changed title')
  expect(requests).toEqual(['feed/42', 'category'])
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('#follows')).toBeVisible()
  await expect.poll(() => requests.includes('summary')).toBe(true)
  expect(saved.name).toBe('Changed title')
})

test('reader bookmark resolves an older article without a summary request', async ({ page }) => {
  const requests = []
  page.on('request', req => { if (req.url().includes('/tarang/v1/')) requests.push(req.url().split('/tarang/v1/')[1]) })
  await mockApi(page, () => summary([]))
  await page.route('**/tarang/v1/article/99', route => route.fulfill({ json: article(99) }))
  await page.goto('/#!/view/99')
  await expect(page.getByRole('heading', { name: 'Article 99', exact: true })).toBeVisible()
  await expect(page.locator('.reader-content strong')).toHaveText('emphasis')
  expect(requests).toEqual(['article/99', 'feed/42', 'category', 'article/99'])
})

test('edit load failures can be retried', async ({ page }) => {
  await mockApi(page)
  let status = 503
  await page.route('**/tarang/v1/feed/42', route => route.fulfill({ status }))
  await page.goto('/#!/edit/42')
  await expect(page.getByRole('alert')).toHaveText('The feed could not be loaded. Try again.')
  status = 404
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toHaveText('This feed is no longer available in Tarang.')
  await page.unroute('**/tarang/v1/feed/42')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Field notes')
})

test('late article responses cannot replace the current reader', async ({ page }) => {
  await mockApi(page)
  let release
  const held = new Promise(resolve => { release = resolve })
  let requested
  const started = new Promise(resolve => { requested = resolve })
  await page.route('**/tarang/v1/article/1', async route => {
    requested()
    await held
    await route.fulfill({ json: article(1) })
  })
  await page.goto('/#!/view/1')
  await started
  await expect(page.getByRole('heading', { name: 'Loading article…' })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '!/view/2' })
  await expect(page.getByRole('heading', { name: 'Article 2', exact: true })).toBeVisible()
  const completed = page.waitForResponse('**/tarang/v1/article/1')
  release()
  await completed
  await page.getByLabel('Reader text size').selectOption('large')
  await expect(page.getByRole('heading', { name: 'Article 2', exact: true })).toBeVisible()
})

test('late feed responses cannot replace a newly opened edit form', async ({ page }) => {
  await mockApi(page)
  let release
  const held = new Promise(resolve => { release = resolve })
  let requested
  const started = new Promise(resolve => { requested = resolve })
  await page.route('**/tarang/v1/feed/41', async route => {
    requested()
    await held
    await route.fulfill({ json: { id: 41, feed: { pk: 41, name: 'Old feed',
      url: 'https://example.test/old', category_id: null, refresh_interval: 300 }, articles: [] } })
  })
  await page.goto('/#!/edit/41')
  await started
  await page.evaluate(() => { window.location.hash = '!/edit/42' })
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Field notes')
  await page.getByLabel('Title', { exact: true }).fill('Unsaved change')
  const completed = page.waitForResponse('**/tarang/v1/feed/41')
  release()
  await completed
  await page.getByLabel('Category', { exact: true }).fill('New category')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved change')
})
