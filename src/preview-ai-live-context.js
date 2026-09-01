import { loadPreviewBoard } from './preview-board-client.js'
import { loadPreviewStudy } from './preview-study-client.js'
import { readStudentProfile } from './school-sync.js'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MAX_CLASS_STUDENTS = 60
const MAX_SCHOOL_STUDENTS = 120
const MAX_BOARD_POSTS = 24
const MAX_BOARD_COMMENTS_PER_POST = 3
const CONTEXT_DATA_KEYS = ['study', 'board', 'reminders', 'timetable', 'academic', 'meals']

function cleanText(value, maxLength) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function todayKstMidnightUtc(nowMs) {
  const date = new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10)
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS
}

function runningTodaySeconds(startedAt, nowMs) {
  const start = Number(startedAt || 0)
  const now = Number(nowMs || 0)
  if (!Number.isFinite(start) || !Number.isFinite(now) || start <= 0 || now <= start) return 0
  const effectiveStart = Math.max(start, todayKstMidnightUtc(now))
  return Math.max(0, Math.floor((now - effectiveStart) / 1000))
}

function studyDisplaySeconds(student, nowMs) {
  const recorded = Math.max(0, Math.floor(Number(student?.totalSeconds || 0)))
  const active = student?.active
  if (!active || active.isPaused) return recorded
  return recorded + runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
}

function studySubjectTotals(student, nowMs) {
  const totals = new Map()
  for (const row of Array.isArray(student?.subjectTotals) ? student.subjectTotals : []) {
    const subject = cleanText(row?.subject, 24)
    const seconds = Math.max(0, Math.floor(Number(row?.totalSeconds || 0)))
    if (!subject || !seconds) continue
    totals.set(subject, (totals.get(subject) || 0) + seconds)
  }

  const active = student?.active
  if (active && !active.isPaused) {
    const liveSeconds = runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
    const subject = cleanText(active.subject, 24)
    if (subject && liveSeconds > 0) totals.set(subject, (totals.get(subject) || 0) + liveSeconds)
  }

  return [...totals.entries()]
    .map(([subject, totalSeconds]) => ({ subject, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.subject.localeCompare(b.subject, 'ko'))
    .slice(0, 6)
}

function studyIdentity(student) {
  if (!student) return ''
  return `${String(student.classId || '')}|${String(student.studentKey || '')}`
}

function normalizeStudySnapshot(snapshot, scope, nowMs) {
  const allRanked = [...(Array.isArray(snapshot?.students) ? snapshot.students : [])]
    .map((student) => ({ ...student, displaySeconds: studyDisplaySeconds(student, nowMs) }))
    .filter((student) => student.displaySeconds > 0 || student.active)
    .sort((a, b) => b.displaySeconds - a.displaySeconds || String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
  const limit = scope === 'school' ? MAX_SCHOOL_STUDENTS : MAX_CLASS_STUDENTS
  const ranked = allRanked.slice(0, limit)
  const meId = studyIdentity(snapshot?.me)
  const meIndex = meId ? allRanked.findIndex((student) => studyIdentity(student) === meId) : -1

  const studentRow = (student, rank) => ({
    rank,
    name: cleanText(student?.name, 20),
    classId: cleanText(student?.classId, 32),
    totalSeconds: Math.max(0, Math.floor(Number(student?.displaySeconds || studyDisplaySeconds(student, nowMs)))),
    subjectTotals: studySubjectTotals(student, nowMs),
    active: student?.active ? {
      subject: cleanText(student.active.subject, 24),
      isPaused: student.active.isPaused === true,
      startedAt: Math.max(0, Number(student.active.startedAt || 0)),
    } : null,
  })

  return {
    scope,
    date: cleanText(snapshot?.date, 12),
    generatedAt: Math.max(0, Number(snapshot?.generatedAt || nowMs)),
    recordedStudentCount: allRanked.length,
    students: ranked.map((student, index) => studentRow(student, index + 1)),
    me: meIndex >= 0 ? studentRow(allRanked[meIndex], meIndex + 1) : null,
  }
}

function normalizeBoardSnapshot(result, nowMs) {
  const sections = (Array.isArray(result?.sections) ? result.sections : [])
    .map((section) => ({
      id: cleanText(section?.id, 40),
      label: cleanText(section?.label, 24),
    }))
    .filter((section) => section.id && section.label)
  const sectionMap = new Map(sections.map((section) => [section.id, section.label]))

  const posts = (Array.isArray(result?.posts) ? result.posts : [])
    .slice(0, MAX_BOARD_POSTS)
    .map((post) => {
      const comments = (Array.isArray(post?.comments) ? post.comments : [])
        .slice(-MAX_BOARD_COMMENTS_PER_POST)
        .map((comment) => ({
          authorName: cleanText(comment?.authorName || '학생', 20),
          body: cleanText(comment?.body, 180),
          createdAt: Math.max(0, Number(comment?.createdAt || 0)),
        }))
        .filter((comment) => comment.body)
      const attachments = (Array.isArray(post?.attachments) ? post.attachments : [])
        .slice(0, 4)
        .map((attachment) => cleanText(attachment?.name || attachment?.fileName, 100))
        .filter(Boolean)

      return {
        id: cleanText(post?.id, 100),
        sectionId: cleanText(post?.sectionId, 40),
        section: sectionMap.get(String(post?.sectionId || '')) || cleanText(post?.sectionId, 40),
        kind: cleanText(post?.kind, 24),
        title: cleanText(post?.title, 120),
        body: cleanText(post?.body, 420),
        authorName: cleanText(post?.authorName || '학생', 20),
        createdAt: Math.max(0, Number(post?.createdAt || 0)),
        updatedAt: Math.max(0, Number(post?.updatedAt || 0)),
        resolved: post?.resolved === true,
        attachments,
        comments,
      }
    })
    .filter((post) => post.id && post.title)

  return {
    generatedAt: nowMs,
    sections,
    posts,
    returnedPostCount: posts.length,
    hasMore: Boolean(result?.hasMore),
  }
}

function normalizeProfile() {
  const profile = readStudentProfile()
  if (!profile) return null
  return {
    classNumber: Number(profile.classNumber || 0) || 0,
    studentNumber: Number(profile.studentNumber || 0) || 0,
    name: cleanText(profile.name, 20),
  }
}

function wantsSchoolStudy(question) {
  const text = cleanText(question, 500)
  if (!text) return false
  const studyIntent = /스터디|공부|학습|랭킹|순위|\d+\s*등|몇\s*등/i.test(text)
  const schoolScope = /전교|학교\s*(?:전체|랭킹|순위)|전체\s*(?:학생|랭킹|순위)/i.test(text)
  return studyIntent && schoolScope
}

function questionPriorityKeys(question) {
  const text = cleanText(question, 500)
  const keys = []
  const add = (key) => { if (!keys.includes(key)) keys.push(key) }

  if (/스터디|공부|학습|랭킹|순위|\d+\s*등|몇\s*등/i.test(text)) add('study')
  if (/게시판|게시글|글\s*(?:올라|쓴|작성)|댓글|필기|자료실|질문글/i.test(text)) add('board')
  if (/급식|점심|중식|메뉴|밥/i.test(text)) add('meals')
  if (/시간표|교시|수업|과목/i.test(text)) add('timetable')
  if (/리마인더|할\s*일|과제|제출|준비물|수행평가|시험|고사/i.test(text)) add('reminders')
  if (/학사|일정|행사|방학|개학|휴업|시험기간/i.test(text)) add('academic')
  return keys
}

export function prioritizePreviewAIContext(question, context = {}, live = {}) {
  const base = context && typeof context === 'object' ? context : {}
  const ordered = {
    reference: base.reference || '',
    profile: live.profile || null,
    liveSources: live.liveSources || {},
  }
  const merged = {
    study: live.study || null,
    board: live.board || null,
    reminders: base.reminders || [],
    timetable: base.timetable || [],
    academic: base.academic || [],
    meals: base.meals || [],
  }

  for (const key of questionPriorityKeys(question)) ordered[key] = merged[key]
  for (const key of CONTEXT_DATA_KEYS) {
    if (!(key in ordered)) ordered[key] = merged[key]
  }
  for (const [key, value] of Object.entries(base)) {
    if (!(key in ordered)) ordered[key] = value
  }
  return ordered
}

async function settleSource(loader, signal) {
  try {
    return { status: 'ok', value: await loader() }
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error
    console.warn('Preview S-Hub AI live source unavailable:', error)
    return { status: 'unavailable', value: null }
  }
}

export async function loadPreviewAIContext({ question = '', context = {}, signal = null } = {}) {
  const nowMs = Date.now()
  const includeSchoolStudy = wantsSchoolStudy(question)

  const classStudyPromise = settleSource(
    () => loadPreviewStudy({ signal, scope: 'class' }),
    signal,
  )
  const boardPromise = settleSource(
    () => loadPreviewBoard({ signal, sectionId: 'all', forceSections: true }),
    signal,
  )
  const schoolStudyPromise = includeSchoolStudy
    ? settleSource(() => loadPreviewStudy({ signal, scope: 'school' }), signal)
    : Promise.resolve({ status: 'not-requested', value: null })

  const [classStudySource, boardSource, schoolStudySource] = await Promise.all([
    classStudyPromise,
    boardPromise,
    schoolStudyPromise,
  ])

  const live = {
    profile: normalizeProfile(),
    study: {
      class: classStudySource.value ? normalizeStudySnapshot(classStudySource.value, 'class', nowMs) : null,
      school: schoolStudySource.value ? normalizeStudySnapshot(schoolStudySource.value, 'school', nowMs) : null,
    },
    board: boardSource.value ? normalizeBoardSnapshot(boardSource.value, nowMs) : null,
    liveSources: {
      studyClass: classStudySource.status,
      studySchool: schoolStudySource.status,
      board: boardSource.status,
    },
  }

  return prioritizePreviewAIContext(question, context, live)
}
