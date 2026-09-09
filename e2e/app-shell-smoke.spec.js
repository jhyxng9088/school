import { expect, test } from '@playwright/test'

function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => {
    const message = String(error?.message || error)
    const expectedLocalAuthBoundary = message.includes('/identitytoolkit.googleapis.com/v1/accounts:signUp?')
      && message.endsWith(' due to access control checks.')
    if (!expectedLocalAuthBoundary) errors.push(message)
  })
  return errors
}

async function isolateProductionNetwork(page) {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())
    const isHttp = requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:'
    const isLocal = requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost'
    if (isHttp && !isLocal) {
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
}

async function seedInstalledStudent(page) {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      if (query !== '(display-mode: standalone)') return nativeMatchMedia(query)
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false },
      }
    }

    localStorage.setItem('school.clientDataGeneration', '2')
    localStorage.setItem('school.installGuideDone', 'true')
    localStorage.setItem('school.studentProfile.v1', JSON.stringify({
      name: 'E2E Student',
      classNumber: 1,
      studentNumber: 1,
    }))
  })
}

async function expectAppShell(page) {
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.app-content')).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
}

test('production cold start renders the install path without an uncaught boot error', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await isolateProductionNetwork(page)

  await page.goto('index.html')
  await expect(page.locator('.onboarding-page')).toBeVisible()
  await expect(page.locator('.onboarding-card')).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForTimeout(500)

  expect(pageErrors).toEqual([])
})

test('installed student profile cold start renders the real app shell without an uncaught boot error', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await isolateProductionNetwork(page)
  await seedInstalledStudent(page)

  await page.goto('index.html')
  await expectAppShell(page)
  await page.waitForTimeout(750)

  expect(pageErrors).toEqual([])
})

test('installed app relaunch returns to the real app shell without a black-screen boot failure', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await isolateProductionNetwork(page)
  await seedInstalledStudent(page)

  await page.goto('index.html')
  await expectAppShell(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectAppShell(page)
  await page.waitForTimeout(750)

  expect(pageErrors).toEqual([])
})

test('installed app traverses every production station and class board without a black screen', async ({ page }) => {
  const pageErrors = collectPageErrors(page)
  await isolateProductionNetwork(page)
  await seedInstalledStudent(page)

  await page.goto('index.html')
  await expectAppShell(page)

  const navButtons = page.locator('.bottom-nav .nav-button')
  await expect(navButtons).toHaveCount(5)

  for (const tab of ['home', 'class', 'study', 'schedule']) {
    const button = page.locator(`.bottom-nav .nav-button[data-tab="${tab}"]`)
    await expect(button).toBeVisible()
    await button.click()
    await expect(page.locator('.app-content')).toHaveClass(new RegExp(`\\btab-${tab}\\b`))
    await expectAppShell(page)
  }

  await page.locator('.bottom-nav .nav-button[data-tab="class"]').click()
  await expect(page.locator('.class-top-segment')).toBeVisible({ timeout: 2_000 })
  const timetableButton = page.getByRole('button', { name: '시간표', exact: true })
  const boardButton = page.getByRole('button', { name: '게시판', exact: true })
  await timetableButton.click()
  await expect(timetableButton).toHaveAttribute('aria-pressed', 'true')
  await expectAppShell(page)
  await boardButton.click()
  await expect(boardButton).toHaveAttribute('aria-pressed', 'true')
  await expectAppShell(page)

  const aiButton = page.locator('.bottom-nav .nav-button[data-tab="ai"]')
  await expect(aiButton).toBeVisible()
  await aiButton.click()
  await expect(page.locator('.app-content')).toHaveClass(/\btab-ai\b/)
  await expectAppShell(page)
  await page.waitForTimeout(750)

  expect(pageErrors).toEqual([])
})

test('performance expires at 23:00 KST, stays gone on reload, and the next generic expiry still runs', async ({ page }) => {
  await isolateProductionNetwork(page)
  await seedInstalledStudent(page)
  await page.clock.install({ time: new Date('2026-09-09T22:58:00+09:00') })
  await page.addInitScript(() => {
    // Chromium's blocked-worker shim resolves register() with undefined.
    // Model an actual registration failure so fast-forwarded update timers
    // cannot run against that shim; keep all production networking isolated.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = async () => { throw new Error('Service Worker disabled in lifecycle fixture') }
    }
    if (localStorage.getItem('e2e.performance.seeded')) return
    localStorage.setItem('e2e.performance.seeded', '1')
    localStorage.setItem('school.timetable.weekly.v2.class-1', JSON.stringify({ wed: { 7: '자율' } }))
    localStorage.setItem('school.sharedTodos.v1.class-1', JSON.stringify([
      { id: 'performance-e2e', type: 'performance', title: '영어 수행평가', dueDate: '2026-09-09', dueTime: '00:01', createdAt: 1 },
      { id: 'timed-e2e', type: 'task', title: '일반 시간 지정', dueDate: '2026-09-09', dueTime: '23:02', createdAt: 2 },
      { id: 'untimed-e2e', type: 'task', title: '일반 날짜 지정', dueDate: '2026-09-09', dueTime: '', createdAt: 3 },
    ]))
  })
  await page.goto('index.html')
  await expectAppShell(page)
  await page.locator('.bottom-nav .nav-button[data-tab="schedule"]').click()
  const performanceRow = page.locator('[data-reminder-id="performance-e2e"]')
  const timedRow = page.locator('[data-reminder-id="timed-e2e"]')
  const untimedRow = page.locator('[data-reminder-id="untimed-e2e"]')
  await expect(performanceRow).toBeVisible()
  await expect(timedRow).toBeVisible()
  await expect(untimedRow).toBeVisible()
  await page.clock.fastForward(2 * 60_000 + 1_000)
  await expect(performanceRow).toHaveCount(0)
  await expect(timedRow).toBeVisible()
  await expect(untimedRow).toBeVisible()
  await page.clock.fastForward(2 * 60_000)
  await expect(timedRow).toHaveCount(0)
  await expect(untimedRow).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectAppShell(page)
  await page.locator('.bottom-nav .nav-button[data-tab="schedule"]').click()
  await expect(performanceRow).toHaveCount(0)
  await expect(timedRow).toHaveCount(0)
  await expect(untimedRow).toBeVisible()
  // Expiry must not remove the shared source: the row policy owns hiding.
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('school.sharedTodos.v1.class-1') || '[]').some((todo) => todo.id === 'performance-e2e'))
  expect(retained).toBe(true)
})