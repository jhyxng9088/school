(() => {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('appcheck-debug')
  const storageKey = 'school.appcheck.debugToken.session'

  if (mode === 'clear') {
    window.sessionStorage.removeItem(storageKey)
    return
  }

  if (mode !== '1') return

  let token = window.sessionStorage.getItem(storageKey)

  if (!token) {
    token = window.prompt('Firebase App Check 디버그 토큰을 붙여넣어. 이 값은 현재 브라우저 세션에만 저장돼.')
    token = String(token || '').trim()
    if (!token) {
      console.warn('App Check debug mode requested, but no debug token was provided.')
      return
    }
    window.sessionStorage.setItem(storageKey, token)
  }

  self.FIREBASE_APPCHECK_DEBUG_TOKEN = token
  self.__SCHOOL_APPCHECK_DEBUG__ = true
})()
