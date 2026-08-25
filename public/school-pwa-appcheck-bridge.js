(() => {
  const SITE_KEY = '6LfuppctAAAAAMbZELYt0w0spaR2qTUmgLFdELGu'
  const API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'
  const PROJECT_ID = 'school-adeda'
  const APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
  const RECAPTCHA_ACTION = 'fire_app_check'
  const AI_HOST = 'firebasevertexai.googleapis.com'
  const TOKEN_REFRESH_SAFETY_MS = 5 * 60 * 1000
  const STORAGE_KEY = 'school.pwa.appcheck.token.v2'
  const WIDGET_ID = 'school_pwa_appcheck_widget'

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  const userAgent = window.navigator.userAgent || ''
  const isAppleTouch =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)

  if (!isStandalone || !isAppleTouch) return

  const nativeFetch = window.fetch.bind(window)
  const state = {
    token: '',
    expiresAt: 0,
    inFlight: null,
    widgetId: null,
    widgetSucceeded: null,
    lastStage: 'installed',
    lastError: '',
    lastCode: '',
    lastHttpStatus: 0,
    recaptchaHost: window.grecaptcha?.enterprise ? 'preloaded' : 'recaptcha.net',
  }

  window.__SCHOOL_PWA_APPCHECK_BRIDGE__ = state

  try {
    const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    if (
      cached?.token &&
      Number(cached?.expiresAt) > Date.now() + TOKEN_REFRESH_SAFETY_MS
    ) {
      state.token = String(cached.token)
      state.expiresAt = Number(cached.expiresAt)
      state.lastStage = 'cached-token'
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  function persistToken() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: state.token,
        expiresAt: state.expiresAt,
      }))
    } catch {
      // Storage is optional. The in-memory token still works for this session.
    }
  }

  function clearToken() {
    state.token = ''
    state.expiresAt = 0
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  function stageLabel() {
    const labels = {
      installed: 'PWA 브리지 시작',
      'cached-token': '저장된 App Check 토큰',
      'recaptcha-ready': 'reCAPTCHA 로드',
      'recaptcha-google-fallback-load': 'reCAPTCHA 보조 로드',
      'recaptcha-render': 'reCAPTCHA 초기화',
      'recaptcha-execute': 'reCAPTCHA 인증',
      'appcheck-exchange': 'App Check 교환',
      ready: 'App Check 준비',
      'ai-request': 'Gemini 요청',
      'ai-network': 'Gemini 네트워크',
      'ai-request-ok': 'Gemini 응답',
    }
    return labels[state.lastStage] || state.lastStage
  }

  function diagnosticText() {
    const parts = ['AI 연결 실패', stageLabel()]
    if (state.lastCode) parts.push(state.lastCode)
    if (state.lastHttpStatus) parts.push(`HTTP ${state.lastHttpStatus}`)
    if (state.lastError) parts.push(String(state.lastError).replace(/\s+/g, ' ').slice(0, 140))
    return parts.join(' · ')
  }

  state.describeFailure = diagnosticText

  function applyVisibleDiagnostic() {
    if (!state.lastError) return
    const text = diagnosticText()
    document.querySelectorAll('.reminder-ai-status').forEach((node) => {
      if (node.classList.contains('is-ready') || node.classList.contains('is-working')) return
      const current = node.textContent || ''
      if (
        current.includes('AI 연결이 안 돼서') ||
        current.includes('AI 연결 실패') ||
        node.dataset.schoolAiDiagnostic === 'true'
      ) {
        node.dataset.schoolAiDiagnostic = 'true'
        if (node.textContent !== text) node.textContent = text
      }
    })
  }

  function scheduleVisibleDiagnostic() {
    applyVisibleDiagnostic()
    ;[50, 150, 300, 600, 1200, 2000].forEach((delay) => {
      window.setTimeout(applyVisibleDiagnostic, delay)
    })
  }

  function recordFailure(error, stage = state.lastStage) {
    state.lastStage = stage
    state.lastError = error?.message || String(error || 'Unknown error')
    state.lastCode = String(error?.code || error?.name || '')
    if (error?.status) state.lastHttpStatus = Number(error.status) || state.lastHttpStatus
    scheduleVisibleDiagnostic()
  }

  function clearFailure(stage = state.lastStage) {
    state.lastStage = stage
    state.lastError = ''
    state.lastCode = ''
    state.lastHttpStatus = 0
  }

  const observer = new MutationObserver(() => {
    if (state.lastError) applyVisibleDiagnostic()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  let googleFallbackPromise = null

  function loadGoogleFallback() {
    if (window.grecaptcha?.enterprise) return Promise.resolve()
    if (googleFallbackPromise) return googleFallbackPromise

    googleFallbackPromise = new Promise((resolve, reject) => {
      state.lastStage = 'recaptcha-google-fallback-load'
      const script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/enterprise.js?render=explicit'
      script.async = true
      script.onload = () => {
        state.recaptchaHost = 'google.com'
        resolve()
      }
      script.onerror = () => reject(new Error('Google reCAPTCHA fallback script failed to load'))
      document.head.appendChild(script)
    })

    return googleFallbackPromise
  }

  function waitForEnterprise(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const poll = () => {
        const enterprise = window.grecaptcha?.enterprise
        if (enterprise?.ready && enterprise?.render && enterprise?.execute) {
          enterprise.ready(() => resolve(enterprise))
          return
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('reCAPTCHA Enterprise did not become ready'))
          return
        }
        window.setTimeout(poll, 50)
      }
      poll()
    })
  }

  async function getEnterprise() {
    state.lastStage = 'recaptcha-ready'
    try {
      return await waitForEnterprise(5000)
    } catch (firstError) {
      await loadGoogleFallback()
      try {
        return await waitForEnterprise(7000)
      } catch (secondError) {
        secondError.cause = firstError
        throw secondError
      }
    }
  }

  function ensureWidget(enterprise) {
    if (state.widgetId !== null) return state.widgetId

    let container = document.getElementById(WIDGET_ID)
    if (!container) {
      container = document.createElement('div')
      container.id = WIDGET_ID
      container.style.display = 'none'
      document.body.appendChild(container)
    }

    state.lastStage = 'recaptcha-render'
    state.widgetSucceeded = null
    state.widgetId = enterprise.render(container, {
      sitekey: SITE_KEY,
      size: 'invisible',
      callback: () => {
        state.widgetSucceeded = true
      },
      'error-callback': () => {
        state.widgetSucceeded = false
      },
    })

    return state.widgetId
  }

  async function exchangeEnterpriseToken(recaptchaToken) {
    state.lastStage = 'appcheck-exchange'
    const endpoint = `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${APP_ID}:exchangeRecaptchaEnterpriseToken?key=${encodeURIComponent(API_KEY)}`
    const response = await nativeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recaptcha_enterprise_token: recaptchaToken }),
    })

    state.lastHttpStatus = response.status
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok || !payload?.token) {
      const message = payload?.error?.message || `App Check exchange failed with HTTP ${response.status}`
      const error = new Error(message)
      error.code = payload?.error?.status || 'school-pwa-appcheck/exchange-failed'
      error.status = response.status
      throw error
    }

    const ttlSeconds = Number(String(payload.ttl || '').replace(/s$/, ''))
    state.token = String(payload.token)
    state.expiresAt = Date.now() + (Number.isFinite(ttlSeconds) ? ttlSeconds * 1000 : 30 * 60 * 1000)
    clearFailure('ready')
    state.lastHttpStatus = response.status
    persistToken()
    return state.token
  }

  async function issueProductionAppCheckToken(forceRefresh = false) {
    if (
      !forceRefresh &&
      state.token &&
      Date.now() < state.expiresAt - TOKEN_REFRESH_SAFETY_MS
    ) {
      return state.token
    }
    if (state.inFlight) return state.inFlight

    state.inFlight = (async () => {
      try {
        if (forceRefresh) clearToken()
        const enterprise = await getEnterprise()
        const widgetId = ensureWidget(enterprise)
        state.lastStage = 'recaptcha-execute'
        state.widgetSucceeded = null
        const recaptchaToken = await enterprise.execute(widgetId, { action: RECAPTCHA_ACTION })
        if (!recaptchaToken) throw new Error('reCAPTCHA Enterprise returned an empty token')
        if (state.widgetSucceeded === false) throw new Error('reCAPTCHA Enterprise widget reported an error')
        return await exchangeEnterpriseToken(recaptchaToken)
      } catch (error) {
        clearToken()
        recordFailure(error)
        throw error
      } finally {
        state.inFlight = null
      }
    })()

    return state.inFlight
  }

  state.getToken = issueProductionAppCheckToken

  function requestUrl(input) {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    if (input instanceof Request) return input.url
    return String(input || '')
  }

  function mergedHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    }
    return headers
  }

  async function sendAIRequest(input, init, headers) {
    try {
      state.lastStage = 'ai-request'
      const response = input instanceof Request
        ? await nativeFetch(new Request(input, { ...init, headers }))
        : await nativeFetch(input, { ...init, headers })

      if (!response.ok) {
        const error = new Error(`Firebase AI returned HTTP ${response.status}`)
        error.code = `HTTP_${response.status}`
        error.status = response.status
        recordFailure(error, 'ai-request')
      } else {
        clearFailure('ai-request-ok')
      }
      return response
    } catch (error) {
      recordFailure(error, 'ai-network')
      throw error
    }
  }

  window.fetch = async (input, init) => {
    let url
    try {
      url = new URL(requestUrl(input), window.location.href)
    } catch {
      return nativeFetch(input, init)
    }

    if (url.hostname !== AI_HOST) return nativeFetch(input, init)

    const headers = mergedHeaders(input, init)

    try {
      const token = await issueProductionAppCheckToken(false)
      headers.set('X-Firebase-AppCheck', token)
      return await sendAIRequest(input, init, headers)
    } catch (error) {
      if (!state.lastError) recordFailure(error)
      const wrapped = new Error(`PWA App Check bridge failed at ${state.lastStage}: ${error?.message || String(error)}`)
      wrapped.code = error?.code || 'school-pwa-appcheck/bridge-failed'
      wrapped.status = error?.status || state.lastHttpStatus || null
      throw wrapped
    }
  }
})()
