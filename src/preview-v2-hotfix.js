import { ensureSignedIn, readStudentProfile } from './school-sync.js'
import './preview-v2-hotfix.css'

const PREVIEW_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const WARM_TIMEOUT_MS = 8000
const STUDY_CACHE_MS = 9000
let warmingStarted = false
let syncFrame = 0
let rankingScope = 'class'
let studySnapshot = null
let studySnapshotAt = 0
let studySnapshotPromise = null
const animatedNativePages = new WeakSet()
const animatedStudyHeroes = new WeakSet()
const animatedAcademicPages = new WeakSet()

function aiTabActive() {
  return Boolean(document.querySelector('.bottom-nav .nav-button[data-preview-tab="ai"][data-preview-active="true"]'))
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function syncAIPageState() {
  document.documentElement.classList.toggle('shub-preview-ai-active', aiTabActive())
  const sheet = document.querySelector('.s-hub-ai-sheet.unified-school-page')
  if (sheet) sheet.classList.add('preview-v2-ai-page')
}

function routeToPreviewTab(tab) {
  const router = window.__shubPreviewV2
  if (!router) return
  if (tab === 'home') router.openHome?.()
  else if (tab === 'class') router.openClass?.('board')
  else if (tab === 'study') router.openStudy?.()
  else if (tab === 'schedule') router.openSchedule?.('todo')
}

function closeAIPageBeforeLeaving(event) {
  const button = event.target.closest?.('.bottom-nav .nav-button')
  if (!button || button.dataset.previewTab === 'ai' || !aiTabActive()) return
  const sheet = document.querySelector('.s-hub-ai-sheet.unified-school-page')
  if (!sheet) return
  const closeButton = sheet.querySelector('.unified-sheet-close')
  if (!closeButton || closeButton.disabled) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  const targetTab = button.dataset.previewTab
  event.preventDefault()
  event.stopImmediatePropagation()
  closeButton.click()
  window.setTimeout(() => routeToPreviewTab(targetTab), 0)
}

async function authorizedFetch(resource = '') {
  const user = await ensureSignedIn()
  const token = await user.getIdToken()
  const url = new URL(PREVIEW_API_URL)
  if (resource) url.searchParams.set('resource', resource)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.message || '정보를 불러오지 못했어요.')
  return payload
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

function replaceText(root, from, to) {
  root.querySelectorAll('*').forEach((node) => {
    if (node.children.length || node.textContent !== from) return
    node.textContent = to
  })
}

function polishBoardCopy() {
  const root = document.querySelector('.preview-v2-layer')
  if (!root) return
  replaceText(root, '아직 글이 없어', '아직 글이 없어요.')
  replaceText(root, '첫 질문이나 반 소식을 올려봐.', '첫 질문이나 반 소식을 올려 보세요.')
  root.querySelectorAll('input, textarea').forEach((field) => {
    if (field.placeholder === '무엇이 궁금해?') field.placeholder = '궁금한 내용을 입력해 주세요.'
    if (field.placeholder === '문제나 궁금한 점을 적어줘.') field.placeholder = '문제나 궁금한 점을 적어 주세요.'
    if (field.placeholder === '반 친구들에게 공유할 내용을 적어줘.') field.placeholder = '반 친구들에게 공유할 내용을 적어 주세요.'
  })
}

function syncStudyIcon() {
  const icon = document.querySelector('.bottom-nav .nav-button[data-preview-tab="study"] .preview-v2-nav-icon')
  if (!icon || icon.dataset.previewBookIcon === 'true') return
  icon.dataset.previewBookIcon = 'true'
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.7c2.7-.8 5.2-.35 8 1.35v12c-2.8-1.7-5.3-2.15-8-1.35zM20 5.7c-2.7-.8-5.2-.35-8 1.35v12c2.8-1.7 5.3-2.15 8-1.35z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.05v12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>'
}

function syncSegment(segment) {
  const buttons = Array.from(segment.querySelectorAll(':scope > button'))
  if (!buttons.length) return
  const selected = Math.max(0, buttons.findIndex((button) => button.classList.contains('is-selected')))
  segment.style.setProperty('--segment-count', String(buttons.length))
  segment.style.setProperty('--segment-index', String(selected))
}

function syncSegments() {
  document.querySelectorAll('.preview-v2-segment').forEach(syncSegment)
}

function createPersistentHeader(kind) {
  const header = document.createElement('header')
  header.className = 'preview-v2-page-header preview-v2-persistent-header'
  const label = document.createElement('p')
  label.className = 'date-label'
  const title = document.createElement('h1')
  if (kind === 'class') {
    const profile = readStudentProfile()
    label.textContent = `${profile?.classNumber || ''}반`
    title.textContent = '우리 반'
  } else {
    label.textContent = '학교생활'
    title.textContent = '일정'
  }
  header.append(label, title)
  return header
}

function ensureNativeHeaders() {
  const content = document.querySelector('.app-shell > .app-content')
  if (!content) return
  const classMode = content.classList.contains('tab-timetable')
  const scheduleMode = content.classList.contains('tab-todo') || content.classList.contains('tab-academic')
  if (!classMode && !scheduleMode) return
  const context = content.querySelector('.preview-v2-context')
  if (!context) return
  const kind = classMode ? 'class' : 'schedule'
  const previous = context.previousElementSibling
  if (!previous?.classList.contains('preview-v2-persistent-header')) {
    context.parentElement?.insertBefore(createPersistentHeader(kind), context)
  }
}

function topSegmentType(segment) {
  if (segment.classList.contains('preview-v2-ranking-segment')) return ''
  const labels = Array.from(segment.querySelectorAll(':scope > button')).map((button) => button.textContent.trim()).join('|')
  if (labels === '게시판|시간표') return 'class'
  if (labels === '리마인더|학사일정') return 'schedule'
  return ''
}

function headerForSegment(segment) {
  const context = segment.closest('.preview-v2-context')
  if (context) return context.previousElementSibling?.classList.contains('preview-v2-page-header') ? context.previousElementSibling : null
  return segment.previousElementSibling?.classList.contains('preview-v2-page-header') ? segment.previousElementSibling : null
}

function bridgeContextChrome(event) {
  const button = event.target.closest?.('.preview-v2-segment > button')
  const segment = button?.parentElement
  if (!button || !segment || !topSegmentType(segment)) return
  if (button.classList.contains('is-selected')) return
  const header = headerForSegment(segment)
  if (!header) return

  const headerRect = header.getBoundingClientRect()
  const segmentRect = segment.getBoundingClientRect()
  const bridge = document.createElement('div')
  bridge.className = 'preview-v2-chrome-bridge'
  bridge.style.left = `${Math.min(headerRect.left, segmentRect.left)}px`
  bridge.style.top = `${headerRect.top}px`
  bridge.style.width = `${Math.max(headerRect.right, segmentRect.right) - Math.min(headerRect.left, segmentRect.left)}px`

  const headerClone = header.cloneNode(true)
  const segmentClone = segment.cloneNode(true)
  bridge.append(headerClone, segmentClone)
  document.body.appendChild(bridge)
  syncSegment(segmentClone)

  const buttons = Array.from(segment.querySelectorAll(':scope > button'))
  const targetIndex = buttons.indexOf(button)
  const cloneButtons = Array.from(segmentClone.querySelectorAll(':scope > button'))
  window.requestAnimationFrame(() => {
    cloneButtons.forEach((cloneButton, index) => cloneButton.classList.toggle('is-selected', index === targetIndex))
    segmentClone.style.setProperty('--segment-index', String(Math.max(0, targetIndex)))
  })

  window.setTimeout(() => bridge.classList.add('is-leaving'), 390)
  window.setTimeout(() => bridge.remove(), 520)
}

function animateNativePage() {
  const content = document.querySelector('.app-shell > .app-content')
  if (!content || animatedNativePages.has(content)) return
  if (!content.matches('.tab-timetable, .tab-todo, .tab-academic')) return
  animatedNativePages.add(content)
  if (reducedMotion()) return
  const section = content.firstElementChild
  const nodes = Array.from(section?.children || []).filter((node) => (
    !node.classList.contains('preview-v2-persistent-header') && !node.classList.contains('preview-v2-context')
  ))
  nodes.forEach((node, index) => {
    node.animate([
      { opacity: 0, transform: 'translate3d(0, 7px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], {
      duration: 420,
      delay: Math.min(index * 35, 120),
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    })
  })
}

function animateAcademicList() {
  const page = document.querySelector('.app-content.tab-academic .shared-academic-page')
  if (!page || animatedAcademicPages.has(page)) return
  animatedAcademicPages.add(page)
  if (reducedMotion()) return
  const nodes = [
    page.querySelector('.academic-focus-card'),
    page.querySelector('.academic-list-head'),
    ...page.querySelectorAll('.academic-list-item'),
    page.querySelector('.academic-status'),
  ].filter(Boolean)
  nodes.forEach((node, index) => {
    node.animate([
      { opacity: 0, transform: 'translate3d(0, 10px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], {
      duration: 520,
      delay: Math.min(index * 42, 210),
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    })
  })
}

function beginStudyTransition(event) {
  const button = event.target.closest?.('.preview-v2-study-hero .preview-v2-primary')
  if (!button) return
  button.closest('.preview-v2-study-hero')?.classList.add('is-study-transitioning')
}

function animateStudyHero() {
  const hero = document.querySelector('.preview-v2-study-hero')
  if (!hero || animatedStudyHeroes.has(hero)) return
  animatedStudyHeroes.add(hero)
  if (reducedMotion()) return
  hero.animate([
    { opacity: 0.55, transform: 'translate3d(0, 5px, 0) scale(0.992)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  ], {
    duration: 480,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'both',
  })
}

function formatDuration(value) {
  const ms = Math.max(0, Number(value || 0))
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours) return `${hours}시간 ${minutes}분`
  if (totalMinutes) return `${totalMinutes}분`
  return '0분'
}

async function getStudySnapshot(force = false) {
  if (!force && studySnapshot && Date.now() - studySnapshotAt < STUDY_CACHE_MS) return studySnapshot
  if (studySnapshotPromise) return studySnapshotPromise
  studySnapshotPromise = authorizedFetch('study')
    .then((payload) => {
      studySnapshot = payload
      studySnapshotAt = Date.now()
      return payload
    })
    .finally(() => { studySnapshotPromise = null })
  return studySnapshotPromise
}

function rankingSection() {
  return Array.from(document.querySelectorAll('.preview-v2-study-section')).find((section) => (
    section.querySelector('.preview-v2-section-head h2')?.textContent.includes('오늘 공부') ||
    section.querySelector('.preview-v2-section-head h2')?.textContent === '랭킹'
  )) || null
}

function renderRanking(payload) {
  const section = rankingSection()
  const list = section?.querySelector('.preview-v2-study-list')
  if (!section || !list || !payload) return
  const values = rankingScope === 'global' ? (payload.globalTotals || []) : (payload.totals || [])
  list.replaceChildren()
  if (!values.length) {
    const empty = document.createElement('p')
    empty.className = 'preview-v2-inline-empty'
    empty.textContent = rankingScope === 'global' ? '오늘 전체 공부 기록이 아직 없어요.' : '오늘 기록된 공부 시간이 없어요.'
    list.appendChild(empty)
    return
  }

  values.slice(0, rankingScope === 'global' ? 50 : 20).forEach((item, index) => {
    const row = document.createElement('div')
    row.className = 'preview-v2-study-row preview-v2-ranking-row'
    const copy = document.createElement('div')
    const strong = document.createElement('strong')
    strong.textContent = `${index + 1}. ${item.name || '학생'}`
    const sub = document.createElement('span')
    if (rankingScope === 'global') sub.textContent = item.classNumber ? `${item.classNumber}반` : ''
    else sub.textContent = item.studentKey === payload.me ? '나' : ''
    copy.append(strong, sub)
    const time = document.createElement('span')
    time.className = 'preview-v2-ranking-time'
    time.textContent = formatDuration(item.totalMs)
    row.append(copy, time)
    list.appendChild(row)
  })
}

function ensureRankingSwitch() {
  const section = rankingSection()
  const head = section?.querySelector('.preview-v2-section-head')
  if (!section || !head) return
  const heading = head.querySelector('h2')
  const meta = head.querySelector('span')
  if (heading) heading.textContent = '랭킹'
  if (meta) meta.textContent = '오늘 누적'

  let segment = section.querySelector('.preview-v2-ranking-segment')
  if (!segment) {
    segment = document.createElement('div')
    segment.className = 'preview-v2-segment preview-v2-ranking-segment'
    ;[['class', '우리 반 랭킹'], ['global', '전체 랭킹']].forEach(([scope, label]) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => {
        if (rankingScope === scope) return
        rankingScope = scope
        Array.from(segment.querySelectorAll(':scope > button')).forEach((item, index) => {
          item.classList.toggle('is-selected', index === (scope === 'global' ? 1 : 0))
        })
        syncSegment(segment)
        getStudySnapshot(true).then(renderRanking).catch(() => {})
      })
      segment.appendChild(button)
    })
    head.insertAdjacentElement('afterend', segment)
  }
  const index = rankingScope === 'global' ? 1 : 0
  Array.from(segment.querySelectorAll(':scope > button')).forEach((button, buttonIndex) => button.classList.toggle('is-selected', buttonIndex === index))
  syncSegment(segment)
  getStudySnapshot().then(renderRanking).catch(() => {})
}

function animateChangedNumber(node) {
  if (!node || reducedMotion() || typeof node.animate !== 'function') return
  node.animate([
    { opacity: 0.5, transform: 'translate3d(0, 2px, 0)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
  ], {
    duration: 260,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  })
}

function handleNumberMutations(mutations) {
  mutations.forEach((mutation) => {
    const target = mutation.type === 'characterData' ? mutation.target.parentElement : mutation.target
    const number = target?.closest?.('.preview-v2-live-time, .preview-v2-study-elapsed, .preview-v2-ranking-time')
    if (number) animateChangedNumber(number)
  })
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0
    syncAIPageState()
    syncStudyIcon()
    polishBoardCopy()
    ensureNativeHeaders()
    syncSegments()
    animateNativePage()
    animateAcademicList()
    animateStudyHero()
    ensureRankingSwitch()
  })
}

function installPreviewUXFixes() {
  document.addEventListener('click', closeAIPageBeforeLeaving, true)
  document.addEventListener('click', bridgeContextChrome, true)
  document.addEventListener('click', beginStudyTransition, true)

  const observer = new MutationObserver((mutations) => {
    handleNumberMutations(mutations)
    scheduleSync()
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-preview-active'],
  })

  scheduleSync()
  window.setTimeout(warmPreviewData, 180)
  window.addEventListener('pagehide', () => {
    observer.disconnect()
    if (syncFrame) window.cancelAnimationFrame(syncFrame)
  }, { once: true })
}

installPreviewUXFixes()
