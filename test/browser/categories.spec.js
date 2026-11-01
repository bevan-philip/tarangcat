import { test, expect } from '@playwright/test'

const categories = [{ pk: 7, name: 'News and essays' }, { pk: 8, name: '🌱' }]
const summary = (used = categories) => ({ categories: [...used, { pk: 99, name: 'Empty category' }],
  feeds: used.map(category => ({ pk: category.pk, name: category.name, url: `https://example.test/${category.pk}`,
    category, category_id: category.pk, refresh_interval: 300, articles: [] })) })

async function mockApi(page) {
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: summary() }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: summary().categories }))
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 409 }))
  await page.route('**/tarang/v1/feed/42', route => route.fulfill({ json: {
    id: 42, feed: { pk: 42, name: 'Example', url: 'https://example.test/feed',
      category_id: 7, refresh_interval: 300 }, articles: [],
  } }))
}

for (const mode of ['add', 'edit/42']) {
  test(`${mode} matches the tabs, excludes unused categories and saves the selection`, async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    const tabs = page.locator('#tags li a')
    await expect(tabs).toHaveText(['🏠', 'News and essays', '🌱'])
    const tabNames = await tabs.allTextContents()
    await page.goto(`/#!/${mode}`)
    const choices = page.getByRole('group', { name: 'Existing categories' })
    await expect(choices.getByRole('button')).toHaveText(tabNames)
    if (mode === 'add') await page.getByLabel('URL', { exact: true }).fill('https://example.test/feed')
    else await expect(choices.getByRole('button', { name: 'News and essays' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('Title', { exact: true }).fill('Unsaved title')
    await choices.getByRole('button', { name: 'News and essays' }).click()
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('News and essays')
    const emoji = choices.getByRole('button', { name: '🌱' })
    await emoji.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('🌱')
    await expect(emoji).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved title')
    await page.getByLabel('Category', { exact: true }).fill('New category')
    await expect(emoji).toHaveAttribute('aria-pressed', 'false')
    await page.getByLabel('Category', { exact: true }).fill('')
    await expect(choices.getByRole('button', { name: '🏠' })).toHaveAttribute('aria-pressed', 'true')
    await emoji.click()
    const endpoint = mode === 'add' ? '**/tarang/v1/feed' : '**/tarang/v1/feed/42'
    let saved
    if (mode === 'add') {
      await page.route('**/tarang/v1/feed/42', route => route.fulfill({ json: {
        id: 42, feed: { pk: 42, name: 'Unsaved title', url: 'https://example.test/feed',
          category_id: 8, refresh_interval: 300 }, articles: []
      } }))
    }
    await page.route(endpoint, route => {
      saved = route.request().postDataJSON()
      return route.fulfill({ json: { id: 42 } })
    })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/#!\/tag\/%F0%9F%8C%B1/)
    expect(saved.category_id).toBe(8)
    expect(saved.name).toBe('Unsaved title')
  })
}

test('category loading can fail and retry without losing the draft', async ({ page }) => {
  await mockApi(page)
  let fail = true
  await page.route('**/tarang/v1/summary', route => route.fulfill(fail ? { status: 503 } : { json: summary() }))
  await page.goto('/#!/add')
  await expect(page.getByRole('status')).toContainText('Categories could not be loaded')
  await page.getByLabel('Category', { exact: true }).fill('My category')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('group', { name: 'Existing categories' })).toBeVisible()
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('My category')
})

test('category choices wrap on a narrow screen in dark mode', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: summary([
    ...categories, { pk: 9, name: 'Art, culture and writing from around the world' },
    { pk: 10, name: '📚 Reading' }, { pk: 11, name: 'Technology' },
  ]) }))
  await page.goto('/#!/add')
  const choices = page.getByRole('group', { name: 'Existing categories' })
  await choices.getByRole('button', { name: '🌱' }).click()
  for (const button of await choices.getByRole('button').all()) {
    const box = await button.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  await choices.screenshot({ path: testInfo.outputPath('categories-dark-mobile.png') })
})

test('an empty feed list offers only Home and leaves the form available', async ({ page }) => {
  await mockApi(page)
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: summary([]) }))
  await page.goto('/#!/add')
  await expect(page.getByRole('status')).toHaveCount(0)
  const choices = page.getByRole('group', { name: 'Existing categories' })
  await expect(choices.getByRole('button')).toHaveText(['🏠'])
  await page.getByLabel('Category', { exact: true }).fill('First category')
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('First category')
  await choices.getByRole('button', { name: '🏠' }).click()
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('')
})

for (const mode of ['add', 'edit/42']) {
  test(`${mode} reuses loaded tab categories without another summary request`, async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.locator('#tags li a')).toHaveText(['🏠', 'News and essays', '🌱'])
    let requests = 0
    await page.route('**/tarang/v1/summary', route => {
      requests++
      return route.abort()
    })
    await page.evaluate(mode => { window.location.hash = `!/${mode}` }, mode)
    await expect(page.getByRole('group', { name: 'Existing categories' }).getByRole('button'))
      .toHaveText(['🏠', 'News and essays', '🌱'])
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(requests).toBe(0)
  })
}

test('feeds without a category are moved into the explicit Home category', async ({ page }) => {
  const home = { pk: 3, name: '🏠' }
  let feeds = [
    { pk: 1, name: 'Loose', url: 'https://example.test/1', category: null, category_id: null, refresh_interval: 300, articles: [] },
    { pk: 2, name: 'Sorted', url: 'https://example.test/2', category: categories[0], category_id: 7, refresh_interval: 300, articles: [] },
  ]
  const posts = []
  const patches = []
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: { categories: [...categories, home], feeds } }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [...categories, home] }))
  await page.route('**/tarang/v1/category/*', route => {
    posts.push(decodeURIComponent(route.request().url().split('/').pop()))
    return route.fulfill({ status: 409 })
  })
  await page.route('**/tarang/v1/feed/*', route => {
    const id = Number(route.request().url().split('/').pop())
    const body = route.request().postDataJSON()
    patches.push({ id, body })
    feeds = feeds.map(feed => feed.pk === id ? { ...feed, category: home, category_id: body.category_id } : feed)
    return route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await expect(page.locator('#tags li a')).toHaveText(['🏠', 'News and essays'])
  await expect.poll(() => patches).toEqual([{ id: 1, body: { category_id: 3 } }])
  expect(posts).toEqual(['🏠'])
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('link', { name: 'Loose' })).toBeVisible()
  expect(patches).toHaveLength(1)
})

async function mockHomeMove(page, feeds) {
  const home = { pk: 3, name: '🏠' }
  const all = [...categories, home]
  const patches = []
  const control = {}
  control.held = new Promise(resolve => { control.release = resolve })
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: { categories: all, feeds } }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: all }))
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 409 }))
  await page.route('**/tarang/v1/starred', route => route.fulfill({ json: [{ article_id: 9, feed_id: 1, feed_name: 'Loose',
    title: 'Saved article', url: 'https://example.test/9', summary: null, published_at: 1788566400,
    retrieved_at: 1788566400, is_read: true, is_starred: true }] }))
  await page.route('**/tarang/v1/feed/*', async route => {
    const id = Number(route.request().url().split('/').pop())
    const body = route.request().postDataJSON()
    patches.push({ id, body })
    if (id === 1 && body.category_id === home.pk) await control.held
    const category = all.find(category => category.pk === body.category_id)
    feeds.splice(0, feeds.length, ...feeds.map(feed => feed.pk === id ? { ...feed, category, category_id: category.pk } : feed))
    return route.fulfill({ status: 204 })
  })
  return { patches, control }
}

const looseFeeds = () => [1, 2].map(pk => ({ pk, name: pk === 1 ? 'Loose' : 'Also loose', url: `https://example.test/${pk}`,
  category: null, category_id: null, refresh_interval: 300, articles: [] }))

test('a feed moved by the user during the Home move keeps the user’s category', async ({ page }) => {
  const { patches, control } = await mockHomeMove(page, looseFeeds())
  await page.goto('/')
  await expect.poll(() => patches.length).toBe(1)
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await page.getByRole('checkbox', { name: /Also loose/ }).check()
  await page.getByLabel('Action', { exact: true }).selectOption('category')
  await page.getByLabel('Destination category').fill('News and essays')
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  control.release()
  await expect(page.getByRole('status')).toContainText('1 of 1 feeds updated')
  await page.locator('#tags').getByRole('link', { name: 'News and essays' }).click()
  await expect(page.getByRole('link', { name: 'Also loose' })).toBeVisible()
  expect(patches).toEqual([{ id: 1, body: { category_id: 3 } }, { id: 2, body: { category_id: 7 } }])
})

test('a route opened during the Home move loads when the move finishes', async ({ page }) => {
  const { patches, control } = await mockHomeMove(page, looseFeeds())
  await page.goto('/')
  await expect.poll(() => patches.length).toBe(1)
  await page.getByRole('link', { name: 'Starred articles' }).click()
  await expect(page.getByText('Loading starred articles')).toBeVisible()
  control.release()
  await expect(page.getByText('Saved article')).toBeVisible()
  expect(patches).toEqual([1, 2].map(id => ({ id, body: { category_id: 3 } })))
})
