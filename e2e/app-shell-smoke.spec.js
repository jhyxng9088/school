import { expect, test } from '@playwright/test'

function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error?.message || error)))
  return errors
}

test('production cold start renders the install path without an uncaught boot error', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

  await page.goto('index.html')
  await expect(page.locator('.onboarding-page')).toBeVisible()
  await expect(page.locator('.onboarding-card')).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForTimeout(500)

  expect(pageErrors).toEqual([])
})

test('installed student profile cold start renders the real app shell without an uncaught boot error', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

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

  await page.goto('index.html')
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.app-content')).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForTimeout(750)

  expect(pageErrors).toEqual([])
})
