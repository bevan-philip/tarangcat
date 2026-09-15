import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

async function mockApi(page) {
  const posts = [1, 99].map(pk => ({ pk, feed: 42, guid: String(pk), title: `Article ${pk}`,
    url: `https://example.test/posts/${pk}`, content: '<p>Cached article</p>', summary: null,
    published_at: 1788566400, retrieved_at: 1788566400, is_read: false, is_starred: pk === 99 }))
  const feed = { pk: 42, name: 'Field notes', url: 'https://example.test/feed',
    category: null, category_id: null, refresh_interval: 300 }
  const api = { posts, writes: [], failWrite: false, failStarred: false }
  await page.route('https://example.test/**', route => route.fulfill({ body: 'Original' }))
  await page.route('**/tarang/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/summary')) return route.fulfill({ json: { categories: [], feeds: [{ ...feed, articles: [posts[0]] }] } })
    if (path.endsWith('/starred')) return route.fulfill(api.failStarred ? { status: 503 } : { json: posts.filter(p => p.is_starred).map(({ pk, feed, content, guid, ...p }) => ({ ...p, article_id: pk, feed_id: feed, feed_name: 'Field notes' })) })
    if (path.includes('/feed/')) return route.fulfill({ json: { id: 42, feed, articles: [] } })
    const post = posts.find(p => String(p.pk) === path.split('/').pop())
    if (!post) return route.fulfill({ status: 404 })
    if (route.request().method() === 'PATCH') {
      const flags = route.request().postDataJSON()
      api.writes.push({ id: post.pk, flags })
      if (api.holdWrite) await api.holdWrite
      if (api.failWrite) return route.fulfill({ status: 503 })
      Object.assign(post, flags)
      return route.fulfill({ json: { pk: post.pk, is_read: post.is_read, is_starred: post.is_starred } })
    }
    const snapshot = { ...post }
    if (api.holdRead) await api.holdRead
    return route.fulfill({ json: snapshot })
  })
  return api
}

test('a fresh client renders backend read state in light and dark themes', async ({ page }) => {
  const api = await mockApi(page)
  api.posts[0].is_read = true
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    const link = page.getByRole('link', { name: 'Article 1', exact: true })
    await expect(link).toHaveClass(/is-read/)
    await expect(link).toHaveCSS('color', colorScheme === 'dark' ? 'rgb(170, 170, 170)' : 'rgb(170, 136, 68)')
  }
  expect(api.writes).toEqual([])
})

test('read state follows Tarang, survives reload, and refreshes changes from another client', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto('/')
  const link = page.getByRole('link', { name: 'Article 1', exact: true })
  await expect(link).not.toHaveClass(/is-read/)
  await link.click()
  await expect.poll(() => api.posts[0].is_read).toBe(true)
  await page.getByRole('link', { name: 'Back to feeds', exact: false }).click()
  await expect(link).toHaveClass(/is-read/)
  await page.reload()
  await expect(link).toHaveClass(/is-read/)
  api.posts[0].is_read = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(link).not.toHaveClass(/is-read/)
  await expect(link).toHaveCSS('color', 'rgb(102, 34, 0)')
})

test('stars from feeds and reader, opens older saved articles and returns to saved list', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Star Article 1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unstar Article 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(api.posts[0].is_read).toBe(false)
  await page.getByRole('link', { name: 'Starred articles', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Article 99', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Article 99', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Article 99', exact: true })).toBeVisible()
  await expect.poll(() => api.posts[1].is_read).toBe(true)
  await page.getByRole('button', { name: 'Unstar Article 99', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Star Article 99', exact: true })).toBeEnabled()
  await page.getByRole('link', { name: 'Back to starred articles', exact: false }).click()
  await expect(page.getByRole('link', { name: 'Article 99', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Unstar Article 1', exact: true }).click()
  await expect(page.getByText('Star an article to keep it here.')).toBeVisible()
})

test('failed writes keep confirmed state and can be retried without blocking reading', async ({ page }) => {
  const api = await mockApi(page)
  api.failWrite = true
  await page.goto('/#!/view/1')
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Could not mark this article as read.')
  api.failWrite = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => api.posts[0].is_read).toBe(true)
  api.failWrite = true
  await page.getByRole('button', { name: 'Star Article 1', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save this article’s star.')
  await expect(page.getByRole('button', { name: 'Star Article 1', exact: true })).toHaveAttribute('aria-pressed', 'false')
  api.failWrite = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Unstar Article 1', exact: true })).toBeEnabled()
})

test('queues read after an in-flight star and prevents refresh from overwriting the result', async ({ page }) => {
  const api = await mockApi(page)
  let release
  api.holdWrite = new Promise(resolve => { release = resolve })
  await page.goto('/')
  await page.getByRole('button', { name: 'Star Article 1', exact: true }).click()
  await expect.poll(() => api.writes.length).toBe(1)
  await page.getByRole('link', { name: 'Article 1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Article 1', exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  release()
  await expect.poll(() => api.posts[0].is_read && api.posts[0].is_starred).toBe(true)
  await expect(page.getByRole('button', { name: 'Unstar Article 1', exact: true })).toBeEnabled()
  expect(api.writes.map(w => w.flags)).toEqual([{ is_starred: true }, { is_read: true }])
})

test('saved list retries failures and fits narrow screens in both themes', async ({ page }, testInfo) => {
  const api = await mockApi(page)
  api.failStarred = true
  await page.goto('/#!/starred')
  await expect(page.getByRole('alert')).toBeVisible()
  api.failStarred = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: 'Article 99', exact: true })).toBeVisible()
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`starred-${width}-${colorScheme}.png`) })
    }
  }
})

test('a delayed reader response preserves a star confirmed while it was loading', async ({ page }) => {
  const api = await mockApi(page)
  let releaseWrite, releaseRead
  api.holdWrite = new Promise(resolve => { releaseWrite = resolve })
  api.holdRead = new Promise(resolve => { releaseRead = resolve })
  await page.goto('/')
  await page.getByRole('button', { name: 'Star Article 1', exact: true }).click()
  await expect.poll(() => api.writes.length).toBe(1)
  const requested = page.waitForRequest(request => request.url().endsWith('/article/1') && request.method() === 'GET')
  await page.getByRole('link', { name: 'Article 1', exact: true }).click()
  await requested
  releaseWrite()
  await expect.poll(() => api.posts[0].is_starred).toBe(true)
  releaseRead()
  await expect(page.getByRole('button', { name: 'Unstar Article 1', exact: true })).toBeEnabled()
  await expect.poll(() => api.posts[0].is_read).toBe(true)
})

test('modifier and middle clicks mark articles read while keeping native external navigation', async ({ page, context }, testInfo) => {
  const api = await mockApi(page)
  const source = new URL('/state-original.html', testInfo.project.use.baseURL)
  source.hostname = 'localhost'
  api.posts[0].url = source.href
  await writeFile('dist/state-original.html', '<h1>Original</h1>')
  await page.goto('/')
  for (const options of [{ modifiers: ['ControlOrMeta'] }, { button: 'middle' }]) {
    api.posts[0].is_read = false
    await page.reload()
    const popup = context.waitForEvent('page')
    await page.getByRole('link', { name: 'Article 1', exact: true }).click(options)
    const original = await popup
    await expect(original).toHaveURL(source.href)
    await expect.poll(() => api.posts[0].is_read).toBe(true)
    await expect(page.locator('#follows')).toBeVisible()
    await original.close()
  }
})
