(() => {
  const GENERIC_ERROR = 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'

  function compact(value, max = 150) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  }

  function diagnosticText() {
    const diagnostic = window.__schoolAIDiagnostic
    if (!diagnostic) return GENERIC_ERROR

    const stageLabel = diagnostic.stage === 'app-check'
      ? 'App Check'
      : diagnostic.stage === 'ai-logic'
        ? 'AI Logic'
        : 'AI 응답'

    const code = compact(diagnostic.code, 72)
    const message = compact(diagnostic.message, 170)
    return `AI 오류 · ${stageLabel} · ${code}${message ? ` · ${message}` : ''}`
  }

  function sync() {
    document.querySelectorAll('.reminder-ai-status').forEach((node) => {
      if (node.classList.contains('is-working') || node.classList.contains('is-ready')) return
      if (node.textContent === GENERIC_ERROR || node.textContent.startsWith('AI 오류 ·')) {
        node.textContent = diagnosticText()
      }
    })
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  window.addEventListener('school-ai-diagnostic', sync)
  window.addEventListener('pageshow', sync)
  sync()
})()
