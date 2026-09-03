import { ensureSignedIn, readStudentProfile } from './school-sync'
import './class-roster.css'

const CLASS_ROSTER_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster-v2'
const CLASS_ROSTER_REPAIR_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster-repair'
const ROSTER_FRESH_MS = 2 * 60_000
const ROSTER_STALE_CACHE_MS = 24 * 60 * 60_000
const ROSTER_CACHE_PREFIX = 'school.classRoster.v2.'
const MODAL_CLOSE_MS = 320

let cachedRoster = null
let hydratedClassNumber = 0
let refreshPromise = null
let repairPromise = null
let repairAttempted = false
let lastFetchedAt = 0
let liveOnline = null
let liveTotal = null
let lastRenderedLabel = ''
let modalState = null
let modalWarmupScheduled = false
let closeTimerId = 0
let syncQueued = false

function profileClassNumber() {
  const profile = readStudentProfile()
  const classNumber = Number(profile?.classNumber)
  return Number.isInteger(classNumber) ? classNumber : 0
}

function cacheKey(classNumber = profileClassNumber()) {
  return classNumber ? `${ROSTER_CACHE_PREFIX}${classNumber}` : ''
}

function parseCounter(value) {
  const match = /^(\d+)\/(\d+)$/.exec(String(value || '').trim())
  if (!match) return null
  return { online: Number(match[1]), total: Number(match[2]) }
}

function normalizeRoster(payload) {
  if (!payload?.ok || !Array.isArray(payload.members)) throw new Error('반 명단 응답이 올바르지 않아요.')
  const members = payload.members
    .map((member) => ({
      studentNumber: Number(member?.studentNumber),
      studentKey: String(member?.studentKey || '').trim().slice(0, 120),
      name: String(member?.name || '').trim().slice(0, 20),
      online: Boolean(member?.online),
      conflict: Boolean(member?.conflict),
      aliases: Array.isArray(member?.aliases)
        ? member.aliases.map((name) => String(name || '').trim().slice(0, 20)).filter(Boolean).slice(0, 6)
        : [],
    }))
    .filter((member) => Number.isInteger(member.studentNumber) && member.studentNumber >= 1 && member.studentNumber <= 60 && member.name)
    .sort((a, b) => a.studentNumber - b.studentNumber)

  return {
    classNumber: Number(payload.classNumber || 0),
    total: Number(payload.total || members.length),
    registeredTotal: Number(payload.legacyMemberCount || payload.registeredTotal || payload.total || members.length),
    online: Number(payload.online || 0),
    unresolved: Number(payload.unresolved || 0),
    members,
  }
}

function rosterSignature(roster) {
  if (!roster) return ''
  return [
    roster.classNumber,
    roster.total,
    roster.registeredTotal,
    roster.online,
    roster.unresolved,
    ...roster.members.map((member) => [
      member.studentNumber,
      member.studentKey,
      member.name,
      member.online ? 1 : 0,
      member.conflict ? 1 : 0,
      member.aliases.join('|'),
    ].join(':')),
  ].join('~')
}

function resetRosterState(classNumber = 0) {
  hydratedClassNumber = classNumber
  cachedRoster = null
  lastFetchedAt = 0
  repairAttempted = false
  liveOnline = null
  liveTotal = null
  lastRenderedLabel = ''
}

function hydrateRosterCache() {
  const classNumber = profileClassNumber()
  if (!classNumber) {
    if (hydratedClassNumber) resetRosterState(0)
    return null
  }
  if (hydratedClassNumber === classNumber) return cachedRoster

  resetRosterState(classNumber)
  const key = cacheKey(classNumber)
  if (!key) return null
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    const checkedAt = Number(stored?.checkedAt || 0)
    if (!checkedAt || Date.now() - checkedAt > ROSTER_STALE_CACHE_MS) {
      localStorage.removeItem(key)
      return null
    }
    const roster = normalizeRoster({ ok: true, ...(stored?.roster || {}) })
    if (roster.classNumber && roster.classNumber !== classNumber) {
      localStorage.removeItem(key)
      return null
    }
    cachedRoster = roster
    lastFetchedAt = checkedAt
    return cachedRoster
  } catch {
    try { localStorage.removeItem(key) } catch { /* best effort */ }
    return null
  }
}

function persistRosterCache() {
  const classNumber = cachedRoster?.classNumber || profileClassNumber()
  const key = cacheKey(classNumber)
  if (!key || !cachedRoster || !lastFetchedAt) return
  try {
    localStorage.setItem(key, JSON.stringify({ checkedAt: lastFetchedAt, roster: cachedRoster }))
  } catch {
    // The in-memory roster remains usable if browser storage is unavailable.
  }
}

async function authToken() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('로그인 정보를 확인하지 못했어요.')
  return idToken
}

async function fetchRoster({ force = false } = {}) {
  hydrateRosterCache()
  if (!force && cachedRoster && Date.now() - lastFetchedAt < ROSTER_FRESH_MS) return cachedRoster
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const idToken = await authToken()
    const response = await fetch(CLASS_ROSTER_API_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    })
    let payload = null
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok) throw new Error(String(payload?.message || '반 명단을 불러오지 못했어요.'))

    cachedRoster = normalizeRoster(payload)
    lastFetchedAt = Date.now()
    persistRosterCache()
    return cachedRoster
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

async function repairRosterIfNeeded() {
  if (repairAttempted || repairPromise || !cachedRoster?.unresolved) return null
  repairAttempted = true

  repairPromise = (async () => {
    const idToken = await authToken()
    const response = await fetch(CLASS_ROSTER_REPAIR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    let payload = null
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok) throw new Error(String(payload?.message || '반 명단 정리를 완료하지 못했어요.'))

    if (Number(payload?.archived || 0) > 0) {
      const before = rosterSignature(cachedRoster)
      await fetchRoster({ force: true })
      syncCounter()
      if (modalState?.layer?.classList.contains('is-visible') && rosterSignature(cachedRoster) !== before) {
        renderRoster({ animateRows: false, force: true })
      }
    }
    return payload
  })().catch((error) => {
    console.error('Class roster repair failed:', error)
    return null
  }).finally(() => {
    repairPromise = null
  })

  return repairPromise
}

function currentRosterOnline(roster = cachedRoster) {
  if (!roster) return 0
  const total = Math.max(0, Number.isInteger(liveTotal) ? liveTotal : roster.registeredTotal || roster.total)
  return Math.max(0, Math.min(Number.isInteger(liveOnline) ? liveOnline : roster.online, total))
}

function updateModalSummary() {
  if (!modalState?.summary || !cachedRoster || !modalState.layer?.classList.contains('is-visible')) return
  const nextSummary = `${cachedRoster.registeredTotal || cachedRoster.total}명 · 현재 ${currentRosterOnline()}명 접속`
  if (modalState.summary.textContent !== nextSummary) modalState.summary.textContent = nextSummary
}

function applyLivePresenceSnapshot(detail) {
  const classNumber = profileClassNumber()
  if (!classNumber || String(detail?.classId || '') !== `class-${classNumber}`) return

  const online = Number(detail?.online)
  if (Number.isInteger(online) && online >= 0) liveOnline = online
  const activeKeys = new Set(
    (Array.isArray(detail?.activeStudentKeys) ? detail.activeStudentKeys : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )

  if (cachedRoster && activeKeys.size >= 0) {
    let changed = false
    const members = cachedRoster.members.map((member) => {
      if (!member.studentKey || member.conflict) return member
      const nextOnline = activeKeys.has(member.studentKey)
      if (nextOnline === member.online) return member
      changed = true
      return { ...member, online: nextOnline }
    })
    if (changed || (Number.isInteger(liveOnline) && cachedRoster.online !== liveOnline)) {
      cachedRoster = {
        ...cachedRoster,
        online: Number.isInteger(liveOnline) ? liveOnline : cachedRoster.online,
        members,
      }
      if (modalState?.layer?.classList.contains('is-visible')) {
        renderRoster({ animateRows: false, force: true })
      }
    }
  }

  updateModalSummary()
  queueCounterSync()
}

function applyRosterCounter(counter) {
  if (!counter) return

  if (counter.textContent.trim() !== lastRenderedLabel) {
    const reactCount = parseCounter(counter.textContent)
    if (reactCount) {
      liveOnline = reactCount.online
      liveTotal = reactCount.total
    }
  }

  // The React control owns button semantics. This module only keeps its live label in sync.
  counter.setAttribute('aria-hidden', 'false')

  if (!cachedRoster) {
    const current = parseCounter(counter.textContent)
    const classNumber = profileClassNumber()
    counter.setAttribute('aria-label', classNumber
      ? `${classNumber}반 명단 보기${current ? `, 현재 접속 ${current.online}명, 등록 ${current.total}명` : ''}`
      : '반 명단 보기')
    return
  }

  const fallbackTotal = Math.max(0, cachedRoster.registeredTotal || cachedRoster.total)
  const total = Math.max(0, Number.isInteger(liveTotal) ? liveTotal : fallbackTotal)
  const online = Math.max(0, Math.min(Number.isInteger(liveOnline) ? liveOnline : cachedRoster.online, total))
  const nextLabel = `${online}/${total}`
  if (counter.textContent.trim() !== nextLabel) counter.textContent = nextLabel
  lastRenderedLabel = nextLabel
  const classNumber = cachedRoster.classNumber || profileClassNumber()
  counter.setAttribute('aria-label', `${classNumber}반 명단 보기, 현재 접속 ${online}명, 등록 ${total}명`)
  updateModalSummary()
}

function clearCloseTimer() {
  if (!closeTimerId) return
  window.clearTimeout(closeTimerId)
  closeTimerId = 0
}

function closeModal() {
  if (!modalState?.layer?.classList.contains('is-visible')) return
  clearCloseTimer()
  modalState.layer.classList.remove('is-open')
  document.documentElement.classList.remove('class-roster-modal-open')
  closeTimerId = window.setTimeout(() => {
    modalState?.layer?.classList.remove('is-visible')
    closeTimerId = 0
  }, MODAL_CLOSE_MS)
}

function memberRow(member, index, animate = true) {
  const row = document.createElement('div')
  row.className = `class-roster-row${animate ? '' : ' is-static'}`
  if (animate) row.style.setProperty('--roster-delay', `${Math.min(index * 28, 280)}ms`)

  const number = document.createElement('span')
  number.className = 'class-roster-number'
  number.textContent = String(member.studentNumber)

  const copy = document.createElement('div')
  copy.className = 'class-roster-member-copy'
  const name = document.createElement('strong')
  name.className = 'class-roster-name'
  name.textContent = member.name
  copy.appendChild(name)

  if (member.conflict && member.aliases.length > 1) {
    const conflictCopy = document.createElement('span')
    conflictCopy.className = 'class-roster-conflict-copy'
    conflictCopy.textContent = `다른 등록: ${member.aliases.filter((alias) => alias !== member.name).join(', ')}`
    copy.appendChild(conflictCopy)
  }

  const status = document.createElement('span')
  if (member.conflict) {
    status.className = 'class-roster-status is-conflict'
    status.textContent = '등록 확인 필요'
  } else if (member.online) {
    status.className = 'class-roster-status is-online'
    status.textContent = '접속 중'
  } else {
    status.className = 'class-roster-status'
    status.textContent = ''
    status.setAttribute('aria-label', '오프라인')
  }

  row.append(number, copy, status)
  return row
}

function renderRoster({ loading = false, error = '', animateRows = true, force = false } = {}) {
  if (!modalState) return
  const { summary, list } = modalState

  if (loading && !cachedRoster) {
    if (!force && modalState.renderMode === 'loading') return
    modalState.renderMode = 'loading'
    modalState.renderedSignature = ''
    summary.textContent = '명단을 확인하고 있어요.'
    const message = document.createElement('div')
    message.className = 'class-roster-message'
    const strong = document.createElement('strong')
    strong.textContent = '반 명단을 불러오는 중이에요.'
    const span = document.createElement('span')
    span.textContent = '기존 등록 정보를 안전하게 확인하고 있어요.'
    message.append(strong, span)
    list.replaceChildren(message)
    return
  }

  if (error && !cachedRoster) {
    modalState.renderMode = 'error'
    modalState.renderedSignature = ''
    summary.textContent = '명단을 불러오지 못했어요.'
    const message = document.createElement('div')
    message.className = 'class-roster-message'
    const strong = document.createElement('strong')
    strong.textContent = '반 명단을 불러오지 못했어요.'
    const span = document.createElement('span')
    span.textContent = error
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'class-roster-retry'
    retry.textContent = '다시 확인하기'
    retry.addEventListener('click', () => refreshModal({ force: true, showLoading: true }))
    message.append(strong, span, retry)
    list.replaceChildren(message)
    return
  }

  const roster = cachedRoster
  if (!roster) return
  const signature = rosterSignature(roster)
  summary.textContent = `${roster.registeredTotal || roster.total}명 · 현재 ${currentRosterOnline(roster)}명 접속`
  modalState.title.textContent = `${roster.classNumber || profileClassNumber()}반 명단`

  if (!force && !error && modalState.renderMode === 'roster' && modalState.renderedSignature === signature) return

  const fragment = document.createDocumentFragment()
  if (!roster.members.length) {
    const message = document.createElement('div')
    message.className = 'class-roster-message'
    const strong = document.createElement('strong')
    strong.textContent = '등록된 학생을 찾지 못했어요.'
    const span = document.createElement('span')
    span.textContent = '학생 등록 정보가 생기면 번호순으로 여기에 표시돼요.'
    message.append(strong, span)
    fragment.appendChild(message)
  } else {
    roster.members.forEach((member, index) => fragment.appendChild(memberRow(member, index, animateRows)))
  }

  if (roster.unresolved > 0) {
    const note = document.createElement('p')
    note.className = 'class-roster-note'
    note.textContent = `번호를 확인하지 못한 기존 등록 ${roster.unresolved}개가 있어요. 잘못된 인원으로 합치지 않고 따로 보류했어요.`
    fragment.appendChild(note)
  }

  if (error) {
    const note = document.createElement('p')
    note.className = 'class-roster-note'
    note.textContent = `최신 명단 확인에 실패해서 마지막으로 확인한 명단을 보여드리고 있어요. ${error}`
    fragment.appendChild(note)
  }

  list.replaceChildren(fragment)
  modalState.renderMode = 'roster'
  modalState.renderedSignature = error ? '' : signature
}

async function refreshModal({ force = false, showLoading = false } = {}) {
  hydrateRosterCache()
  const hadRoster = Boolean(cachedRoster)
  const before = rosterSignature(cachedRoster)
  if (showLoading && !hadRoster) renderRoster({ loading: true })

  try {
    await fetchRoster({ force })
    syncCounter()
    const changed = rosterSignature(cachedRoster) !== before
    if (modalState?.layer?.classList.contains('is-visible') && (!hadRoster || changed)) {
      renderRoster({ animateRows: !hadRoster, force: true })
    } else {
      updateModalSummary()
    }
    void repairRosterIfNeeded()
  } catch (error) {
    console.error('Class roster refresh failed:', error)
    if (modalState?.layer?.classList.contains('is-visible')) {
      renderRoster({ error: String(error?.message || '잠시 후 다시 확인해 주세요.'), animateRows: false, force: true })
    }
  }
}

function ensureModal() {
  if (modalState) return modalState

  const layer = document.createElement('div')
  layer.className = 'class-roster-layer'
  layer.innerHTML = `
    <button class="class-roster-backdrop" type="button" aria-label="명단 닫기"></button>
    <section class="class-roster-modal" role="dialog" aria-modal="true" aria-labelledby="class-roster-title">
      <header class="class-roster-head">
        <div class="class-roster-title-copy">
          <h2 id="class-roster-title">반 명단</h2>
          <p class="class-roster-summary">명단을 확인하고 있어요.</p>
        </div>
        <button class="class-roster-close" type="button" aria-label="닫기">×</button>
      </header>
      <div class="class-roster-scroll"><div class="class-roster-list"></div></div>
    </section>
  `

  const title = layer.querySelector('.class-roster-title-copy h2')
  const summary = layer.querySelector('.class-roster-summary')
  const list = layer.querySelector('.class-roster-list')
  const close = layer.querySelector('.class-roster-close')
  const backdrop = layer.querySelector('.class-roster-backdrop')
  close?.addEventListener('click', closeModal)
  backdrop?.addEventListener('click', closeModal)
  document.body.appendChild(layer)

  modalState = {
    layer,
    title,
    summary,
    list,
    close,
    renderMode: '',
    renderedSignature: '',
  }
  return modalState
}

function scheduleModalWarmup() {
  if (modalState || modalWarmupScheduled) return
  modalWarmupScheduled = true
  const warm = () => {
    modalWarmupScheduled = false
    if (readStudentProfile()) ensureModal()
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 900 })
  } else {
    window.setTimeout(warm, 0)
  }
}

export function openClassRoster({ keyboard = false } = {}) {
  hydrateRosterCache()
  const modal = ensureModal()
  clearCloseTimer()
  if (modal.layer.classList.contains('is-visible')) return

  modal.layer.classList.remove('is-open')
  modal.layer.classList.add('is-visible')
  document.documentElement.classList.add('class-roster-modal-open')

  if (cachedRoster) renderRoster({ animateRows: true, force: true })
  else renderRoster({ loading: true })

  window.requestAnimationFrame(() => {
    if (!modal.layer.classList.contains('is-visible')) return
    modal.layer.classList.add('is-open')
    if (keyboard) modal.close?.focus({ preventScroll: true })
  })

  void refreshModal({ force: false, showLoading: false })
}

function syncCounter() {
  syncQueued = false
  hydrateRosterCache()
  const counter = document.querySelector('.class-presence-count')
  if (!counter) return
  scheduleModalWarmup()
  applyRosterCounter(counter)
}

function queueCounterSync() {
  if (syncQueued) return
  syncQueued = true
  queueMicrotask(syncCounter)
}

function isRosterInternalMutation(mutation) {
  const target = mutation?.target
  const element = target?.nodeType === 3 ? target.parentElement : target
  return Boolean(element?.closest?.('.class-roster-layer'))
}

const observer = new MutationObserver((mutations) => {
  if (mutations.length && mutations.every(isRosterInternalMutation)) return
  queueCounterSync()
})
const appRoot = document.getElementById('root') || document.documentElement
observer.observe(appRoot, { childList: true, subtree: true, characterData: true })

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalState?.layer?.classList.contains('is-open')) closeModal()
})

window.addEventListener('focus', () => {
  syncCounter()
  if (modalState?.layer?.classList.contains('is-visible')) void refreshModal({ force: false, showLoading: false })
})

window.addEventListener('school:class-presence', (event) => {
  applyLivePresenceSnapshot(event?.detail)
})

window.addEventListener('school:student-profile-saved', () => {
  resetRosterState(0)
  syncCounter()
})

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncCounter, { once: true })
else syncCounter()
