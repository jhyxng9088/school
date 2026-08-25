(() => {
  const SITE_KEY = '6LfuppctAAAAAMbZELYt0w0spaR2qTUmgLFdELGu'
  const API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'
  const PROJECT_ID = 'school-adeda'
  const APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
  const RECAPTCHA_ACTION = 'fire_app_check'
  const AI_HOST = 'firebasevertexai.googleapis.com'
  const TOKEN_REFRESH_SAFETY_MS = 5 * 60 * 1000

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  const userAgent = window.navigator.userAgent || ''
  const isAppleTouch =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)

  if (!isStandalone || !isAppleTouch) return

  const state = {
    token: '',
    expiresAt: 0,
    inFlight: null,
    lastStage: 'installed',
    lastError: '',
    lastHttpStatus: 0,
  }
  window.__SCHOOL_PWA_APPCHECK_BRIDGE__ = state

  if (!window.grecaptcha?.enterprise && document.readyState === 'loading') {
    const src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(SITE_KEY)}`
    document.write(`<script src="${src}"><\/script>`)
  }

  const nativeFetch = window.fetch.bind(window)

  function waitForEnterprise(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const poll = () => {
        const enterprise = window.grecaptcha?.enterprise
        if (enterprise?.ready && enterprise?.execute) {
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
      error.code = 'school-pwa-appcheck/exchange-failed'
      error.status = response.status
      throw error
    }

    const ttlSeconds = Number(String(payload.ttl || '').replace(/s$/, ''))
    state.token = String(payload.token)
    state.expiresAt = Date.now() + (Number.isFinite(ttlSeconds) ? ttlSeconds * 1000 : 30 * 60 * 1000)
    state.lastStage = 'ready'
    state.lastError = ''
    return state.token
  }

  async function issueProductionAppCheckToken() {
    if (state.token && Date.now() < state.expiresAt - TOKEN_REFRESH_SAFETY_MS) {
      return state.token
    }
    if (state.inFlight) return state.inFlight

    state.inFlight = (async () => {
      try {
        state.lastStage = 'recaptcha-ready'
        const enterprise = await waitForEnterprise()
        state.lastStage = 'recaptcha-execute'
        const recaptchaToken = await enterprise.execute(SITE_KEY, { action: RECAPTCHA_ACTION })
        if (!recaptchaToken) throw new Error('reCAPTCHA Enterprise returned an empty token')
        return await exchangeEnterpriseToken(recaptchaToken)
      } catch (error) {
        state.lastError = error?.message || String(error)
        state.token = ''
        state.expiresAt = 0
        throw error
      } finally {
        state.inFlight = null
      }
    })()

    return state.inFlight
  }

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

  window.fetch = async (input, init) => {
    let url
    try {
      url = new URL(requestUrl(input), window.location.href)
    } catch {
      return nativeFetch(input, init)
    }

    if (url.hostname !== AI_HOST) return nativeFetch(input, init)

    const headers = mergedHeaders(input, init)
    if (headers.has('X-Firebase-AppCheck')) return nativeFetch(input, init)

    try {
      const token = await issueProductionAppCheckToken()
      headers.set('X-Firebase-AppCheck', token)

      if (input instanceof Request) {
        return nativeFetch(new Request(input, { ...init, headers }))
      }
      return nativeFetch(input, { ...init, headers })
    } catch (error) {
      const wrapped = new Error(`PWA App Check bridge failed at ${state.lastStage}: ${error?.message || String(error)}`)
      wrapped.code = error?.code || 'school-pwa-appcheck/bridge-failed'
      wrapped.status = error?.status || state.lastHttpStatus || null
      throw wrapped
    }
  }
})()
