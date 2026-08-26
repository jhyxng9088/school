(() => {
  const PROFILE_KEY = 'school.studentProfile.v1'
  const NOTICE_KEY = 'school.contactNotice.v1'
  const INSTAGRAM_URL = 'https://www.instagram.com/j.hyxng?igsi=eW9rczVqczBnMnBz&utm_source=qr'
  let mounted = false

  function hasProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
      return Boolean(value?.name && value?.classNumber && value?.studentNumber)
    } catch {
      return false
    }
  }

  function shouldShow() {
    return hasProfile() && localStorage.getItem(NOTICE_KEY) !== 'done'
  }

  function mount() {
    if (mounted || !shouldShow() || !document.querySelector('.app-shell')) return
    mounted = true

    const layer = document.createElement('div')
    layer.className = 'first-run-notice-layer'
    layer.innerHTML = `
      <div class="first-run-notice-backdrop" aria-hidden="true"></div>
      <section class="first-run-notice-card" role="dialog" aria-modal="true" aria-labelledby="first-run-notice-title">
        <p class="first-run-notice-eyebrow">School</p>
        <h2 id="first-run-notice-title">마지막으로 하나만</h2>
        <p>수정사항이나 문의사항이 있으면 <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer">@j.hyxng</a>에게 연락해줘.</p>
        <button type="button">확인</button>
      </section>
    `

    const confirm = layer.querySelector('button')
    confirm?.addEventListener('click', () => {
      localStorage.setItem(NOTICE_KEY, 'done')
      layer.classList.add('is-closing')
      window.setTimeout(() => layer.remove(), 280)
    })

    document.body.appendChild(layer)
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')))
  }

  const observer = new MutationObserver(mount)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('storage', mount)
  window.addEventListener('focus', mount)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
})()
