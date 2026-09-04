import { expect, test } from '@playwright/test'

async function openBoardDetail(page) {
  await page.goto('e2e-board-sheet.html')
  await expect(page.getByRole('heading', { name: '게시판', exact: true })).toBeVisible()

  const card = page.getByRole('button', { name: /E2E 게시글/ })
  await expect(card).toBeVisible()
  await card.click()

  const dialog = page.getByRole('dialog', { name: '게시글 상세' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveClass(/is-open/)
  return dialog
}

async function observeCloseLifecycle(page, triggerSelector) {
  await page.evaluate((selector) => {
    const sheet = document.querySelector('[role="dialog"][aria-label="게시글 상세"]')
    const trigger = document.querySelector(selector)
    if (!sheet || !trigger) throw new Error('게시글 상세 sheet 또는 닫기 trigger를 찾지 못했습니다.')

    window.__e2eBoardCloseClickAt = null
    window.__e2eBoardRemovedAt = null

    trigger.addEventListener('click', () => {
      window.__e2eBoardCloseClickAt = performance.now()
    }, { once: true, capture: true })

    const observer = new MutationObserver(() => {
      if (!document.body.contains(sheet)) {
        window.__e2eBoardRemovedAt = performance.now()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }, triggerSelector)
}

async function expectAnimatedUnmount(page, trigger, clickOptions) {
  await trigger.click(clickOptions)

  await expect.poll(async () => page.evaluate(() => {
    const clickAt = window.__e2eBoardCloseClickAt
    const removedAt = window.__e2eBoardRemovedAt
    if (!Number.isFinite(clickAt) || !Number.isFinite(removedAt)) return null
    return removedAt - clickAt
  }), { timeout: 2_000 }).not.toBeNull()

  const removalDelay = await page.evaluate(() => window.__e2eBoardRemovedAt - window.__e2eBoardCloseClickAt)
  expect(removalDelay).toBeGreaterThanOrEqual(280)
  expect(removalDelay).toBeLessThan(1_500)
  await expect(page.getByRole('dialog', { name: '게시글 상세' })).toHaveCount(0)
}

test('게시글 상세 닫기 버튼은 exit animation 뒤에 unmount한다', async ({ page }) => {
  const dialog = await openBoardDetail(page)
  await observeCloseLifecycle(page, '.unified-sheet-close')
  await expectAnimatedUnmount(page, dialog.getByRole('button', { name: '닫기' }))
})

test('게시글 상세 배경 닫기도 exit animation 뒤에 unmount한다', async ({ page }) => {
  await openBoardDetail(page)
  const backdrop = page.locator('.unified-sheet-backdrop')
  await expect(backdrop).toBeVisible()
  await observeCloseLifecycle(page, '.unified-sheet-backdrop')
  await expectAnimatedUnmount(page, backdrop, { position: { x: 16, y: 16 } })
})
