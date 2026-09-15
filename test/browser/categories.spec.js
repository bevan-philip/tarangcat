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
