import { ensureSignedIn, readStudentProfile } from './school-sync.js'
import './preview-v2.css'

const PREVIEW_PATH = '/preview-v2/'
const API_URL = String(import.meta.env.VITE_SHUB_PREVIEW_API_URL || 'https://school-reminder-backend.vercel.app/api/class-roster').trim()
const ROUTE_REFRESH_MS = 12_000
const STUDY_HEARTBEAT_MS = 20_000

const routeState = {
  tab: 'home',
  classView: 'board',
  scheduleView: 'todo',
}

let allowNativeNav = false
let nav = null
let navButtons = []
let routeLayer = null
let refreshTimer = 0
let heartbeatTimer = 0
let secondTimer = 0
let boardPosts = []
let boardLoaded = false
let studyData = null
let studyLoaded = false
let boardComposeOpen = false
let boardComposeKind = 'general'
let aiReturnRoute = null
let aiWasOpen = false
let navObserver = null
let aiObserver = null
let routeGeneration = 0

function inPreviewMode() {
  return window.location.pathname.includes(PREVIEW_PATH)
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function formatDuration(value) {
  const ms = Math.max(0, Number(value || 0))
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours) return `${hours}시간 ${minutes}분`
  if (totalMinutes) return `${totalMinutes}분`
  return '0분'
}

function liveDuration(startedAt) {
  const ms = Math.max(0, Date.now() - Number(startedAt || Date.now()))
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`.replace(/^0:/, '')
}

function relativeTime(value) {
  const ms = Math.max(0, Date.now() - Number(value || 0))
  if (ms < 60_000) return '방금'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

async function api(resource, { method = 'GET', body = null } = {}) {
  const user = await ensureSignedIn()
  const token = await user.getIdToken()
  const url = method === 'GET' ? `${API_URL}?resource=${encodeURIComponent(resource)}` : API_URL
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify({ resource, ...(body || {}) }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || '테스트 기능을 불러오지 못했어요.')
    error.status = response.status
    throw error
  }
  return payload
}

function iconSvg(type) {
  const paths = {
    home: '<path d="M3.5 10.7 12 3.8l8.5 6.9"/><path d="M5.5 9.8v10h13v-10"/><path d="M9.2 19.8v-6.2h5.6v6.2"/>',
    class: '<path d="M5 19v-9.5L12 5l7 4.5V19"/><path d="M8.5 19v-5h7v5"/><path d="M7.5 8V5h3"/>',
    study: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/>',
    schedule: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="M8 13h3"/><path d="M8 16.5h8"/>',
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type] || ''}</svg>`
}

function makeTabButton(id, label, index) {
  const button = el('button', `preview-v2-nav-button${routeState.tab === id ? ' active' : ''}`)
  button.type = 'button'
  button.dataset.previewTab = id
  button.setAttribute('aria-label', label)
  if (id === 'ai') {
    const orb = el('span', 'preview-v2-ai-orb')
    orb.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>'
    button.append(orb, el('span', 'preview-v2-nav-label', label))
  } else {
    const icon = el('span', 'preview-v2-nav-icon')
    icon.innerHTML = iconSvg(id)
    button.append(icon, el('span', 'preview-v2-nav-label', label))
  }
  button.addEventListener('click', () => navigate(id, index))
  return button
}

function installNavigation() {
  const native = document.querySelector('.bottom-nav')
  if (!native || native.dataset.previewV2Ready === 'true') return false
  native.dataset.previewV2Ready = 'true'
  native.classList.add('preview-v2-nav-host')
  native.innerHTML = ''

  const indicator = el('span', 'preview-v2-nav-indicator')
  native.appendChild(indicator)
  const tabs = [
    ['home', '홈'],
    ['class', '우리 반'],
    ['ai', 'AI'],
    ['study', '공부'],
    ['schedule', '일정'],
  ]
  navButtons = tabs.map(([id, label], index) => {
    const button = makeTabButton(id, label, index)
    native.appendChild(button)
    return button
  })
  nav = native
  updateNavIndicator(true)
  return true
}

function updateNavIndicator(immediate = false) {
  if (!nav) return
  const indicator = nav.querySelector('.preview-v2-nav-indicator')
  const activeIndex = Math.max(0, navButtons.findIndex((button) => button.dataset.previewTab === routeState.tab))
  const button = navButtons[activeIndex]
  if (!indicator || !button) return
  navButtons.forEach((item) => item.classList.toggle('active', item === button))
  const navRect = nav.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  if (immediate) indicator.style.transition = 'none'
  indicator.style.width = `${buttonRect.width}px`
  indicator.style.transform = `translate3d(${buttonRect.left - navRect.left}px,0,0)`
  if (immediate) requestAnimationFrame(() => { indicator.style.transition = '' })
}

function clickNativeTab(tabId) {
  const button = document.querySelector(`.bottom-nav [data-tab="${tabId}"]`)
  if (!button) return false
  allowNativeNav = true
  button.click()
  allowNativeNav = false
  return true
}

function hideRouteLayer() {
  if (!routeLayer) return
  routeLayer.classList.remove('visible')
  routeLayer.setAttribute('aria-hidden', 'true')
}

function showRouteLayer() {
  if (!routeLayer) return
  routeLayer.classList.add('visible')
  routeLayer.setAttribute('aria-hidden', 'false')
}

function navigate(id, index = -1) {
  if (!inPreviewMode()) return
  if (routeState.tab === id && id !== 'ai') return
  const oldIndex = Math.max(0, navButtons.findIndex((button) => button.dataset.previewTab === routeState.tab))
  const newIndex = index >= 0 ? index : Math.max(0, navButtons.findIndex((button) => button.dataset.previewTab === id))
  document.documentElement.style.setProperty('--preview-route-direction', newIndex >= oldIndex ? '1' : '-1')
  routeState.tab = id
  updateNavIndicator()

  if (id === 'home') {
    hideRouteLayer()
    clickNativeTab('home')
    return
  }
  if (id === 'ai') {
    hideRouteLayer()
    clickNativeTab('home')
    openAI()
    return
  }
  if (id === 'class') {
    showRouteLayer()
    renderClassRoute()
    refreshBoard()
    return
  }
  if (id === 'study') {
    showRouteLayer()
    renderStudyRoute()
    refreshStudy()
    return
  }
  if (id === 'schedule') {
    showRouteLayer()
    renderScheduleRoute()
  }
}

function openAI() {
  const trigger = document.querySelector('[data-s-hub-ai-trigger], .school-ai-trigger, .home-ai-trigger')
  if (trigger) {
    aiReturnRoute = routeState.tab
    trigger.click()
  }
}

function pageShell(title, subtitle = '') {
  const page = el('section', 'preview-v2-page')
  const head = el('header', 'preview-v2-page-head')
  const copy = el('div')
  copy.append(el('p', 'preview-v2-kicker', 'S-Hub Preview'), el('h1', '', title))
  if (subtitle) copy.append(el('p', 'preview-v2-page-copy', subtitle))
  head.append(copy)
  page.append(head)
  return page
}

function renderClassRoute() {
  if (!routeLayer) return
  const page = pageShell('우리 반', '반 시간표와 친구들의 질문·투표를 한곳에서 확인해요.')
  const segmented = el('div', 'preview-v2-segmented')
  ;[['board', '게시판'], ['timetable', '시간표']].forEach(([id, label]) => {
    const button = el('button', routeState.classView === id ? 'active' : '', label)
    button.type = 'button'
    button.addEventListener('click', () => {
      routeState.classView = id
      renderClassRoute()
    })
    segmented.append(button)
  })
  page.append(segmented)

  if (routeState.classView === 'timetable') {
    const card = el('div', 'preview-v2-card preview-v2-forward-card')
    card.append(el('strong', '', '반 시간표'), el('p', '', '기존 S-Hub 시간표를 그대로 사용해요.'))
    const button = el('button', 'preview-v2-primary', '시간표 열기')
    button.type = 'button'
    button.addEventListener('click', () => {
      hideRouteLayer()
      clickNativeTab('timetable')
    })
    card.append(button)
    page.append(card)
    routeLayer.replaceChildren(page)
    return
  }

  const actions = el('div', 'preview-v2-board-actions')
  const general = el('button', 'preview-v2-secondary', '글 쓰기')
  const question = el('button', 'preview-v2-primary', '질문하기')
  general.type = 'button'
  question.type = 'button'
  general.addEventListener('click', () => openComposer('general'))
  question.addEventListener('click', () => openComposer('question'))
  actions.append(general, question)
  page.append(actions)

  const list = el('div', 'preview-v2-post-list')
  if (!boardLoaded) list.append(el('div', 'preview-v2-empty', '게시판을 불러오는 중이에요.'))
  else if (!boardPosts.length) list.append(el('div', 'preview-v2-empty', '아직 게시물이 없어요. 첫 글을 남겨 보세요.'))
  else boardPosts.forEach((post) => list.append(renderPost(post)))
  page.append(list)
  routeLayer.replaceChildren(page)
}

function renderPost(post) {
  const card = el('article', 'preview-v2-card preview-v2-post')
  const meta = el('div', 'preview-v2-post-meta')
  meta.append(
    el('span', `preview-v2-kind ${post.kind === 'question' ? 'question' : ''}`, post.kind === 'question' ? '질문' : '일반'),
    el('span', '', `${post.authorName || '학생'} · ${relativeTime(post.createdAt)}`),
  )
  if (post.kind === 'question' && post.resolved) meta.append(el('span', 'preview-v2-resolved', '해결됨'))
  card.append(meta, el('h2', '', post.title || '제목 없음'), el('p', 'preview-v2-post-body', post.body || ''))

  const replies = el('div', 'preview-v2-replies')
  ;(post.replies || []).forEach((reply) => {
    const item = el('div', 'preview-v2-reply')
    item.append(el('strong', '', reply.authorName || '학생'), el('span', '', reply.body || ''))
    replies.append(item)
  })
  card.append(replies)

  const replyForm = el('form', 'preview-v2-reply-form')
  const input = document.createElement('input')
  input.placeholder = post.kind === 'question' ? '답변 남기기' : '댓글 남기기'
  input.maxLength = 500
  const submit = el('button', '', '등록')
  submit.type = 'submit'
  replyForm.append(input, submit)
  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const body = input.value.trim()
    if (!body) return
    submit.disabled = true
    try {
      await api('board-reply', { method: 'POST', body: { postId: post.id, body } })
      input.value = ''
      await refreshBoard(true)
    } catch (error) {
      alert(error.message)
    } finally {
      submit.disabled = false
    }
  })
  card.append(replyForm)

  if (post.kind === 'question' && post.canResolve && !post.resolved) {
    const resolveButton = el('button', 'preview-v2-resolve', '해결됨으로 표시')
    resolveButton.type = 'button'
    resolveButton.addEventListener('click', async () => {
      resolveButton.disabled = true
      try {
        await api('board-resolve', { method: 'POST', body: { postId: post.id } })
        await refreshBoard(true)
      } catch (error) {
        alert(error.message)
      } finally {
        resolveButton.disabled = false
      }
    })
    card.append(resolveButton)
  }
  return card
}

function openComposer(kind) {
  if (boardComposeOpen) return
  boardComposeOpen = true
  boardComposeKind = kind
  const layer = el('div', 'preview-v2-compose-layer')
  const sheet = el('form', 'preview-v2-compose-sheet')
  const handle = el('span', 'preview-v2-sheet-handle')
  const title = el('h2', '', kind === 'question' ? '질문하기' : '글 쓰기')
  const titleInput = document.createElement('input')
  titleInput.placeholder = kind === 'question' ? '무엇이 궁금한가요?' : '제목'
  titleInput.maxLength = 80
  const bodyInput = document.createElement('textarea')
  bodyInput.placeholder = kind === 'question' ? '친구들이 이해하기 쉽게 적어 주세요.' : '내용'
  bodyInput.maxLength = 1500
  bodyInput.rows = 6
  const actions = el('div', 'preview-v2-compose-actions')
  const cancel = el('button', '', '취소')
  const submit = el('button', 'preview-v2-primary', '등록')
  cancel.type = 'button'
  submit.type = 'submit'
  actions.append(cancel, submit)
  sheet.append(handle, title, titleInput, bodyInput, actions)
  layer.append(sheet)
  document.body.append(layer)
  requestAnimationFrame(() => layer.classList.add('open'))
  window.setTimeout(() => titleInput.focus(), 260)

  const close = () => {
    layer.classList.remove('open')
    window.setTimeout(() => layer.remove(), 360)
    boardComposeOpen = false
  }
  cancel.addEventListener('click', close)
  layer.addEventListener('click', (event) => {
    if (event.target === layer) close()
  })
  sheet.addEventListener('submit', async (event) => {
    event.preventDefault()
    const postTitle = titleInput.value.trim()
    const postBody = bodyInput.value.trim()
    if (!postTitle || !postBody) return
    submit.disabled = true
    try {
      await api('board-create', { method: 'POST', body: { kind: boardComposeKind, title: postTitle, body: postBody } })
      close()
      await refreshBoard(true)
    } catch (error) {
      alert(error.message)
      submit.disabled = false
    }
  })
}

async function refreshBoard(forceRender = false) {
  if (!inPreviewMode()) return
  try {
    const payload = await api('board-list')
    boardPosts = Array.isArray(payload.posts) ? payload.posts : []
    boardLoaded = true
    if (routeState.tab === 'class' && (forceRender || routeState.classView === 'board')) renderClassRoute()
  } catch (error) {
    boardLoaded = true
    if (routeState.tab === 'class') {
      renderClassRoute()
      const empty = routeLayer?.querySelector('.preview-v2-empty')
      if (empty) empty.textContent = error.message
    }
  }
}

function renderStudyRoute() {
  if (!routeLayer) return
  const page = pageShell('공부', '혼자 시작해도 기록되고, 친구가 공부 중이면 바로 보여요.')
  const mine = studyData?.me || null
  const active = Array.isArray(studyData?.active) ? studyData.active : []
  const today = studyData?.today || { durationMs: 0 }

  const hero = el('div', `preview-v2-study-hero${mine ? ' active' : ''}`)
  if (mine) {
    hero.append(el('p', 'preview-v2-kicker', '공부 중'), el('strong', 'preview-v2-live-time', liveDuration(mine.startedAt)), el('span', '', mine.subject || '공부'))
    const stop = el('button', 'preview-v2-study-stop', '공부 종료')
    stop.type = 'button'
    stop.addEventListener('click', stopStudy)
    hero.append(stop)
  } else {
    hero.append(el('p', 'preview-v2-kicker', '오늘 공부'), el('strong', '', formatDuration(today.durationMs)), el('span', '', '타이머를 시작하면 친구들에게 공부 중으로 보여요.'))
    const form = el('form', 'preview-v2-study-start')
    const input = document.createElement('input')
    input.placeholder = '과목 (예: 수학)'
    input.maxLength = 30
    const start = el('button', 'preview-v2-primary', '공부 시작')
    start.type = 'submit'
    form.append(input, start)
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const subject = input.value.trim()
      if (!subject) return
      start.disabled = true
      try {
        await api('study-start', { method: 'POST', body: { subject } })
        await refreshStudy(true)
      } catch (error) {
        alert(error.message)
      } finally {
        start.disabled = false
      }
    })
    hero.append(form)
  }
  page.append(hero)

  const section = el('section', 'preview-v2-study-section')
  const head = el('div', 'preview-v2-section-head')
  head.append(el('h2', '', `지금 공부 중 ${active.length}명`), el('span', '', '20초마다 상태 확인'))
  section.append(head)
  const list = el('div', 'preview-v2-study-list')
  if (!studyLoaded) list.append(el('div', 'preview-v2-empty', '공부 상태를 불러오는 중이에요.'))
  else if (!active.length) list.append(el('div', 'preview-v2-empty', '지금 공부 중인 친구가 없어요. 먼저 시작해 보세요.'))
  else active.forEach((item) => {
    const row = el('div', 'preview-v2-study-row')
    const copy = el('div')
    copy.append(el('strong', '', item.name || '학생'), el('span', '', item.subject || '공부'))
    row.append(el('i', 'preview-v2-live-dot'), copy, el('time', '', liveDuration(item.startedAt)))
    list.append(row)
  })
  section.append(list)
  page.append(section)
  routeLayer.replaceChildren(page)
}

async function refreshStudy(forceRender = false) {
  if (!inPreviewMode()) return
  try {
    const payload = await api('study-status')
    studyData = payload
    studyLoaded = true
    if (routeState.tab === 'study' || forceRender) renderStudyRoute()
  } catch (error) {
    studyLoaded = true
    if (routeState.tab === 'study') {
      renderStudyRoute()
      const empty = routeLayer?.querySelector('.preview-v2-empty')
      if (empty) empty.textContent = error.message
    }
  }
}

async function stopStudy() {
  try {
    await api('study-stop', { method: 'POST' })
    await refreshStudy(true)
  } catch (error) {
    alert(error.message)
  }
}

async function studyHeartbeat() {
  if (!studyData?.me || document.hidden || !inPreviewMode()) return
  try {
    await api('study-heartbeat', { method: 'POST' })
  } catch {
    // A later status refresh will reconcile a stale session.
  }
}

function renderScheduleRoute() {
  if (!routeLayer) return
  const page = pageShell('일정', '리마인더와 학사일정을 한곳에서 이동해 확인해요.')
  const segmented = el('div', 'preview-v2-segmented')
  ;[['todo', '리마인더'], ['academic', '학사일정']].forEach(([id, label]) => {
    const button = el('button', routeState.scheduleView === id ? 'active' : '', label)
    button.type = 'button'
    button.addEventListener('click', () => {
      routeState.scheduleView = id
      renderScheduleRoute()
    })
    segmented.append(button)
  })
  page.append(segmented)

  const destination = routeState.scheduleView === 'todo' ? 'todo' : 'academic'
  const card = el('div', 'preview-v2-card preview-v2-forward-card')
  card.append(
    el('strong', '', destination === 'todo' ? '리마인더' : '학사일정'),
    el('p', '', destination === 'todo'
      ? '기존 실시간 리마인더 화면을 그대로 사용해요.'
      : '기존 반 학사일정 화면을 그대로 사용해요.'),
  )
  const button = el('button', 'preview-v2-primary', destination === 'todo' ? '리마인더 열기' : '학사일정 열기')
  button.type = 'button'
  button.addEventListener('click', () => {
    hideRouteLayer()
    clickNativeTab(destination)
  })
  card.append(button)
  page.append(card)
  routeLayer.replaceChildren(page)
}

function installRouteLayer() {
  if (routeLayer?.isConnected) return true
  const appShell = document.querySelector('.app-shell')
  const content = appShell?.querySelector('.app-content')
  if (!content) return false
  routeLayer = el('div', 'preview-v2-route-layer')
  routeLayer.setAttribute('aria-hidden', 'true')
  content.append(routeLayer)
  return true
}

function interceptNativeNavigation() {
  document.addEventListener('click', (event) => {
    if (!inPreviewMode() || allowNativeNav) return
    const target = event.target.closest?.('.bottom-nav button')
    if (!target || target.dataset.previewTab) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}

function watchAI() {
  aiObserver?.disconnect()
  aiObserver = new MutationObserver(() => {
    const open = Boolean(document.querySelector('.school-ai-sheet, .s-hub-ai-sheet, [data-s-hub-ai-sheet]'))
    if (aiWasOpen && !open && aiReturnRoute === 'ai') {
      routeState.tab = 'home'
      updateNavIndicator()
      aiReturnRoute = null
    }
    aiWasOpen = open
  })
  aiObserver.observe(document.body, { childList: true, subtree: true })
}

function installTimers() {
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      if (document.hidden || !inPreviewMode()) return
      if (routeState.tab === 'class') refreshBoard()
      if (routeState.tab === 'study') refreshStudy()
    }, ROUTE_REFRESH_MS)
  }
  if (!heartbeatTimer) heartbeatTimer = window.setInterval(studyHeartbeat, STUDY_HEARTBEAT_MS)
  if (!secondTimer) {
    secondTimer = window.setInterval(() => {
      if (routeState.tab !== 'study' || !studyData?.me) return
      routeLayer?.querySelectorAll('.preview-v2-live-time, .preview-v2-study-row time').forEach((node, index) => {
        const source = index === 0 ? studyData.me : studyData.active?.[index - 1]
        if (source?.startedAt) node.textContent = liveDuration(source.startedAt)
      })
    }, 1000)
  }
}

function waitForApp() {
  const ready = () => Boolean(document.querySelector('.app-shell') && document.querySelector('.bottom-nav'))
  const install = () => {
    if (!ready()) return false
    installNavigation()
    installRouteLayer()
    interceptNativeNavigation()
    watchAI()
    installTimers()
    document.documentElement.classList.add('preview-v2-active')
    document.body.classList.add('preview-v2-active')
    return true
  }
  if (install()) return
  navObserver?.disconnect()
  navObserver = new MutationObserver(() => {
    if (!install()) return
    navObserver.disconnect()
  })
  navObserver.observe(document.documentElement, { childList: true, subtree: true })
}

if (inPreviewMode()) waitForApp()
