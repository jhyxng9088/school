import { ensureSignedIn, readStudentProfile } from './school-sync.js'
import './preview-v2-hotfix.css'

const PREVIEW_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const WARM_TIMEOUT_MS = 8000
const STUDY_CACHE_MS = 9000
const SEGMENT_ROUTE_DELAY_MS = 190
const TRANSITION_FAILSAFE_MS = 720

let warmingStarted = false
let syncFrame = 0
let rankingScope = 'class'
let studySnapshot = null
let studySnapshotAt = 0
let studySnapshotPromise = null
let routeObserver = null
let navObserver = null
let numberObserver = null
let aiRetryTimer = 0
let transitionChrome = null
let transitionTimer = 0

const replayClicks = new WeakSet()
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
  const stretch = Math.min(speed * 0.032, Math.max(12, state.baseWidth * 0.24))
  const movingLeft = state.velocity < 0
  const x = movingLeft ? state.x - stretch : state.x
  const width = state.baseWidth + stretch
  const compression = Math.min(speed / 18000, 0.028)
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
    const acceleration = (-50 * displacement - 10 * state.velocity)
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
  if (!segment || segment.closest('.preview-v2-transition-chrome')) return
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

function segmentKind(segment) {
  if (segment.classList.contains('preview-v2-ranking-segment')) return 'ranking'
  const labels = Array.from(segment.querySelectorAll(':scope > button')).map((button) => button.textContent.trim()).join('|')
  if (labels === '게시판|시간표') return 'class'
  if (labels === '리마인더|학사일정') return 'schedule'
  return 'local'
}

function groupedHeaderFor(segment) {
  const context = segment.closest('.preview-v2-context')
  if (context) {
    const previous = context.previousElementSibling
    if (previous?.classList.contains('preview-v2-persistent-header')) return previous
  }
  const layer = segment.closest('.preview-v2-layer')
  return layer?.querySelector(':scope > .preview-v2-page-header') || null
}

function removeTransitionChrome() {
  if (transitionTimer) window.clearTimeout(transitionTimer)
  transitionTimer = 0
  transitionChrome?.remove()
  transitionChrome = null
}

function createTransitionChrome(segment, targetButton) {
  const kind = segmentKind(segment)
  if (kind !== 'class' && kind !== 'schedule') return null
  const header = groupedHeaderFor(segment)
  if (!header) return null

  removeTransitionChrome()
  const headerRect = header.getBoundingClientRect()
  const segmentRect = segment.getBoundingClientRect()
  const left = Math.min(headerRect.left, segmentRect.left)
  const right = Math.max(headerRect.right, segmentRect.right)
  const top = headerRect.top
  const bottom = segmentRect.bottom + 8

  const chrome = document.createElement('div')
  chrome.className = 'preview-v2-transition-chrome'
  chrome.style.left = `${left}px`
  chrome.style.top = `${top}px`
  chrome.style.width = `${right - left}px`
  chrome.style.height = `${Math.max(1, bottom - top)}px`

  const headerClone = header.cloneNode(true)
  const segmentClone = segment.cloneNode(true)
  headerClone.classList.add('preview-v2-transition-header')
  segmentClone.classList.add('preview-v2-transition-segment')
  headerClone.style.width = `${headerRect.width}px`
  segmentClone.style.width = `${segmentRect.width}px`
  segmentClone.style.marginTop = `${Math.max(0, segmentRect.top - headerRect.bottom)}px`

  chrome.append(headerClone, segmentClone)
  document.body.appendChild(chrome)
  transitionChrome = chrome

  const cloneButtons = Array.from(segmentClone.querySelectorAll(':scope > button'))
  const sourceButtons = Array.from(segment.querySelectorAll(':scope > button'))
  const targetIndex = Math.max(0, sourceButtons.indexOf(targetButton))
  cloneButtons.forEach((button, index) => button.classList.toggle('is-selected', index === targetIndex))
  const cloneIndicator = segmentClone.querySelector(':scope > .preview-v2-segment-indicator')
  if (cloneIndicator && cloneButtons[targetIndex]) {
    const sourceIndicator = segment.querySelector(':scope > .preview-v2-segment-indicator')
    const state = sourceIndicator ? springStates.get(sourceIndicator) : null
    if (state) {
      cloneIndicator.style.width = `${state.baseWidth}px`
      cloneIndicator.style.transform = `translate3d(${state.x}px,0,0)`
    }
    moveSpringIndicator(segmentClone, cloneIndicator, cloneButtons[targetIndex], { immediate: false, radius: 12 })
  }

  transitionTimer = window.setTimeout(removeTransitionChrome, TRANSITION_FAILSAFE_MS)
  return chrome
}

function groupedRouteReady(targetLabel) {
  const segments = Array.from(document.querySelectorAll('.preview-v2-segment'))
    .filter((segment) => !segment.closest('.preview-v2-transition-chrome'))
  return segments.some((segment) => (
    Array.from(segment.querySelectorAll(':scope > button')).some((button) => (
      button.classList.contains('is-selected') && button.textContent.trim() === targetLabel
    ))
  ))
}

function finishTransitionWhenReady(targetLabel) {
  const started = performance.now()
  const check = () => {
    if (!transitionChrome) return
    if (groupedRouteReady(targetLabel) || performance.now() - started > 480) {
      transitionChrome.classList.add('is-leaving')
      window.setTimeout(removeTransitionChrome, reducedMotion() ? 0 : 135)
      return
    }
    window.requestAnimationFrame(check)
  }
  window.requestAnimationFrame(check)
}

function handleSegmentClick(event) {
  const button = event.target.closest?.('.preview-v2-segment > button')
  if (!button || replayClicks.has(button) || button.classList.contains('is-selected')) return
  const segment = button.parentElement
  if (!segment) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const buttons = Array.from(segment.querySelectorAll(':scope > button'))
  buttons.forEach((item) => item.classList.toggle('is-selected', item === button))
  const indicator = segment.querySelector(':scope > .preview-v2-segment-indicator')
  if (indicator) moveSpringIndicator(segment, indicator, button, { immediate: false, radius: 12 })

  const kind = segmentKind(segment)

  const delay = reducedMotion() ? 0 : SEGMENT_ROUTE_DELAY_MS
  window.setTimeout(() => {
    if (kind === 'class' || kind === 'schedule') createTransitionChrome(segment, button)
    replayClicks.add(button)
    button.click()
    replayClicks.delete(button)
    if (kind === 'class' || kind === 'schedule') finishTransitionWhenReady(button.textContent.trim())
  }, delay)
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

  const existing = Array.from(section.children).filter((node) => node.classList.contains('preview-v2-persistent-header'))
  const header = existing.shift() || createPersistentHeader(kind)
  existing.forEach((node) => node.remove())

  const expectedTitle = kind === 'class' ? '우리 반' : '일정'
  const expectedLabel = kind === 'class' ? `${readStudentProfile()?.classNumber || ''}반` : '학교생활'
  header.querySelector('h1').textContent = expectedTitle
  header.querySelector('.date-label').textContent = expectedLabel

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
  window.setTimeout(() => hero?.classList.remove('is-study-transitioning'), 1000)
}

function animateStudyHero() {
  const hero = document.querySelector('.preview-v2-study-hero')
  if (!hero || animatedStudyHeroes.has(hero)) return
  animatedStudyHeroes.add(hero)
  if (reducedMotion()) return
  hero.animate([
    { opacity: 0.72, transform: 'translate3d(0, 4px, 0) scale(0.995)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  ], {
    duration: 430,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  })
}

function animateNumber(node) {
  if (!node || reducedMotion() || typeof node.animate !== 'function') return
  node.animate([
    { opacity: 0.72, transform: 'translate3d(0, 1.5px, 0)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
  ], { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
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
  if (!segment) {
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
      { opacity: 0, transform: 'translate3d(0, 9px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], {
      duration: 500,
      delay: Math.min(index * 38, 190),
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

function retryAIPage() {
  if (aiRetryTimer) window.clearTimeout(aiRetryTimer)
  const started = performance.now()
  const tick = () => {
    if (document.querySelector('.s-hub-ai-sheet.unified-school-page')) {
      syncAIPageState()
      aiRetryTimer = 0
      return
    }
    const trigger = document.querySelector('.home-ai-trigger')
    trigger?.click()
    if (performance.now() - started < 1500) aiRetryTimer = window.setTimeout(tick, 70)
    else aiRetryTimer = 0
  }
  tick()
}

function routeToPreviewTab(tab) {
  const router = window.__shubPreviewV2
  if (!router) return
  if (tab === 'home') router.openHome?.()
  else if (tab === 'class') router.openClass?.('board')
  else if (tab === 'study') router.openStudy?.()
  else if (tab === 'schedule') router.openSchedule?.('todo')
}

function handleNavClick(event) {
  const button = event.target.closest?.('.bottom-nav .nav-button')
  if (!button) return
  const tab = button.dataset.previewTab
  if (tab === 'ai' && !replayClicks.has(button)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    window.__shubPreviewV2?.openAI?.()
    retryAIPage()
    return
  }

  if (tab !== 'ai' && aiTabActive()) {
    const sheet = document.querySelector('.s-hub-ai-sheet.unified-school-page')
    const close = sheet?.querySelector('.unified-sheet-close')
    if (!sheet || !close || close.disabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    close.click()
    window.setTimeout(() => routeToPreviewTab(tab), 0)
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

function installPreviewUXFixes() {
  document.addEventListener('click', handleNavClick, true)
  document.addEventListener('click', handleSegmentClick, true)
  document.addEventListener('click', beginStudyTransition, true)

  const shell = document.querySelector('.app-shell') || document.body
  routeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) scheduleSync()
  })
  routeObserver.observe(shell, { subtree: true, childList: true })

  const nav = document.querySelector('.bottom-nav')
  if (nav) {
    navObserver = new MutationObserver(() => {
      syncNavSpring()
      scheduleSync()
    })
    navObserver.observe(nav, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-preview-active'],
    })
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
    if (syncFrame) window.cancelAnimationFrame(syncFrame)
    if (aiRetryTimer) window.clearTimeout(aiRetryTimer)
    removeTransitionChrome()
  }, { once: true })
}

installPreviewUXFixes()
