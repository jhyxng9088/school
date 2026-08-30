import { ensureSignedIn, readStudentProfile } from './school-sync.js'
import './preview-v2.css'

const PREVIEW_PATH = '/preview/'
const API_URL = '/api/preview-v2'
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
  return window.location.pathname.startsWith(PREVIEW_PATH)
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
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify({ resource, ...body }) } : {}),
  })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok || !payload?.ok) {
    throw new Error(String(payload?.message || '테스트 기능을 불러오지 못했어요.'))
  }
  return payload
}

function clearRouteTimers() {
  if (refreshTimer) window.clearInterval(refreshTimer)
  if (heartbeatTimer) window.clearInterval(heartbeatTimer)
  if (secondTimer) window.clearInterval(secondTimer)
  refreshTimer = 0
  heartbeatTimer = 0
  secondTimer = 0
}

function removeLayer() {
  routeLayer?.remove()
  routeLayer = null
  const appContent = document.querySelector('.app-shell > .app-content')
  appContent?.classList.remove('preview-v2-underlay-hidden')
}

function nativeNav(index) {
  const button = navButtons[index]
  if (!button) return
  allowNativeNav = true
  button.click()
  allowNativeNav = false
}

function waitFrames(callback, count = 2) {
  if (count <= 0) {
    callback()
    return
  }
  window.requestAnimationFrame(() => waitFrames(callback, count - 1))
}

function setPreviewActive(index) {
  if (!nav) return
  nav.style.setProperty('--preview-index', String(index))
  navButtons.forEach((button, buttonIndex) => {
    button.dataset.previewActive = buttonIndex === index ? 'true' : 'false'
  })
}

function syncUnreadProjection() {
  if (navButtons.length < 5) return
  const sourceUnread = navButtons.map((button) => Boolean(button.querySelector('.school-unread-dot')))
  navButtons[0].dataset.previewUnread = sourceUnread[3] ? 'true' : 'false'
  navButtons[1].dataset.previewUnread = sourceUnread[2] ? 'true' : 'false'
  navButtons[2].dataset.previewUnread = 'false'
  navButtons[3].dataset.previewUnread = 'false'
  navButtons[4].dataset.previewUnread = sourceUnread[1] || sourceUnread[4] ? 'true' : 'false'
}

function navIconMarkup(kind) {
  if (kind === 'home') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 10.6 12 3.8l8.2 6.8v8.7a1 1 0 0 1-1 1h-5.1v-6.2H9.9v6.2H4.8a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>'
  if (kind === 'class') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V6.2c0-.8.6-1.4 1.4-1.4h13.2c.8 0 1.4.6 1.4 1.4v13.3M7.3 8.2h9.4M7.3 11.7h9.4M8 19.5v-4.2h8v4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  if (kind === 'study') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 13V8.7M9.2 3.5h5.6M17.2 6.4l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  if (kind === 'schedule') return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.8" y="5.6" width="16.4" height="14.2" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.7 3.8v3.6M16.3 3.8v3.6M3.8 9.3h16.4M8 13h3M8 16h5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  return ''
}

function startPreviewOrb(canvas) {
  if (!canvas || canvas.dataset.previewOrbReady === 'true') return
  canvas.dataset.previewOrbReady = 'true'
  const size = 25
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const points = Array.from({ length: 54 }, (_, index) => {
    const y = 1 - ((index + 0.5) / 54) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = index * Math.PI * (3 - Math.sqrt(5))
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius }
  })
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0
  let lastDraw = 0
  function draw(time) {
    if (!canvas.isConnected) return
    if (time - lastDraw < 32) {
      frame = window.requestAnimationFrame(draw)
      return
    }
    lastDraw = time
    const angle = reduced ? 0.35 : time * 0.00042
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const color = getComputedStyle(canvas).color || '#8e8e93'
    ctx.clearRect(0, 0, size, size)
    const projected = points.map((point) => {
      const x = point.x * cosine - point.z * sine
      const z = point.x * sine + point.z * cosine
      return { x, y: point.y, z }
    }).sort((a, b) => a.z - b.z)
    for (const point of projected) {
      const depth = (point.z + 1) / 2
      const x = size / 2 + point.x * 8.7
      const y = size / 2 + point.y * 8.7
      ctx.globalAlpha = 0.24 + depth * 0.72
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 0.75 + depth * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    frame = window.requestAnimationFrame(draw)
  }
  frame = window.requestAnimationFrame(draw)
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(frame), { once: true })
}

function syncNavPresentation() {
  nav = document.querySelector('.bottom-nav')
  if (!nav) return false
  navButtons = Array.from(nav.querySelectorAll('.nav-button'))
  if (navButtons.length !== 5) return false

  const definitions = [
    ['home', '홈'],
    ['class', '우리 반'],
    ['ai', 'AI'],
    ['study', '공부'],
    ['schedule', '일정'],
  ]

  let indicator = nav.querySelector('.preview-v2-indicator')
  if (!indicator) {
    indicator = el('span', 'preview-v2-indicator')
    indicator.setAttribute('aria-hidden', 'true')
    nav.appendChild(indicator)
  }

  navButtons.forEach((button, index) => {
    const [kind, label] = definitions[index]
    button.dataset.previewTab = kind
    button.dataset.previewLabel = label
    button.setAttribute('aria-label', label)
    let icon = button.querySelector('.preview-v2-nav-icon')
    if (!icon) {
      icon = el('span', 'preview-v2-nav-icon')
      button.insertBefore(icon, button.firstChild)
    }
    if (kind === 'ai') {
      if (!icon.querySelector('canvas')) {
        icon.replaceChildren()
        const canvas = document.createElement('canvas')
        canvas.className = 'preview-v2-ai-canvas'
        icon.appendChild(canvas)
        startPreviewOrb(canvas)
      }
    } else if (icon.dataset.kind !== kind) {
      icon.dataset.kind = kind
      icon.innerHTML = navIconMarkup(kind)
    }
  })
  syncUnreadProjection()
  return true
}

function showLayer() {
  removeLayer()
  const shell = document.querySelector('.app-shell')
  const appContent = shell?.querySelector(':scope > .app-content')
  if (!shell || !appContent) return null
  appContent.classList.add('preview-v2-underlay-hidden')
  routeLayer = el('main', 'preview-v2-layer')
  shell.insertBefore(routeLayer, nav)
  return routeLayer
}

function buildSegment(items, selected, onSelect) {
  const segment = el('div', 'preview-v2-segment')
  items.forEach(([id, label]) => {
    const button = el('button', id === selected ? 'is-selected' : '', label)
    button.type = 'button'
    button.addEventListener('click', () => onSelect(id))
    segment.appendChild(button)
  })
  return segment
}

function injectContextSegment(kind, selected) {
  const generation = routeGeneration
  waitFrames(() => {
    if (generation !== routeGeneration) return
    removeLayer()
    const content = document.querySelector('.app-shell > .app-content')
    const section = content?.firstElementChild
    if (!content || !section) return
    content.classList.remove('preview-v2-underlay-hidden')
    section.querySelector(':scope > .preview-v2-context')?.remove()
    const context = el('div', 'preview-v2-context')
    if (kind === 'class') {
      context.appendChild(buildSegment([
        ['board', '게시판'],
        ['timetable', '시간표'],
      ], selected, (value) => openClass(value)))
    } else if (kind === 'schedule') {
      context.appendChild(buildSegment([
        ['todo', '리마인더'],
        ['academic', '학사일정'],
      ], selected, (value) => openSchedule(value)))
    } else if (kind === 'meal') {
      const back = el('button', 'preview-v2-back', '‹ 홈')
      back.type = 'button'
      back.addEventListener('click', openHome)
      context.appendChild(back)
    }
    section.prepend(context)
    syncNavPresentation()
    syncPreviewActive()
  }, 2)
}

function syncPreviewActive() {
  const index = routeState.tab === 'home' ? 0
    : routeState.tab === 'class' ? 1
      : routeState.tab === 'ai' ? 2
        : routeState.tab === 'study' ? 3
          : routeState.tab === 'schedule' ? 4
            : 0
  setPreviewActive(index)
}

function pageHeader(eyebrow, title) {
  const header = el('header', 'preview-v2-page-header')
  header.appendChild(el('p', 'date-label', eyebrow))
  header.appendChild(el('h1', '', title))
  return header
}

function setLayerStatus(message, error = false) {
  if (!routeLayer) return
  let status = routeLayer.querySelector('.preview-v2-status')
  if (!status) {
    status = el('p', 'preview-v2-status')
    routeLayer.appendChild(status)
  }
  status.classList.toggle('is-error', error)
  status.textContent = message
}

async function refreshBoard({ quiet = false } = {}) {
  const generation = routeGeneration
  try {
    const payload = await api('board')
    if (generation !== routeGeneration || routeState.tab !== 'class' || routeState.classView !== 'board') return
    boardPosts = Array.isArray(payload.posts) ? payload.posts : []
    boardLoaded = true
    renderBoard()
  } catch (error) {
    if (generation !== routeGeneration || routeState.tab !== 'class') return
    if (!quiet || !boardLoaded) setLayerStatus(error.message, true)
  }
}

function renderBoardPosts(container) {
  container.replaceChildren()
  if (!boardPosts.length) {
    const empty = el('div', 'preview-v2-empty')
    empty.appendChild(el('strong', '', '아직 글이 없어'))
    empty.appendChild(el('p', '', '첫 질문이나 반 소식을 올려봐.'))
    container.appendChild(empty)
    return
  }

  const me = readStudentProfile()
  boardPosts.forEach((post) => {
    const article = el('article', `preview-v2-post ${post.kind === 'question' ? 'is-question' : ''}`)
    const meta = el('div', 'preview-v2-post-meta')
    const type = el('span', 'preview-v2-post-kind', post.kind === 'question' ? (post.resolved ? '해결됨' : '질문') : '일반')
    meta.append(type, el('span', '', `${post.authorName || '학생'} · ${relativeTime(post.createdAt)}`))
    article.appendChild(meta)
    article.appendChild(el('h2', '', post.title || '제목 없음'))
    article.appendChild(el('p', 'preview-v2-post-body', post.body || ''))

    const comments = el('div', 'preview-v2-comments')
    for (const comment of post.comments || []) {
      const row = el('div', 'preview-v2-comment')
      row.appendChild(el('strong', '', comment.authorName || '학생'))
      row.appendChild(el('span', '', comment.body || ''))
      comments.appendChild(row)
    }
    article.appendChild(comments)

    const commentForm = el('form', 'preview-v2-comment-form')
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 500
    input.placeholder = post.kind === 'question' ? '답변 쓰기' : '댓글 쓰기'
    const submit = el('button', '', '등록')
    submit.type = 'submit'
    commentForm.append(input, submit)
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const body = input.value.trim()
      if (!body) return
      submit.disabled = true
      try {
        await api('board', { method: 'POST', body: { action: 'comment', postId: post.id, body } })
        input.value = ''
        await refreshBoard({ quiet: true })
      } catch (error) {
        window.alert(error.message)
      } finally {
        submit.disabled = false
      }
    })
    article.appendChild(commentForm)

    if (post.kind === 'question' && !post.resolved && me?.name === post.authorName) {
      const resolve = el('button', 'preview-v2-resolve', '해결됨으로 표시')
      resolve.type = 'button'
      resolve.addEventListener('click', async () => {
        resolve.disabled = true
        try {
          await api('board', { method: 'POST', body: { action: 'resolve', postId: post.id } })
          await refreshBoard({ quiet: true })
        } catch (error) {
          window.alert(error.message)
          resolve.disabled = false
        }
      })
      article.appendChild(resolve)
    }
    container.appendChild(article)
  })
}

function renderBoard() {
  if (routeState.tab !== 'class' || routeState.classView !== 'board') return
  const layer = showLayer()
  if (!layer) return
  const profile = readStudentProfile()
  layer.appendChild(pageHeader(`${profile?.classNumber || ''}반`, '우리 반'))
  layer.appendChild(buildSegment([
    ['board', '게시판'],
    ['timetable', '시간표'],
  ], 'board', (value) => openClass(value)))

  const actions = el('div', 'preview-v2-board-actions')
  const heading = el('div', '')
  heading.appendChild(el('strong', '', '반 게시판'))
  heading.appendChild(el('span', '', boardPosts.length ? `${boardPosts.length}개 글` : '질문과 소식을 한곳에'))
  const composeToggle = el('button', '', boardComposeOpen ? '닫기' : '글쓰기')
  composeToggle.type = 'button'
  composeToggle.addEventListener('click', () => {
    boardComposeOpen = !boardComposeOpen
    renderBoard()
  })
  actions.append(heading, composeToggle)
  layer.appendChild(actions)

  if (boardComposeOpen) {
    const form = el('form', 'preview-v2-compose')
    form.appendChild(buildSegment([
      ['general', '일반'],
      ['question', '질문'],
    ], boardComposeKind, (value) => {
      boardComposeKind = value
      renderBoard()
    }))
    const title = document.createElement('input')
    title.type = 'text'
    title.maxLength = 70
    title.placeholder = boardComposeKind === 'question' ? '무엇이 궁금해?' : '제목'
    const body = document.createElement('textarea')
    body.maxLength = 1200
    body.rows = 4
    body.placeholder = boardComposeKind === 'question' ? '문제나 궁금한 점을 적어줘.' : '반 친구들에게 공유할 내용을 적어줘.'
    const submit = el('button', 'preview-v2-primary', '올리기')
    submit.type = 'submit'
    form.append(title, body, submit)
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      submit.disabled = true
      try {
        await api('board', {
          method: 'POST',
          body: { action: 'create', kind: boardComposeKind, title: title.value, body: body.value },
        })
        boardComposeOpen = false
        await refreshBoard({ quiet: true })
      } catch (error) {
        window.alert(error.message)
        submit.disabled = false
      }
    })
    layer.appendChild(form)
  }

  const list = el('div', 'preview-v2-post-list')
  layer.appendChild(list)
  if (boardLoaded) renderBoardPosts(list)
  else setLayerStatus('게시판을 불러오는 중이에요.')
  syncPreviewActive()
}

function currentStudySession() {
  if (!studyData?.me) return null
  return (studyData.active || []).find((session) => session.studentKey === studyData.me) || null
}

async function refreshStudy({ quiet = false } = {}) {
  const generation = routeGeneration
  try {
    const payload = await api('study')
    if (generation !== routeGeneration || routeState.tab !== 'study') return
    studyData = payload
    studyLoaded = true
    renderStudy()
    syncStudyTimers()
  } catch (error) {
    if (generation !== routeGeneration || routeState.tab !== 'study') return
    if (!quiet || !studyLoaded) setLayerStatus(error.message, true)
  }
}

function syncStudyTimers() {
  if (secondTimer) window.clearInterval(secondTimer)
  if (heartbeatTimer) window.clearInterval(heartbeatTimer)
  secondTimer = 0
  heartbeatTimer = 0
  const session = currentStudySession()
  if (!session || routeState.tab !== 'study') return
  secondTimer = window.setInterval(() => {
    const value = document.querySelector('.preview-v2-live-time')
    if (value && routeState.tab === 'study') value.textContent = liveDuration(session.startedAt)
  }, 1000)
  heartbeatTimer = window.setInterval(() => {
    if (routeState.tab !== 'study') return
    api('study', { method: 'POST', body: { action: 'heartbeat' } }).catch(() => {})
  }, STUDY_HEARTBEAT_MS)
}

function renderStudy() {
  if (routeState.tab !== 'study') return
  const layer = showLayer()
  if (!layer) return
  const profile = readStudentProfile()
  layer.appendChild(pageHeader('집중 기록', '공부'))

  const session = currentStudySession()
  const hero = el('section', `preview-v2-study-hero ${session ? 'is-active' : ''}`)
  if (session) {
    hero.appendChild(el('span', 'preview-v2-study-state', `${session.subject} 공부 중`))
    hero.appendChild(el('strong', 'preview-v2-live-time', liveDuration(session.startedAt)))
    const stop = el('button', 'preview-v2-primary', '공부 끝내기')
    stop.type = 'button'
    stop.addEventListener('click', async () => {
      stop.disabled = true
      try {
        await api('study', { method: 'POST', body: { action: 'stop' } })
        await refreshStudy({ quiet: true })
      } catch (error) {
        window.alert(error.message)
        stop.disabled = false
      }
    })
    hero.appendChild(stop)
  } else {
    hero.appendChild(el('span', 'preview-v2-study-state', '지금부터 집중할 과목'))
    const subject = document.createElement('input')
    subject.className = 'preview-v2-subject-input'
    subject.maxLength = 24
    subject.placeholder = '예: 수학'
    const start = el('button', 'preview-v2-primary', '공부 시작')
    start.type = 'button'
    start.addEventListener('click', async () => {
      start.disabled = true
      try {
        await api('study', { method: 'POST', body: { action: 'start', subject: subject.value } })
        await refreshStudy({ quiet: true })
      } catch (error) {
        window.alert(error.message)
        start.disabled = false
      }
    })
    hero.append(subject, start)
  }
  layer.appendChild(hero)

  const activeSection = el('section', 'preview-v2-study-section')
  const activeHead = el('div', 'preview-v2-section-head')
  const active = studyData?.active || []
  activeHead.append(el('h2', '', '지금 공부 중'), el('span', '', `${active.length}명`))
  activeSection.appendChild(activeHead)
  const activeList = el('div', 'preview-v2-study-list')
  if (!active.length) {
    activeList.appendChild(el('p', 'preview-v2-inline-empty', '지금 공부 중인 친구가 없어요.'))
  } else {
    active.forEach((item) => {
      const row = el('div', 'preview-v2-study-row')
      const copy = el('div', '')
      copy.append(el('strong', '', item.name || '학생'), el('span', '', item.subject || '공부'))
      row.append(copy, el('span', 'preview-v2-study-elapsed', liveDuration(item.startedAt)))
      activeList.appendChild(row)
    })
  }
  activeSection.appendChild(activeList)
  layer.appendChild(activeSection)

  const ranking = el('section', 'preview-v2-study-section')
  const rankHead = el('div', 'preview-v2-section-head')
  rankHead.append(el('h2', '', '오늘 공부'), el('span', '', '누적 시간'))
  ranking.appendChild(rankHead)
  const rankList = el('div', 'preview-v2-study-list')
  const totals = studyData?.totals || []
  if (!totals.length) {
    rankList.appendChild(el('p', 'preview-v2-inline-empty', '오늘 기록된 공부 시간이 없어요.'))
  } else {
    totals.slice(0, 12).forEach((item, index) => {
      const row = el('div', 'preview-v2-study-row')
      const copy = el('div', '')
      copy.append(el('strong', '', `${index + 1}. ${item.name || '학생'}`), el('span', '', item.studentKey === studyData.me ? '나' : ''))
      row.append(copy, el('span', '', formatDuration(item.totalMs)))
      rankList.appendChild(row)
    })
  }
  ranking.appendChild(rankList)
  layer.appendChild(ranking)
  if (!studyLoaded) setLayerStatus('공부 현황을 불러오는 중이에요.')
  syncPreviewActive()
}

function openHome() {
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'home'
  removeLayer()
  nativeNav(0)
  waitFrames(() => {
    document.querySelector('.app-shell > .app-content')?.classList.remove('preview-v2-underlay-hidden')
    syncNavPresentation()
    syncPreviewActive()
  })
}

function openClass(view = 'board') {
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'class'
  routeState.classView = view === 'timetable' ? 'timetable' : 'board'
  if (routeState.classView === 'timetable') {
    removeLayer()
    nativeNav(2)
    injectContextSegment('class', 'timetable')
  } else {
    nativeNav(0)
    waitFrames(() => {
      renderBoard()
      refreshBoard()
      refreshTimer = window.setInterval(() => refreshBoard({ quiet: true }), ROUTE_REFRESH_MS)
    })
  }
  syncPreviewActive()
}

function openStudy() {
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'study'
  nativeNav(0)
  waitFrames(() => {
    renderStudy()
    refreshStudy()
    refreshTimer = window.setInterval(() => refreshStudy({ quiet: true }), ROUTE_REFRESH_MS)
  })
  syncPreviewActive()
}

function openSchedule(view = 'todo') {
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'schedule'
  routeState.scheduleView = view === 'academic' ? 'academic' : 'todo'
  removeLayer()
  nativeNav(routeState.scheduleView === 'academic' ? 4 : 1)
  injectContextSegment('schedule', routeState.scheduleView)
  syncPreviewActive()
}

function openMeal() {
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'home'
  removeLayer()
  nativeNav(3)
  injectContextSegment('meal', 'meal')
  setPreviewActive(0)
}

function restoreRoute(state) {
  if (!state) return openHome()
  if (state.tab === 'class') return openClass(state.classView)
  if (state.tab === 'study') return openStudy()
  if (state.tab === 'schedule') return openSchedule(state.scheduleView)
  return openHome()
}

function openAI() {
  const previous = { ...routeState }
  aiReturnRoute = previous.tab === 'ai' ? { tab: 'home' } : previous
  routeGeneration += 1
  clearRouteTimers()
  routeState.tab = 'ai'
  removeLayer()
  nativeNav(0)
  syncPreviewActive()
  waitFrames(() => {
    const trigger = document.querySelector('.home-ai-trigger')
    if (!trigger) {
      restoreRoute(aiReturnRoute)
      return
    }
    aiWasOpen = false
    trigger.click()
  }, 2)
}

function routeNavIndex(index) {
  if (index === 0) return openHome()
  if (index === 1) return openClass('board')
  if (index === 2) return openAI()
  if (index === 3) return openStudy()
  if (index === 4) return openSchedule('todo')
}

function handleNavPointer(event) {
  if (allowNativeNav) return
  const button = event.target.closest?.('.nav-button')
  if (!button || !nav?.contains(button)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function handleNavClick(event) {
  if (allowNativeNav) return
  const button = event.target.closest?.('.nav-button')
  if (!button || !nav?.contains(button)) return
  const index = navButtons.indexOf(button)
  if (index < 0) return
  event.preventDefault()
  event.stopImmediatePropagation()
  routeNavIndex(index)
}

function homeCardRoute(index) {
  if (index === 0 || index === 2) return openClass('timetable')
  if (index === 1) return openSchedule('todo')
  if (index === 3) return openSchedule('academic')
  if (index === 4) return openMeal()
}

function handleHomeCardClick(event) {
  if (routeState.tab !== 'home') return
  const card = event.target.closest?.('.home-stack > *')
  if (!card || event.target.closest?.('button, a, input, textarea, select')) return
  const stack = card.parentElement
  const index = Array.from(stack?.children || []).indexOf(card)
  if (index < 0 || index > 4) return
  event.preventDefault()
  event.stopImmediatePropagation()
  homeCardRoute(index)
}

function handleHomeCardKey(event) {
  if (routeState.tab !== 'home' || !['Enter', ' '].includes(event.key)) return
  const card = event.target.closest?.('.home-stack > *')
  if (!card) return
  const index = Array.from(card.parentElement?.children || []).indexOf(card)
  if (index < 0 || index > 4) return
  event.preventDefault()
  event.stopImmediatePropagation()
  homeCardRoute(index)
}

function routeLegacyTab(tab) {
  if (tab === 'todo') return openSchedule('todo')
  if (tab === 'timetable') return openClass('timetable')
  if (tab === 'academic') return openSchedule('academic')
  if (tab === 'meal') return openMeal()
  return openHome()
}

function watchAI() {
  aiObserver?.disconnect()
  aiObserver = new MutationObserver(() => {
    if (routeState.tab !== 'ai') return
    const sheet = document.querySelector('.s-hub-ai-sheet')
    if (sheet) {
      aiWasOpen = true
      return
    }
    if (aiWasOpen) {
      aiWasOpen = false
      const target = aiReturnRoute
      aiReturnRoute = null
      restoreRoute(target)
    }
  })
  aiObserver.observe(document.body, { childList: true, subtree: true })
}

function installRouter() {
  if (!syncNavPresentation()) return false
  document.documentElement.classList.add('shub-preview-v2')
  nav.addEventListener('pointerdown', handleNavPointer, true)
  nav.addEventListener('click', handleNavClick, true)
  document.addEventListener('click', handleHomeCardClick, true)
  document.addEventListener('keydown', handleHomeCardKey, true)
  navObserver = new MutationObserver(() => {
    syncNavPresentation()
    syncPreviewActive()
  })
  navObserver.observe(nav, { childList: true, subtree: true })
  watchAI()
  window.__shubPreviewV2 = {
    openHome,
    openClass,
    openAI,
    openStudy,
    openSchedule,
    openMeal,
    routeLegacyTab,
  }
  openHome()
  window.addEventListener('pagehide', () => {
    clearRouteTimers()
    navObserver?.disconnect()
    aiObserver?.disconnect()
  }, { once: true })
  return true
}

function waitForApp() {
  if (installRouter()) return
  const observer = new MutationObserver(() => {
    if (!installRouter()) return
    observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
}

if (inPreviewMode()) waitForApp()
