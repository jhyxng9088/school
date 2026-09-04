import { expect, test } from '@playwright/test'

async function openNavigationFixture(page) {
  await page.goto('e2e-navigation.html')
  await expect(page.locator('#navigation-e2e-root')).toHaveText('semantic navigation fixture')
  await expect.poll(() => page.evaluate(() => Boolean(window.SHubNavigation))).toBe(true)
}

test('semantic navigation normalizes parent and leaf routes without DOM clicks', async ({ page }) => {
  await openNavigationFixture(page)

  const routes = await page.evaluate(() => ({
    board: window.SHubNavigation.normalizeRoute('board'),
    academic: window.SHubNavigation.normalizeRoute({ tab: 'schedule', section: 'academic' }),
    invalidSection: window.SHubNavigation.normalizeRoute({ tab: 'class', section: 'meal' }),
    invalid: window.SHubNavigation.normalizeRoute('missing-route'),
  }))

  expect(routes.board).toEqual({ tab: 'class', section: 'board' })
  expect(routes.academic).toEqual({ tab: 'schedule', section: 'academic' })
  expect(routes.invalidSection).toEqual({ tab: 'class', section: 'timetable' })
  expect(routes.invalid).toBeNull()
})

test('route requested before React owner registration is delivered once after register', async ({ page }) => {
  await openNavigationFixture(page)

  const result = await page.evaluate(() => {
    window.__deliveredRoutes = []
    const accepted = window.SHubNavigation.navigate({ tab: 'schedule', section: 'meal' })
    const unregister = window.SHubNavigation.register((route) => window.__deliveredRoutes.push(route))
    unregister()
    window.SHubNavigation.navigate('study')
    return { accepted, delivered: window.__deliveredRoutes }
  })

  expect(result.accepted).toBe(true)
  expect(result.delivered).toEqual([{ tab: 'schedule', section: 'meal' }])
})

test('registered owner receives semantic navigation immediately', async ({ page }) => {
  await openNavigationFixture(page)

  const delivered = await page.evaluate(() => {
    const routes = []
    const unregister = window.SHubNavigation.register((route) => routes.push(route))
    window.SHubNavigation.navigate('timetable')
    window.SHubNavigation.navigate({ tab: 'class', section: 'board' })
    unregister()
    return routes
  })

  expect(delivered).toEqual([
    { tab: 'class', section: 'timetable' },
    { tab: 'class', section: 'board' },
  ])
})
