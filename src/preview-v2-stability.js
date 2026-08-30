import { ensureSignedIn, readStudentProfile } from './school-sync.js'
import './preview-v2-stability.css'

const PREVIEW_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const WARM_TIMEOUT_MS = 8000
const STUDY_CACHE_MS = 9000

let warmingStarted = false
let syncFrame = 0
let rankingScope = 'class'
let studySnapshot = null
let studySnapshotAt = 0
let studySnapshotPromise = null
let routeObserver = null
let navObserver = null
let numberObserver = null
let routeMaskObserver = null
let routeMaskTimer = 0

const springStates = new WeakMap()
const animatedAcademicPages = new WeakSet()
const animatedStudyHeroes = new WeakSet()

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function aiTabActive() {
  return Boolean(document.querySelector('.bottom-nav .nav-button[data-preview-tab="ai"][data-preview-active="true"]'))
}

function syncAIPageState() {
  const sheet = document.querySelector('.s-hub-ai-sheet.unified-school-page')
  document.documentElement.classList.toggle('shub-preview-ai-active', aiTabActive() || Boolean(sheet))
  if (sheet) sheet.classList.add('preview-v2-ai-page')
}

function springPaint(indicator, state) {
  const speed = Math.abs(state.velocity)
  const stretch = Math.min(speed * 0.032, Math.max(10, state.baseWidth * 0.22))
  const movingLeft = state.velocity < 0
  const x = movingLeft ? state.x - stretch : state.x
  const width = state.baseWidth + stretch
  const compression = Math.min(speed / 18000, 0.026)
  indicator.style.width = `${Math.max(1, width)}px`
  indicator.style.transform = `translate3d(${x}px, 0, 0) scaleY(${1 - compression})`
  indicator.style.borderRadius = `${Math.max(11, state.radius - stretch * 0.08)}px`
}

function moveSpringIndicator(container, indicator, target, { immediate = false, radius = 19 } = {}) {
  if (!container || !indicator || !target) return
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (!containerRect.width || !targetRect.width) return

  let state = springStates.get(indicator)
  if (!state) {
    state = { x: 0, velocity: 0, targetX: 0, baseWidth: 0, frame: 0, lastTime: 0, initialized: false, radius }
    springStates.set(indicator, state)
  }

  state.targetX = targetRect.left - containerRect.left
  state.baseWidth = targetRect.width
  state.radius = radius

  if (!state.initialized || immediate || reducedMotion()) {
    if (state.frame) window.cancelAnimationFrame(state.frame)
    state.frame = 0
    state.initialized = true
    state.x = state.targetX
    state.velocity = 0
    state.lastTime = 0
    springPaint(indicator, state)
    return
  }

  if (state.frame) window.cancelAnimationFrame(state.frame)
  state.lastTime = 0

  const animate = (time) => {
    if (!indicator.isConnected || !container.isConnected || !target.isConnected) {
      state.frame = 0
      return
    }
    if (!state.lastTime) state.lastTime = time
    const dt = Math.min((time - state.lastTime) / 1000, 0.032)
    state.lastTime = time
    const displacement = state.x - state.targetX
    const acceleration = (-52 * displacement - 10.5 * state.velocity)
    state.velocity += acceleration * dt
    state.x += state.velocity * dt
    springPaint(indicator, state)

    if (Math.abs(state.x - state.targetX) < 0.06 && Math.abs(state.velocity) < 0.06) {
      state.x = state.targetX
      state.velocity = 0
      state.lastTime = 0
      state.frame = 0
      springPaint(indicator, state)
      return
    }
    state.frame = window.requestAnimationFrame(animate)
  }

  state.frame = window.requestAnimationFrame(animate)
}

function syncNavSpring({ immediate = false } = {}) {
  const nav = document.querySelector('.bottom-nav')
  const indicator = nav?.querySelector('.preview-v2-indicator')
  const buttons = Array.from(nav?.querySelectorAll('.nav-button') || [])
  const selected = buttons.find((button) => button.dataset.previewActive === 'true')
  if (!nav || !indicator || !selected) return
  moveSpringIndicator(nav, indicator, selected, { immediate, radius: 19 })
}

function ensureSegmentSpring(segment, { immediate = true } = {}) {
  if (!segment) return
  let indicator = segment.querySelector(':scope > .preview-v2-segment-indicator')
  if (!indicator) {
    indicator = document.createElement('span')
    indicator.className = 'preview-v2-segment-indicator'
    indicator.setAttribute('aria-hidden', 'true')
    segment.prepend(indicator)
  }
  const buttons = Array.from(segment.querySelectorAll(':scope > button'))
  const selected = buttons.find((button) => button.classList.contains('is-selected')) || buttons[0]
  if (selected) moveSpringIndicator(segment, indicator, selected, { immediate, radius: 12 })
}

function syncAllSegments() {
  document.querySelectorAll('.preview-v2-segment').forEach((segment) => {
    const indicator = segment.querySelector(':scope > .preview-v2-segment-indicator')
    ensureSegmentSpring(segment, { immediate: !indicator || !springStates.has(indicator) })
  })
}

function startRouteMask(kind) {
  if (!['ai', 'study', 'class-board', 'class-timetable'].includes(kind)) return
  if (routeMaskTimer) window.clearTimeout(routeMaskTimer)
  routeMaskObserver?.disconnect()
  document.documentElement.classList.add('shub-preview-route-mask')

  const ready = () => {
    if (kind === 'ai') return Boolean(document.querySelector('.s-hub-ai-sheet.unified-school-page'))
    if (kind === 'study') return Boolean(document.querySelector('.preview-v2-layer[data-preview-page="study"]'))
    if (kind === 'class-board') return Boolean(document.querySelector('.preview-v2-layer .preview-v2-board-actions'))
    return Boolean(document.querySelector('.app-content.tab-timetable .preview-v2-context'))
  }

  const finish = () => {
    if (!ready()) return false
    document.documentElement.classList.remove('shub-preview-route-mask')
    routeMaskObserver?.disconnect()
    routeMaskObserver = null
    if (routeMaskTimer) window.clearTimeout(routeMaskTimer)
    routeMaskTimer = 0
    return true
  }

  if (finish()) return
  routeMaskObserver = new MutationObserver(() => finish())
  routeMaskObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  routeMaskTimer = window.setTimeout(() => {
    document.documentElement.classList.remove('shub-preview-route-mask')
    routeMaskObserver?.disconnect()
    routeMaskObserver = null
    routeMaskTimer = 0
  }, 420)
}

function handleNavPointerDown(event) {
  const button = event.target.closest?.('.bottom-nav .nav-button')
  if (!button) return
  const nav = button.closest('.bottom-nav')
  const indicator = nav?.querySelector('.preview-v2-indicator')
  if (nav && indicator) moveSpringIndicator(nav, indicator, button, { immediate: false, radius: 19 })

  const tab = button.dataset.previewTab
  if (tab === 'ai') startRouteMask('ai')
  else if (tab === 'study') startRouteMask('study')
  else if (tab === 'class') startRouteMask('class-board')
}

function handleSegmentPointerDown(event) {
  const button = event.target.closest?.('.preview-v2-segment > button')
  if (!button || button.classList.contains('is-selected')) return
  const segment = button.parentElement
  if (!segment) return
  const indicator = segment.querySelector(':scope > .preview-v2-segment-indicator')
  if (indicator) moveSpringIndicator(segment, indicator, button, { immediate: false, radius: 12 })

  const labels = Array.from(segment.querySelectorAll(':scope > button')).map((item) => item.textContent.trim()).join('|')
  if (labels === '게시판|시간표') {
    startRouteMask(button.textContent.trim() === '게시판' ? 'class-board' : 'class-timetable')
  }
}

function closeAIOnNavigation(event) {
  const button = event.target.closest?.('.bottom-nav .nav-button')
  if (!button || button.dataset.previewTab === 'ai') return
  const sheet = document.querySelector('.s-hub-ai-sheet.unified-school-page')
  if (!sheet) return
  const close = sheet.querySelector('.unified-sheet-close')
  if (close && !close.disabled) close.click()
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

function syncPersistentHeader() {
  const content = document.querySelector('.app-shell > .app-content')
  const section = content?.firstElementChild
  const context = section?.querySelector(':scope > .preview-v2-context')
  if (!content || !section || !context) return
  const kind = content.classList.contains('tab-timetable')
    ? 'class'
    : content.matches('.tab-todo, .tab-academic') ? 'schedule' : ''
  if (!kind) return

  const headers = Array.from(section.children).filter((node) => node.classList.contains('preview-v2-persistent-header'))
  const header = headers.shift() || createPersistentHeader(kind)
  headers.forEach((node) => node.remove())
  const title = header.querySelector('h1')
  const label = header.querySelector('.date-label')
  if (title) title.textContent = kind === 'class' ? '우리 반' : '일정'
  if (label) label.textContent = kind === 'class' ? `${readStudentProfile()?.classNumber || ''}반` : '학교생활'
  if (header.nextElementSibling !== context) section.insertBefore(header, context)
}

function polishBoardCopy() {
  const root = document.querySelector('.preview-v2-layer')
  if (!root) return
  const replacements = new Map([
    ['아직 글이 없어', '아직 글이 없어요.'],
    ['첫 질문이나 반 소식을 올려봐.', '첫 질문이나 반 소식을 올려 보세요.'],
  ])
  root.querySelectorAll('*').forEach((node) => {
    if (node.children.length) return
    const next = replacements.get(node.textContent)
    if (next) node.textContent = next
  })
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
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 5.8c2.7-.8 5.1-.35 7.8 1.3v11.8c-2.7-1.65-5.1-2.1-7.8-1.3zM19.8 5.8c-2.7-.8-5.1-.35-7.8 1.3v11.8c2.7-1.65 5.1-2.1 7.8-1.3z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7.1v11.8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>'
}

function beginStudyTransition(event) {
  const button = event.target.closest?.('.preview-v2-study-hero .preview-v2-primary')
  if (!button) return
  const hero = button.closest('.preview-v2-study-hero')
  hero?.classList.add('is-study-transitioning')
  window.setTimeout(() => hero?.classList.remove('is-study-transitioning'), 900)
}

function animateStudyHero() {
  const hero = document.querySelector('.preview-v2-study-hero')
  if (!hero || animatedStudyHeroes.has(hero)) return
  animatedStudyHeroes.add(hero)
  if (reducedMotion() || typeof hero.animate !== 'function') return
  hero.animate([
    { opacity: 0.76, transform: 'translate3d(0, 4px, 0) scale(0.996)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  ], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
}

function animateNumber(node) {
  if (!node || reducedMotion() || typeof node.animate !== 'function') return
  node.animate([
    { opacity: 0.76, transform: 'translate3d(0, 1.5px, 0)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
  ], { duration: 170, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
}

function attachNumberObserver() {
  const layer = document.querySelector('.preview-v2-layer')
  if (!layer || layer.dataset.numberObserverReady === 'true') return
  numberObserver?.disconnect()
  layer.dataset.numberObserverReady = 'true'
  numberObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const element = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target
      const number = element?.closest?.('.preview-v2-live-time, .preview-v2-study-elapsed, .preview-v2-ranking-time')
      if (number) animateNumber(number)
    })
  })
  numberObserver.observe(layer, { subtree: true, characterData: true, childList: true })
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
  return Array.from(document.querySelectorAll('.preview-v2-study-section')).find((section) => {
    const title = section.querySelector('.preview-v2-section-head h2')?.textContent.trim()
    return title === '오늘 공부' || title === '랭킹'
  }) || null
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
    sub.textContent = rankingScope === 'global' ? (item.classNumber ? `${item.classNumber}반` : '') : (item.studentKey === payload.me ? '나' : '')
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
  head.querySelector('h2').textContent = '랭킹'
  const meta = head.querySelector('span')
  if (meta) meta.textContent = '오늘 누적'

  let segment = section.querySelector('.preview-v2-ranking-segment')
  if (segment) return
  segment = document.createElement('div')
  segment.className = 'preview-v2-segment preview-v2-ranking-segment'
  ;[['class', '우리 반 랭킹'], ['global', '전체 랭킹']].forEach(([scope, label]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.classList.toggle('is-selected', scope === rankingScope)
    button.addEventListener('click', () => {
      rankingScope = scope
      Array.from(segment.querySelectorAll(':scope > button')).forEach((item) => item.classList.toggle('is-selected', item === button))
      ensureSegmentSpring(segment, { immediate: false })
      getStudySnapshot(true).then(renderRanking).catch(() => {})
    })
    segment.appendChild(button)
  })
  head.insertAdjacentElement('afterend', segment)
  ensureSegmentSpring(segment, { immediate: true })
  getStudySnapshot().then(renderRanking).catch(() => {})
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
    if (typeof node.animate !== 'function') return
    node.animate([
      { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], {
      duration: 460,
      delay: Math.min(index * 34, 170),
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    })
  })
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
    // Warming must never block the real route.
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
    await Promise.allSettled([fetchWarmResource('board', token), fetchWarmResource('study', token)])
  } catch {
    // Normal route requests surface auth/network errors.
  }
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0
    syncAIPageState()
    syncStudyIcon()
    polishBoardCopy()
    syncPersistentHeader()
    syncAllSegments()
    animateStudyHero()
    attachNumberObserver()
    ensureRankingSwitch()
    animateAcademicList()
  })
}

function installPreviewStability() {
  document.addEventListener('pointerdown', handleNavPointerDown, true)
  document.addEventListener('pointerdown', handleSegmentPointerDown, true)
  document.addEventListener('click', closeAIOnNavigation, true)
  document.addEventListener('click', beginStudyTransition, true)

  const shell = document.querySelector('.app-shell') || document.body
  routeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList' || mutation.type === 'attributes')) scheduleSync()
  })
  routeObserver.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })

  const nav = document.querySelector('.bottom-nav')
  if (nav) {
    navObserver = new MutationObserver(() => {
      syncNavSpring()
      scheduleSync()
    })
    navObserver.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-preview-active'] })
  }

  window.addEventListener('resize', () => {
    syncNavSpring({ immediate: true })
    syncAllSegments()
  }, { passive: true })

  scheduleSync()
  window.requestAnimationFrame(() => syncNavSpring({ immediate: true }))
  window.setTimeout(warmPreviewData, 180)

  window.addEventListener('pagehide', () => {
    routeObserver?.disconnect()
    navObserver?.disconnect()
    numberObserver?.disconnect()
    routeMaskObserver?.disconnect()
    if (syncFrame) window.cancelAnimationFrame(syncFrame)
    if (routeMaskTimer) window.clearTimeout(routeMaskTimer)
    document.documentElement.classList.remove('shub-preview-route-mask')
  }, { once: true })
}

installPreviewStability()
