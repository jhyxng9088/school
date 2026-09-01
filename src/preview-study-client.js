import { ensureSignedIn } from './school-sync.js'
import './preview-study-ranking.css'

const STUDY_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-study'

function studyError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function authHeaders() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw studyError('study/auth-required', '로그인 정보를 확인할 수 없습니다.')
  return {
    authorization: `Bearer ${idToken}`,
    'content-type': 'application/json',
  }
}

async function parseStudyResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw studyError(
      String(body?.error || `study/http-${response.status || 0}`),
      String(body?.message || '스터디 요청을 처리하지 못했습니다.'),
    )
  }
  return body
}

async function requestStudy({ method = 'GET', payload = null, signal, scope = 'class' } = {}) {
  const normalizedScope = scope === 'school' ? 'school' : 'class'
  const url = method === 'GET'
    ? `${STUDY_API_URL}?scope=${encodeURIComponent(normalizedScope)}`
    : STUDY_API_URL

  let response
  try {
    response = await fetch(url, {
      method,
      headers: await authHeaders(),
      body: payload ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw studyError('study/network', '스터디 서버에 연결하지 못했습니다.')
  }
  return parseStudyResponse(response)
}

function normalizeActive(value) {
  if (!value || typeof value !== 'object') return null
  const startedAt = Number(value.startedAt || 0)
  const segmentStartedAt = Number(value.segmentStartedAt || 0)
  const pausedAt = Number(value.pausedAt || 0)
  const classId = String(value.classId || '')
  const studentKey = String(value.studentKey || '')
  const name = String(value.name || '').trim().slice(0, 20)
  const subject = String(value.subject || '').trim().slice(0, 24)
  const isPaused = value.isPaused === true
  const sessionSeconds = Math.max(0, Math.floor(Number(value.sessionSeconds || 0)))
  if (!studentKey || !name || !subject || !Number.isFinite(startedAt) || startedAt <= 0) return null
  if (!isPaused && (!Number.isFinite(segmentStartedAt) || segmentStartedAt <= 0)) return null
  return {
    classId,
    studentKey,
    name,
    subject,
    startedAt,
    segmentStartedAt: Number.isFinite(segmentStartedAt) ? segmentStartedAt : 0,
    isPaused,
    pausedAt: Number.isFinite(pausedAt) ? pausedAt : 0,
    sessionSeconds,
  }
}

function normalizeSubjectTotals(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      subject: String(item?.subject || '').trim().slice(0, 24),
      totalSeconds: Math.max(0, Math.floor(Number(item?.totalSeconds || 0))),
    }))
    .filter((item) => item.subject && item.totalSeconds > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.subject.localeCompare(b.subject, 'ko'))
}

function normalizeStudent(value) {
  if (!value || typeof value !== 'object') return null
  const classId = String(value.classId || '')
  const studentKey = String(value.studentKey || '')
  const name = String(value.name || '').trim().slice(0, 20)
  if (!studentKey || !name) return null
  return {
    classId,
    studentKey,
    name,
    totalSeconds: Math.max(0, Math.floor(Number(value.totalSeconds || 0))),
    subjectTotals: normalizeSubjectTotals(value.subjectTotals),
    active: normalizeActive(value.active),
  }
}

export function normalizePreviewStudySnapshot(body) {
  const source = body && typeof body === 'object' ? body : {}
  const students = (Array.isArray(source.students) ? source.students : [])
    .map(normalizeStudent)
    .filter(Boolean)
  const me = normalizeStudent(source.me) || null
  return {
    scope: source.scope === 'school' ? 'school' : 'class',
    date: String(source.date || ''),
    students,
    me,
    generatedAt: Math.max(0, Number(source.generatedAt || Date.now())),
  }
}

export async function loadPreviewStudy({ signal, scope = 'class' } = {}) {
  return normalizePreviewStudySnapshot(await requestStudy({ signal, scope }))
}

export async function startPreviewStudy(subject) {
  const cleanSubject = String(subject || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 24)
  if (!cleanSubject) throw studyError('study/subject-required', '공부할 과목을 선택해 주세요.')
  return requestStudy({ method: 'POST', payload: { action: 'start', subject: cleanSubject } })
}

export async function pausePreviewStudy() {
  return requestStudy({ method: 'POST', payload: { action: 'pause' } })
}

export async function resumePreviewStudy() {
  return requestStudy({ method: 'POST', payload: { action: 'resume' } })
}

export async function stopPreviewStudy() {
  return requestStudy({ method: 'POST', payload: { action: 'stop' } })
}
