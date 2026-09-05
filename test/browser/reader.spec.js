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
    await route.fulfill(result === null ? { status: 503, body: 'Unavailable' } : { json: result })
  })
  return requests
}

async function openReader(page) {
  await page.goto('/#!/tag/Outdoors?importance=1')
  await page.getByRole('link', { name: 'Article 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
}

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
  await expect(page.getByText('Articles could not be refreshed.', { exact: false })).toBeVisible()
  current = summary([article(1)])
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
  current = summary([])
  const refreshed = page.waitForResponse('**/tarang/v1/summary')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await refreshed
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
