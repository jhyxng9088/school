import { ensureSignedIn } from './school-sync.js'
import './preview-v2-hotfix.css'

const PREVIEW_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const WARM_TIMEOUT_MS = 8000
let warmingStarted = false

function aiTabActive() {
  return Boolean(document.querySelector('.bottom-nav .nav-button[data-preview-tab="ai"][data-preview-active="true"]'))
}

function releaseSheetScrollLock() {
  if (!document.querySelector('.s-hub-ai-sheet.preview-v2-ai-page')) return
  const body = document.body
  const root = document.documentElement
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.width = ''
  body.style.overflow = ''
  body.style.overscrollBehavior = ''
  root.style.overflow = ''
  root.classList.remove('school-unified-sheet-open')
}

function promoteAIToPage() {
  const sheet = document.querySelector('.s-hub-ai-sheet')
  if (!sheet) return false
  sheet.classList.add('preview-v2-ai-page')
  sheet.setAttribute('role', 'region')
  sheet.setAttribute('aria-modal', 'false')
  document.querySelectorAll('.unified-sheet-backdrop').forEach((backdrop) => {
    backdrop.classList.add('preview-v2-ai-backdrop')
  })
  releaseSheetScrollLock()
  return true
}

function syncAIPageState() {
  document.documentElement.classList.toggle('shub-preview-ai-active', aiTabActive())
  promoteAIToPage()
}

function stopAIHeaderDrag(event) {
  if (!event.target.closest?.('.preview-v2-ai-page .unified-sheet-head')) return
  event.stopImmediatePropagation()
}

function closeAIPageBeforeLeaving(event) {
  const button = event.target.closest?.('.bottom-nav .nav-button')
  if (!button) return
  if (button.dataset.previewTab === 'ai') return
  const sheet = document.querySelector('.s-hub-ai-sheet.preview-v2-ai-page')
  if (!sheet) return
  sheet.querySelector('.unified-sheet-close')?.click()
}

async function fetchWarmResource(resource, token) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), WARM_TIMEOUT_MS)
  try {
    await fetch(`${PREVIEW_API_URL}?resource=${encodeURIComponent(resource)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    // The real page request remains authoritative. Warming must never block the UI.
  } finally {
    window.clearTimeout(timeout)
  }
}

async function warmPreviewData() {
  if (warmingStarted) return
  warmingStarted = true
  try {
    const user = await ensureSignedIn()
    const token = await user.getIdToken()
    await Promise.allSettled([
      fetchWarmResource('board', token),
      fetchWarmResource('study', token),
    ])
  } catch {
    // Normal page loading still handles and surfaces authentication errors.
  }
}

function installPreviewUXFixes() {
  document.addEventListener('click', closeAIPageBeforeLeaving, true)
  ;['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
    document.addEventListener(type, stopAIHeaderDrag, true)
  })

  const observer = new MutationObserver(syncAIPageState)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-preview-active', 'class'],
  })

  syncAIPageState()
  window.setTimeout(warmPreviewData, 180)
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
}

installPreviewUXFixes()
