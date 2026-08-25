(() => {
  const TARGETS = [
    { navIndex: 2, label: '시간표 열기' },
    { navIndex: 1, label: '리마인더 열기' },
    { navIndex: 2, label: '시간표 열기' },
    { navIndex: 4, label: '학사일정 열기' },
    { navIndex: 3, label: '급식 열기' },
  ]

  function activateNav(index) {
    const buttons = document.querySelectorAll('.bottom-nav .nav-button')
    buttons[index]?.click()
  }

  function enhanceHome() {
    const items = document.querySelectorAll('.home-stack > *')
    if (!items.length) return

    TARGETS.forEach((target, index) => {
      const item = items[index]
      if (!item || item.dataset.homeNavReady === 'true') return

      item.dataset.homeNavReady = 'true'
      item.setAttribute('role', 'button')
      item.setAttribute('tabindex', '0')
      item.setAttribute('aria-label', target.label)
      item.style.cursor = 'pointer'
      item.style.touchAction = 'manipulation'

      item.addEventListener('click', () => activateNav(target.navIndex))
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        activateNav(target.navIndex)
      })
    })
  }

  function syncReminderLabel() {
    const label = document.querySelector('.bottom-nav .nav-button:nth-of-type(2) span')
    if (label && label.textContent !== '리마인더') label.textContent = '리마인더'
  }

  function sync() {
    syncReminderLabel()
    enhanceHome()
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  sync()
})()
