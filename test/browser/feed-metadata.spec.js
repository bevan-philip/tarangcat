import { test, expect } from '@playwright/test'

const subscriptionUrl = 'https://example.test/feed.xml'
const websiteUrl = 'https://example.test/site'

function feed(overrides = {}) {
  return {
    pk: 42,
    name: 'Detected title',
    url: subscriptionUrl,
    display_url: websiteUrl,
    category_id: null,
    category: null,
    refresh_interval: 300,
    articles: [],
    ...overrides
  }
}

function detail(current) {
  return { id: current.pk, feed: { ...current }, articles: [] }
}

test('discovery-based add uses Tarang metadata and automatic titles', async ({ page }) => {
  let created = false
  let postBody
  let current = feed()

  await page.route('**/tarang/v1/summary', route => route.fulfill({
    json: { categories: [], feeds: created ? [current] : [] }
  }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [] }))
  await page.route('**/tarang/v1/feed', route => {
    postBody = route.request().postDataJSON()
    created = true
    return route.fulfill({ json: { id: current.pk, name: current.name } })
  })
  await page.route('**/tarang/v1/feed/42', route => route.fulfill({ json: detail(current) }))

  await page.goto('/#!/add')
  await expect(page.locator('#add-feed .note').filter({ hasText: 'Tarang discovers the feed automatically.' }).last()).toBeVisible()
  await page.getByLabel('URL', { exact: true }).fill('https://example.test/homepage')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.locator('a.url')).toHaveText('Detected title')
  await expect(page.locator('a.url')).toHaveAttribute('href', websiteUrl)
  expect(postBody).toEqual({
    url: 'https://example.test/homepage',
    discovery: true,
    refresh_interval: 300,
    category_id: null
  })
})

test('editing and clearing the website URL preserves the subscription URL', async ({ page }) => {
  let current = feed()
  const patches = []

  await page.route('**/tarang/v1/summary', route => route.fulfill({
    json: { categories: [], feeds: [current] }
  }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [] }))
  await page.route('**/tarang/v1/feed/42', route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      patches.push(body)
      current = { ...current, display_url: body.display_url }
      return route.fulfill({ json: detail(current) })
    }
    return route.fulfill({ json: detail(current) })
  })

  await page.goto('/#!/edit/42')
  await expect(page.getByLabel('Website URL', { exact: true })).toHaveValue(websiteUrl)
  await expect(page.getByText(subscriptionUrl, { exact: true })).toBeVisible()

  const editedWebsite = 'https://example.test/edited-site'
  await page.getByLabel('Website URL', { exact: true }).fill(editedWebsite)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('a.url')).toHaveAttribute('href', editedWebsite)

  await page.goto('/#!/edit/42')
  await expect(page.getByLabel('Website URL', { exact: true })).toHaveValue(editedWebsite)
  await page.getByLabel('Website URL', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('a.url')).toHaveAttribute('href', subscriptionUrl)
  await page.reload()
  await expect(page.locator('a.url')).toHaveAttribute('href', subscriptionUrl)

  expect(patches.map(patch => patch.display_url)).toEqual([editedWebsite, ''])
  expect(patches.every(patch => !('url' in patch))).toBe(true)
})

test('a discovery error is shown and leaves the add form usable', async ({ page }) => {
  let message
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: { categories: [], feeds: [] } }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: [] }))
  await page.route('**/tarang/v1/feed', route => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'could not discover a feed for https://example.test/homepage' })
  }))

  page.once('dialog', async dialog => {
    message = dialog.message()
    await dialog.accept()
  })
  await page.goto('/#!/add')
  const url = page.getByLabel('URL', { exact: true })
  await url.fill('https://example.test/homepage')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect.poll(() => message).toBe('could not discover a feed for https://example.test/homepage')
  await expect(url).toBeEnabled()
  await expect(url).toHaveValue('https://example.test/homepage')
})
