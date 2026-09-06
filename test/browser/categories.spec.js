import { test, expect } from '@playwright/test'

const categories = [{ pk: 7, name: 'News and essays' }, { pk: 8, name: '🌱' }]

async function mockApi(page) {
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: { categories, feeds: [] } }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: categories }))
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 409 }))
  await page.route('**/tarang/v1/feed/42', route => route.fulfill({ json: {
    id: 42, feed: { pk: 42, name: 'Example', url: 'https://example.test/feed',
      category_id: 7, refresh_interval: 300 }, articles: [],
  } }))
}

for (const mode of ['add', 'edit/42']) {
  test(`${mode} offers unused named and emoji categories and saves the selection`, async ({ page }) => {
    await mockApi(page)
    await page.goto(`/#!/${mode}`)
    const choices = page.getByRole('group', { name: 'Existing categories' })
    await expect(choices.getByRole('button')).toHaveCount(2)
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
    await expect(choices.getByRole('button', { pressed: true })).toHaveCount(0)
    await emoji.click()
    const endpoint = mode === 'add' ? '**/tarang/v1/feed' : '**/tarang/v1/feed/42'
    let saved
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
  await page.route('**/tarang/v1/category', route => route.fulfill(fail ? { status: 503 } : { json: categories }))
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
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [
    ...categories, { pk: 9, name: 'Art, culture and writing from around the world' },
    { pk: 10, name: '📚 Reading' }, { pk: 11, name: 'Technology' },
  ] }))
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

test('an empty category list leaves the form available', async ({ page }) => {
  await mockApi(page)
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [] }))
  await page.goto('/#!/add')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Existing categories' })).toHaveCount(0)
  await page.getByLabel('Category', { exact: true }).fill('First category')
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('First category')
})
