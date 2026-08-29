import { ensureSignedIn, readStudentProfile } from './school-sync'
import './class-roster.css'

const CLASS_ROSTER_API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const ROSTER_REFRESH_MS = 60_000
const MODAL_CLOSE_MS = 320

let cachedRoster = null
let refreshPromise = null
let lastFetchedAt = 0
let liveOnline = null
let lastRenderedLabel = ''
let modalState = null
let syncQueued = false
const enhancedCounters = new WeakSet()

function profileClassNumber() {
  const profile = readStudentProfile()
  const classNumber = Number(profile?.classNumber)
  return Number.isInteger(classNumber) ? classNumber : 0
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
    online: Number(payload.online || 0),
    unresolved: Number(payload.unresolved || 0),
    members,
  }
}

async function fetchRoster({ force = false } = {}) {
  if (!force && cachedRoster && Date.now() - lastFetchedAt < ROSTER_REFRESH_MS) return cachedRoster
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const user = await ensureSignedIn()
    const idToken = String(await user.getIdToken()).trim()
    if (!idToken) throw new Error('로그인 정보를 확인하지 못했어요.')

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
    return cachedRoster
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

function applyRosterCounter(counter) {
  if (!counter) return

  if (counter.textContent.trim() !== lastRenderedLabel) {
    const reactCount = parseCounter(counter.textContent)
    if (reactCount) liveOnline = reactCount.online
  }

  counter.classList.add('is-roster-button')
  counter.setAttribute('role', 'button')
  counter.setAttribute('tabindex', '0')
  counter.setAttribute('aria-hidden', 'false')

  if (!cachedRoster) {
    const current = parseCounter(counter.textContent)
    const classNumber = profileClassNumber()
    counter.setAttribute('aria-label', classNumber
      ? `${classNumber}반 명단 보기${current ? `, 현재 접속 ${current.online}명, 등록 ${current.total}명` : ''}`
      : '반 명단 보기')
    return
  }

  const total = Math.max(0, cachedRoster.total)
  const online = Math.max(0, Math.min(Number.isInteger(liveOnline) ? liveOnline : cachedRoster.online, total))
  const nextLabel = `${online}/${total}`
  if (counter.textContent.trim() !== nextLabel) counter.textContent = nextLabel
  lastRenderedLabel = nextLabel
  const classNumber = cachedRoster.classNumber || profileClassNumber()
  counter.setAttribute('aria-label', `${classNumber}반 명단 보기, 현재 접속 ${online}명, 등록 ${total}명`)
}

function closeModal() {
  if (!modalState?.layer?.classList.contains('is-visible')) return
  modalState.layer.classList.remove('is-open')
  document.documentElement.classList.remove('class-roster-modal-open')
  window.setTimeout(() => {
    modalState?.layer?.classList.remove('is-visible')
  }, MODAL_CLOSE_MS)
}

function memberRow(member, index) {
  const row = document.createElement('div')
  row.className = 'class-roster-row'
  row.style.setProperty('--roster-delay', `${Math.min(index * 28, 280)}ms`)

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

function renderRoster({ loading = false, error = '' } = {}) {
  if (!modalState) return
  const { summary, list } = modalState
  list.replaceChildren()

  if (loading && !cachedRoster) {
    summary.textContent = '명단을 확인하고 있어요.'
    const message = document.createElement('div')
    message.className = 'class-roster-message'
    const strong = document.createElement('strong')
    strong.textContent = '반 명단을 불러오는 중이에요.'
    const span = document.createElement('span')
    span.textContent = '기존 등록 정보를 안전하게 확인하고 있어요.'
    message.append(strong, span)
    list.appendChild(message)
    return
  }

  if (error && !cachedRoster) {
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
    retry.addEventListener('click', () => refreshModal(true))
    message.append(strong, span, retry)
    list.appendChild(message)
    return
  }

  const roster = cachedRoster
  if (!roster) return
  const classNumber = roster.classNumber || profileClassNumber()
  summary.textContent = `${roster.total}명 · 현재 ${roster.online}명 접속`
  modalState.title.textContent = `${classNumber}반 명단`

  if (!roster.members.length) {
    const message = document.createElement('div')
    message.className = 'class-roster-message'
    const strong = document.createElement('strong')
    strong.textContent = '등록된 학생을 찾지 못했어요.'
    const span = document.createElement('span')
    span.textContent = '학생 등록 정보가 생기면 번호순으로 여기에 표시돼요.'
    message.append(strong, span)
    list.appendChild(message)
  } else {
    roster.members.forEach((member, index) => list.appendChild(memberRow(member, index)))
  }

  if (roster.unresolved > 0) {
    const note = document.createElement('p')
    note.className = 'class-roster-note'
    note.textContent = `번호를 확인하지 못한 기존 등록 ${roster.unresolved}개가 있어요. 잘못된 인원으로 합치지 않고 따로 보류했어요.`
    list.appendChild(note)
  }

  if (error) {
    const note = document.createElement('p')
    note.className = 'class-roster-note'
    note.textContent = `최신 명단 확인에 실패해서 마지막으로 확인한 명단을 보여드리고 있어요. ${error}`
    list.appendChild(note)
  }
}

async function refreshModal(force = false) {
  renderRoster({ loading: true })
  try {
    await fetchRoster({ force })
    syncCounter()
    renderRoster()
  } catch (error) {
    console.error('Class roster refresh failed:', error)
    renderRoster({ error: String(error?.message || '잠시 후 다시 확인해 주세요.') })
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

  modalState = { layer, title, summary, list, close }
  return modalState
}

function openModal() {
  const modal = ensureModal()
  modal.layer.classList.add('is-visible')
  document.documentElement.classList.add('class-roster-modal-open')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modal.layer.classList.add('is-open')
    modal.close?.focus({ preventScroll: true })
  }))
  renderRoster({ loading: !cachedRoster })
  void refreshModal(true)
}

function enhanceCounter(counter) {
  if (!counter || enhancedCounters.has(counter)) return
  enhancedCounters.add(counter)
  counter.addEventListener('click', openModal)
  counter.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openModal()
  })
}

function syncCounter() {
  syncQueued = false
  const counter = document.querySelector('.class-presence-count')
  if (!counter) return
  enhanceCounter(counter)
  applyRosterCounter(counter)
  if (!cachedRoster && !refreshPromise && readStudentProfile()) {
    void fetchRoster()
      .then(() => syncCounter())
      .catch((error) => console.error('Initial class roster load failed:', error))
  }
}

function queueCounterSync() {
  if (syncQueued) return
  syncQueued = true
  queueMicrotask(syncCounter)
}

const observer = new MutationObserver(queueCounterSync)
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalState?.layer?.classList.contains('is-open')) closeModal()
})

window.addEventListener('focus', () => {
  syncCounter()
  if (readStudentProfile() && Date.now() - lastFetchedAt >= ROSTER_REFRESH_MS) {
    void fetchRoster({ force: true })
      .then(() => syncCounter())
      .catch((error) => console.error('Class roster focus refresh failed:', error))
  }
})

window.setInterval(() => {
  if (document.hidden || !readStudentProfile() || !document.querySelector('.class-presence-count')) return
  void fetchRoster({ force: true })
    .then(() => syncCounter())
    .catch((error) => console.error('Class roster periodic refresh failed:', error))
}, ROSTER_REFRESH_MS)

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncCounter, { once: true })
else syncCounter()
