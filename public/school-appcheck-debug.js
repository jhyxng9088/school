(() => {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('appcheck-debug')
  const storageKey = 'school.appcheck.debugToken.session'

  if (mode === 'clear') {
    window.sessionStorage.removeItem(storageKey)
    return
  }

  if (mode !== '1') return

  const storedToken = String(window.sessionStorage.getItem(storageKey) || '').trim()

  if (storedToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = storedToken
    self.__SCHOOL_APPCHECK_DEBUG__ = true
    return
  }

  const overlay = document.createElement('div')
  overlay.id = 'school-appcheck-debug-panel'
  overlay.innerHTML = `
    <div class="school-appcheck-debug-card" role="dialog" aria-modal="true" aria-labelledby="school-appcheck-debug-title">
      <p class="school-appcheck-debug-kicker">임시 진단 모드</p>
      <h1 id="school-appcheck-debug-title">App Check 디버그 토큰</h1>
      <p class="school-appcheck-debug-copy">Firebase에서 만든 디버그 토큰을 여기 붙여넣어. 토큰은 이 브라우저 세션에만 저장되고 GitHub에는 전송되지 않아.</p>
      <input id="school-appcheck-debug-input" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="디버그 토큰 붙여넣기" />
      <button id="school-appcheck-debug-submit" type="button">이 기기에서 테스트</button>
      <small id="school-appcheck-debug-error" aria-live="polite"></small>
    </div>
  `

  const style = document.createElement('style')
  style.textContent = `
    #school-appcheck-debug-panel {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
      background: rgba(0, 0, 0, 0.72);
      -webkit-backdrop-filter: blur(18px);
      backdrop-filter: blur(18px);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    }
    .school-appcheck-debug-card {
      width: min(100%, 520px);
      display: grid;
      gap: 14px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 24px;
      background: rgba(28,28,30,.96);
      color: #fff;
      box-shadow: 0 18px 70px rgba(0,0,0,.35);
    }
    .school-appcheck-debug-kicker {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255,255,255,.5);
    }
    .school-appcheck-debug-card h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
    }
    .school-appcheck-debug-copy {
      margin: 0 0 4px;
      font-size: 14px;
      line-height: 1.55;
      color: rgba(255,255,255,.68);
    }
    #school-appcheck-debug-input {
      width: 100%;
      box-sizing: border-box;
      min-height: 52px;
      padding: 0 15px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 14px;
      outline: none;
      background: rgba(255,255,255,.08);
      color: #fff;
      font: inherit;
    }
    #school-appcheck-debug-input:focus {
      border-color: rgba(255,255,255,.35);
      background: rgba(255,255,255,.11);
    }
    #school-appcheck-debug-submit {
      min-height: 52px;
      border: 0;
      border-radius: 14px;
      background: #fff;
      color: #111;
      font: inherit;
      font-weight: 750;
    }
    #school-appcheck-debug-error {
      min-height: 18px;
      color: #ff9f9f;
      font-size: 12px;
    }
  `

  document.head.appendChild(style)
  document.body.appendChild(overlay)

  const input = overlay.querySelector('#school-appcheck-debug-input')
  const submit = overlay.querySelector('#school-appcheck-debug-submit')
  const error = overlay.querySelector('#school-appcheck-debug-error')

  window.setTimeout(() => input?.focus(), 50)

  const saveToken = () => {
    const token = String(input?.value || '').trim()
    if (token.length < 8) {
      error.textContent = '토큰을 그대로 붙여넣어.'
      return
    }

    window.sessionStorage.setItem(storageKey, token)
    window.location.reload()
  }

  submit?.addEventListener('click', saveToken)
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveToken()
  })
})()
