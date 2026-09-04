const DEPLOYMENT_CHECK_COOLDOWN_MS = 15_000

let deploymentCheckPending = false
let deploymentReloading = false
let lastDeploymentCheckAt = 0

function normalizedModuleEntries(documentLike, baseUrl) {
  const entries = [...documentLike.querySelectorAll('script[type="module"][src]')]
    .map((script) => {
      try {
        const url = new URL(script.getAttribute('src') || '', baseUrl)
        return `${url.pathname}${url.search}`
      } catch {
        return ''
      }
    })
    .filter(Boolean)

  return [...new Set(entries)].sort()
}

function sameEntries(current, latest) {
  if (!current.length || !latest.length || current.length !== latest.length) return false
  return current.every((entry, index) => entry === latest[index])
}

async function checkForDeploymentUpdate({ force = false } = {}) {
  if (deploymentCheckPending || deploymentReloading) return
  if (document.hidden || navigator.onLine === false) return

  const now = Date.now()
  if (!force && now - lastDeploymentCheckAt < DEPLOYMENT_CHECK_COOLDOWN_MS) return
  lastDeploymentCheckAt = now
  deploymentCheckPending = true

  try {
    const currentEntries = normalizedModuleEntries(document, window.location.href)
    if (!currentEntries.length) return

    const shellUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    shellUrl.searchParams.set('__shub_deploy_check', String(now))
    const response = await fetch(shellUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    if (!response.ok) return

    const html = await response.text()
    const latestDocument = new DOMParser().parseFromString(html, 'text/html')
    const latestEntries = normalizedModuleEntries(latestDocument, shellUrl.href)
    if (!latestEntries.length || sameEntries(currentEntries, latestEntries)) return

    deploymentReloading = true
    window.location.reload()
  } catch (error) {
    console.warn('S-Hub deployment refresh check skipped:', error)
  } finally {
    deploymentCheckPending = false
  }
}

window.addEventListener('pageshow', (event) => {
  checkForDeploymentUpdate({ force: Boolean(event.persisted) })
})

window.addEventListener('online', () => {
  checkForDeploymentUpdate({ force: true })
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForDeploymentUpdate({ force: true })
})

window.setTimeout(() => {
  checkForDeploymentUpdate({ force: true })
}, 2500)
