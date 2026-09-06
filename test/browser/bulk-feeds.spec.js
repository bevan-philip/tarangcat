import { test, expect } from '@playwright/test'

async function setup(page) {
  const categories = [{ pk: 7, name: 'News' }, { pk: 8, name: '🌱' }]
  let feeds = [
    { pk: 1, name: 'First', category: categories[0], refresh_interval: 300 },
    { pk: 2, name: 'Second', category: categories[0], refresh_interval: 300 },
    { pk: 5, name: 'Rare feed', category: categories[0], refresh_interval: 86400 },
    { pk: 3, name: 'Outside', category: categories[1], refresh_interval: 300 },
    { pk: 4, name: 'Home feed', category: null, refresh_interval: 300 },
  ].map(feed => ({ ...feed, url: `https://example.test/${feed.pk}`, articles: [] }))
  const calls = []
  const control = { fail: 0, delay: null }
  await page.route('**/tarang/v1/summary', route => route.fulfill({ json: { feeds, categories } }))
  await page.route('**/tarang/v1/category', route => route.fulfill({ json: categories }))
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 409 }))
  await page.route('**/tarang/v1/feed/*', async route => {
    const id = Number(route.request().url().split('/').pop())
    const method = route.request().method()
    const body = method === 'PATCH' ? route.request().postDataJSON() : null
    calls.push({ id, method, body })
    if (control.delay) await control.delay
    if (control.fail === id) return route.fulfill({ status: 503 })
    if (method === 'DELETE') feeds = feeds.filter(feed => feed.pk !== id)
    else {
      const feed = feeds.find(feed => feed.pk === id)
      if ('refresh_interval' in body) feed.refresh_interval = body.refresh_interval
      if ('category_id' in body) feed.category = categories.find(category => category.pk === body.category_id) || null
    }
    return route.fulfill({ status: 204 })
  })
  await page.goto('/#!/tag/News')
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  return { calls, control }
}

test('updates only visible feeds, keeps failures selected, and retries only failures', async ({ page }) => {
  const { calls, control } = await setup(page)
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Apply to selected feeds' })).toBeDisabled()
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.getByLabel('Importance', { exact: true }).selectOption('7')
  control.fail = 2
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('1 of 2 feeds updated')
  await expect(page.getByRole('checkbox', { name: /Second/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /First/ })).toHaveCount(0)
  expect(calls).toEqual([1, 2].map(id => ({ id, method: 'PATCH', body: { refresh_interval: 21600 } })))
  control.fail = 0
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('1 of 1 feeds updated')
  expect(calls.map(call => call.id)).toEqual([1, 2, 2])
})

test('moves selected feeds to an existing category and Home without changing importance', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('checkbox', { name: /First/ }).check()
  await page.getByLabel('Action', { exact: true }).selectOption('category')
  await page.getByLabel('Destination category').fill('🌱')
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('1 of 1 feeds updated')
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.getByLabel('Destination category').fill('')
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  expect(calls).toEqual([
    { id: 1, method: 'PATCH', body: { category_id: 8 } },
    { id: 2, method: 'PATCH', body: { category_id: null } },
  ])
})

test('deletion requires confirmation and navigation clears selection', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.getByLabel('Action', { exact: true }).selectOption('delete')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete selected feeds' }).click()
  expect(calls).toHaveLength(0)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('2 of 2 feeds updated')
  expect(calls.map(call => call.method)).toEqual(['DELETE', 'DELETE'])
  await page.locator('#tags').getByRole('link', { name: '🌱', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Manage feeds' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await expect(page.getByRole('checkbox', { name: /Outside/ })).not.toBeChecked()
})

test('pending writes disable repeat submission and panel fits mobile dark mode', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { control, calls } = await setup(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.getByLabel('Action', { exact: true }).selectOption('category')
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  let release
  control.delay = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('button', { name: 'Apply to selected feeds' })).toBeDisabled()
  await expect(page.getByRole('checkbox').first()).toBeDisabled()
  const box = await page.locator('#bulk-panel').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.locator('#follows').screenshot({ path: testInfo.outputPath('bulk-mobile.png') })
  release()
  await expect(page.getByRole('status')).toContainText('2 of 2 feeds updated')
  expect(calls).toHaveLength(2)
})

test('closing a pending panel prevents overlapping batches and preserves completed writes', async ({ page }) => {
  const { control, calls } = await setup(page)
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  let release
  control.delay = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('Updating')
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await expect(page.getByRole('button', { name: 'Manage feeds' })).toBeDisabled()
  release()
  await expect(page.getByRole('button', { name: 'Manage feeds' })).toBeEnabled()
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
  expect(calls.map(call => call.id)).toEqual([1, 2])
})

test('category preparation failure retains selection and can be retried', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.getByLabel('Action', { exact: true }).selectOption('category')
  await page.getByLabel('Destination category').fill('🌱')
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('Could not prepare this update')
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2)
  expect(calls).toHaveLength(0)
  await page.route('**/tarang/v1/category/*', route => route.fulfill({ status: 409 }))
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('2 of 2 feeds updated')
  expect(calls).toHaveLength(2)
})

test('selection is inline, hidden when toggled off, and cleared on frequency navigation', async ({ page }) => {
  const { calls } = await setup(page)
  await expect(page.locator('#follows > ol > li .feed-selection')).toHaveCount(2)
  await expect(page.locator('#bulk-panel input[type="checkbox"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.locator('#imps').getByRole('link', { name: 'Rarely' }).click()
  await expect(page.getByRole('button', { name: 'Manage feeds' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.feed-selection')).toHaveCount(0)
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select Rare feed', exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await page.getByLabel('Importance', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Apply to selected feeds' }).click()
  await expect(page.getByRole('status')).toContainText('1 of 1 feeds updated')
  expect(calls.map(call => call.id)).toEqual([5])
  await page.getByRole('button', { name: 'Manage feeds' }).click()
  await expect(page.locator('#bulk-panel')).toHaveCount(0)
  await expect(page.locator('.feed-selection')).toHaveCount(0)
})
