(() => {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('appcheck-debug')
  const storageKey = 'school.appcheck.debugToken.session'

  if (mode === 'clear') {
    window.sessionStorage.removeItem(storageKey)
    return
  }

  if (mode !== '1') return

  const addStyles = () => {
    if (document.getElementById('school-appcheck-debug-style')) return
    const style = document.createElement('style')
    style.id = 'school-appcheck-debug-style'
    style.textContent = `
      #school-appcheck-debug-panel,
      #school-appcheck-debug-status {
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      }
      #school-appcheck-debug-panel {
        inset: 0;
        display: grid;
        place-items: center;
        padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
        background: rgba(0, 0, 0, 0.72);
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
      }
      .school-appcheck-debug-card {
        width: min(100%, 520px);
        display: grid;
        gap: 14px;
        padding: 24px;
        box-sizing: border-box;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 24px;
        background: rgba(28,28,30,.97);
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
      #school-appcheck-debug-submit,
      #school-appcheck-debug-check,
      #school-appcheck-debug-ai,
      #school-appcheck-debug-reset {
        min-height: 44px;
        border: 0;
        border-radius: 12px;
        padding: 0 14px;
        font: inherit;
        font-weight: 750;
      }
      #school-appcheck-debug-submit,
      #school-appcheck-debug-check,
      #school-appcheck-debug-ai {
        background: #fff;
        color: #111;
      }
      #school-appcheck-debug-reset {
        background: rgba(255,255,255,.1);
        color: rgba(255,255,255,.8);
      }
      #school-appcheck-debug-error {
        min-height: 18px;
        color: #ff9f9f;
        font-size: 12px;
      }
      #school-appcheck-debug-status {
        left: 12px;
        right: 12px;
        bottom: max(12px, env(safe-area-inset-bottom));
        margin: 0 auto;
        width: min(calc(100% - 24px), 700px);
        box-sizing: border-box;
        display: grid;
        gap: 8px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 16px;
        background: rgba(28,28,30,.94);
        color: #fff;
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
        box-shadow: 0 12px 38px rgba(0,0,0,.28);
      }
      .school-appcheck-debug-status-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .school-appcheck-debug-status-head strong {
        font-size: 13px;
      }
      .school-appcheck-debug-status-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #school-appcheck-debug-result,
      #school-appcheck-debug-ai-result {
        margin: 0;
        font-size: 11px;
        line-height: 1.45;
        overflow-wrap: anywhere;
        color: rgba(255,255,255,.66);
      }
      #school-appcheck-debug-result.is-success,
      #school-appcheck-debug-ai-result.is-success { color: #8ee6a8; }
      #school-appcheck-debug-result.is-error,
      #school-appcheck-debug-ai-result.is-error { color: #ff9f9f; }
      #school-appcheck-debug-check:disabled,
      #school-appcheck-debug-ai:disabled { opacity: .55; }
    `
    document.head.appendChild(style)
  }

  const mountTokenEntry = () => {
    addStyles()
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
  }

  const waitForDiagnostics = () => new Promise((resolve) => {
    let tries = 0
    const tick = () => {
      const appCheckDiagnose = window.__SCHOOL_APPCHECK_DIAGNOSE__
      const aiDiagnose = window.__SCHOOL_AI_DIAGNOSE__
      if (typeof appCheckDiagnose === 'function' && typeof aiDiagnose === 'function') {
        resolve({ appCheckDiagnose, aiDiagnose })
        return
      }
      tries += 1
      if (tries >= 60) {
        resolve(null)
        return
      }
      window.setTimeout(tick, 100)
    }
    tick()
  })

  const mountStatusPanel = () => {
    addStyles()
    const panel = document.createElement('div')
    panel.id = 'school-appcheck-debug-status'
    panel.innerHTML = `
      <div class="school-appcheck-debug-status-head">
        <strong>App Check debug token 로드됨</strong>
        <div class="school-appcheck-debug-status-actions">
          <button id="school-appcheck-debug-reset" type="button">토큰 다시 입력</button>
          <button id="school-appcheck-debug-check" type="button" disabled>준비 중…</button>
          <button id="school-appcheck-debug-ai" type="button" disabled>AI 연결 테스트</button>
        </div>
      </div>
      <p id="school-appcheck-debug-result" aria-live="polite">Firebase App Check 초기화를 기다리는 중…</p>
      <p id="school-appcheck-debug-ai-result" aria-live="polite">App Check가 성공하면 같은 세션에서 AI를 바로 테스트할 수 있어.</p>
    `
    document.body.appendChild(panel)

    const check = panel.querySelector('#school-appcheck-debug-check')
    const aiCheck = panel.querySelector('#school-appcheck-debug-ai')
    const reset = panel.querySelector('#school-appcheck-debug-reset')
    const result = panel.querySelector('#school-appcheck-debug-result')
    const aiResult = panel.querySelector('#school-appcheck-debug-ai-result')

    reset?.addEventListener('click', () => {
      window.sessionStorage.removeItem(storageKey)
      window.location.reload()
    })

    waitForDiagnostics().then((diagnostics) => {
      if (!diagnostics) {
        result.className = 'is-error'
        result.textContent = '진단 함수가 준비되지 않았어. 새로고침 후 다시 시도해.'
        check.disabled = true
        check.textContent = '사용 불가'
        aiCheck.disabled = true
        return
      }

      const { appCheckDiagnose, aiDiagnose } = diagnostics

      check.disabled = false
      check.textContent = 'App Check 상태 확인'
      result.textContent = '먼저 App Check 토큰 발급을 확인해.'

      check.addEventListener('click', async () => {
        check.disabled = true
        aiCheck.disabled = true
        check.textContent = '확인 중…'
        result.className = ''
        result.textContent = 'Firebase App Check 토큰을 강제로 새로 발급하는 중…'

        const info = await appCheckDiagnose()
        if (info?.ok) {
          result.className = 'is-success'
          result.textContent = `성공 · ${info.elapsedMs}ms · Firebase App Check token length ${info.tokenLength}`
          aiCheck.disabled = false
          aiResult.className = ''
          aiResult.textContent = 'App Check 성공. 이제 AI 연결 테스트를 눌러.'
        } else {
          result.className = 'is-error'
          result.textContent = `[${info?.name || 'Error'}] ${info?.code || ''} ${info?.status || ''} — ${info?.message || '알 수 없는 오류'}`
          aiCheck.disabled = true
          aiResult.className = ''
          aiResult.textContent = 'App Check가 실패해서 AI 테스트는 잠가뒀어.'
        }

        check.disabled = false
        check.textContent = '다시 확인'
      })

      aiCheck.addEventListener('click', async () => {
        aiCheck.disabled = true
        check.disabled = true
        aiCheck.textContent = 'AI 확인 중…'
        aiResult.className = ''
        aiResult.textContent = '같은 App Check 세션으로 gemini-3.7-flash에 최소 요청을 보내는 중…'

        const info = await aiDiagnose()
        if (info?.ok) {
          aiResult.className = 'is-success'
          aiResult.textContent = `AI 성공 · ${info.elapsedMs}ms · App Check token ${info.appCheckTokenLength} · 응답: ${info.responseText || '(빈 응답)'}`
        } else {
          aiResult.className = 'is-error'
          aiResult.textContent = `[${info?.name || 'Error'}] ${info?.code || ''} ${info?.status || ''} — ${info?.message || '알 수 없는 오류'}`
        }

        aiCheck.disabled = false
        check.disabled = false
        aiCheck.textContent = 'AI 다시 테스트'
      })
    })
  }

  const storedToken = String(window.sessionStorage.getItem(storageKey) || '').trim()

  if (storedToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = storedToken
    self.__SCHOOL_APPCHECK_DEBUG__ = true
    mountStatusPanel()
    return
  }

  mountTokenEntry()
})()
