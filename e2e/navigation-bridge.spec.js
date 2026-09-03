import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const navigationSource = readFileSync(new URL('../public/s-hub-navigation.js', import.meta.url), 'utf8')

async function installNavigationHarness(page) {
  await page.setContent(`
    <nav class="bottom-nav">
      <button class="nav-button" data-tab="home" aria-current="page">Home</button>
      <button class="nav-button" data-tab="class">Class</button>
      <button class="nav-button" data-tab="study">Study</button>
      <button class="nav-button" data-tab="schedule">Schedule</button>
    </nav>
    <div class="class-nav">
      <button class="class-nav-subbutton" aria-label="우리 반 시간표">Timetable</button>
      <button class="class-nav-subbutton" aria-label="우리 반 게시판">Board</button>
    </div>
    <div class="station-schedule-switcher">
      <button data-unread-key="todo">리마인더</button>
      <button data-unread-key="academic">학사일정</button>
      <button data-unread-key="meal">급식</button>
    </div>
    <script>
      window.__routeClicks = []
      document.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => window.__routeClicks.push(button.textContent.trim()))
      })
    </script>
  `)
  await page.addScriptTag({ content: navigationSource })
}

test('route requested before React mount is delivered to the registered owner without DOM clicks', async ({ page }) => {
  await installNavigationHarness(page)

  await page.evaluate(() => window.SHubNavigation.navigate('board'))

  await page.evaluate(() => {
    window.__ownedRoutes = []
    window.SHubNavigation.register((route) => window.__ownedRoutes.push(route))
  })

  await expect.poll(() => page.evaluate(() => window.__ownedRoutes)).toEqual([
    { tab: 'class', section: 'board' },
  ])
  await expect.poll(() => page.evaluate(() => window.__routeClicks)).toEqual([])
})

test('registered owner receives semantic routes without synthetic DOM clicks', async ({ page }) => {
  await installNavigationHarness(page)

  await page.evaluate(() => {
    window.__ownedRoutes = []
    window.SHubNavigation.register((route) => window.__ownedRoutes.push(route))
  })

  await page.evaluate(() => {
    window.SHubNavigation.navigate('board')
    window.SHubNavigation.navigate({ tab: 'schedule', section: 'academic' })
  })

  await expect.poll(() => page.evaluate(() => window.__ownedRoutes)).toEqual([
    { tab: 'class', section: 'board' },
    { tab: 'schedule', section: 'academic' },
  ])
  await expect.poll(() => page.evaluate(() => window.__routeClicks)).toEqual([])
})

test('invalid routes are rejected before reaching the owner', async ({ page }) => {
  await installNavigationHarness(page)

  await page.evaluate(() => {
    window.__ownedRoutes = []
    window.SHubNavigation.register((route) => window.__ownedRoutes.push(route))
  })

  const result = await page.evaluate(() => window.SHubNavigation.navigate({ tab: 'missing', section: 'board' }))

  expect(result).toBe(false)
  await expect.poll(() => page.evaluate(() => window.__ownedRoutes)).toEqual([])
  await expect.poll(() => page.evaluate(() => window.__routeClicks)).toEqual([])
})
