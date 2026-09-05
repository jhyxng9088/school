import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadPreviewStudy,
  pausePreviewStudy,
  resumePreviewStudy,
  startPreviewStudy,
  stopPreviewStudy,
} from './preview-study-client.js'
import {
  broadcastPreviewStudyRealtime,
  subscribePreviewStudyRealtime,
} from './preview-study-realtime.js'
import './preview-study.css'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const SUBJECTS = ['국어', '수학', '영어', '사회', '과학', '기타']

function todayKstMidnightUtc(nowMs) {
  const date = new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10)
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS
}

export function runningTodaySeconds(startedAt, nowMs = Date.now()) {
  const start = Number(startedAt || 0)
  const now = Number(nowMs || 0)
  if (!Number.isFinite(start) || !Number.isFinite(now) || start <= 0 || now <= start) return 0
  const effectiveStart = Math.max(start, todayKstMidnightUtc(now))
  return Math.max(0, Math.floor((now - effectiveStart) / 1000))
}

export function formatStudyDuration(totalSeconds, { clock = false } = {}) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (clock) return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':')
  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분`
  return seconds > 0 ? `${seconds}초` : '0분'
}

export function activeSessionSeconds(active, nowMs = Date.now()) {
  if (!active) return 0
  const saved = Math.max(0, Math.floor(Number(active.sessionSeconds || 0)))
  if (active.isPaused) return saved
  const segmentStartedAt = Number(active.segmentStartedAt || active.startedAt || 0)
  if (!Number.isFinite(segmentStartedAt) || segmentStartedAt <= 0) return saved
  return saved + Math.max(0, Math.floor((nowMs - segmentStartedAt) / 1000))
}

function studentTodaySeconds(student, nowMs) {
  const recorded = Math.max(0, Number(student?.totalSeconds || 0))
  const active = student?.active
  if (!active || active.isPaused) return recorded
  return recorded + runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
}

function studentIdentity(student) {
  if (!student) return ''
  return `${String(student.classId || '')}:${String(student.studentKey || '')}`
}

function classLabel(classId) {
  const match = /^(?:preview-)?class-(\d+)$/.exec(String(classId || ''))
  return match ? `${Number(match[1])}반` : '반 정보 없음'
}

function studentSubjectTotals(student, nowMs) {
  const totals = new Map()
  for (const row of Array.isArray(student?.subjectTotals) ? student.subjectTotals : []) {
    const subject = String(row?.subject || '').trim()
    const seconds = Math.max(0, Math.floor(Number(row?.totalSeconds || 0)))
    if (!subject || !seconds) continue
    totals.set(subject, (totals.get(subject) || 0) + seconds)
  }

  const active = student?.active
  if (active && !active.isPaused) {
    const liveSeconds = runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
    if (liveSeconds > 0) totals.set(active.subject, (totals.get(active.subject) || 0) + liveSeconds)
  }

  return [...totals.entries()]
    .map(([subject, totalSeconds]) => ({ subject, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.subject.localeCompare(b.subject, 'ko'))
}

function rankedStudents(students, nowMs) {
  return [...(Array.isArray(students) ? students : [])]
    .map((student) => ({ ...student, displaySeconds: studentTodaySeconds(student, nowMs) }))
    .filter((student) => student.displaySeconds > 0 || student.active)
    .sort((a, b) => b.displaySeconds - a.displaySeconds || a.name.localeCompare(b.name, 'ko'))
}

function StudyControlCard({
  active,
  todaySeconds,
  nowMs,
  selectedSubject,
  customSubject,
  onSubject,
  onCustomSubject,
  onStart,
  onPause,
  onResume,
  onStop,
  saving,
  actionKind,
  error,
}) {
  const finalSubject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
  const hasActive = Boolean(active)
  const paused = Boolean(active?.isPaused)
  const elapsed = activeSessionSeconds(active, nowMs)

  let primaryLabel = '공부 시작'
  if (hasActive) primaryLabel = paused ? '계속하기' : '일시정지'
  if (saving && actionKind === 'start') primaryLabel = '시작 중…'
  if (saving && actionKind === 'pause') primaryLabel = '일시정지 중…'
  if (saving && actionKind === 'resume') primaryLabel = '계속하는 중…'

  const stopLabel = saving && actionKind === 'stop' ? '종료 중…' : '공부 종료'
  const primaryDisabled = saving || (!hasActive && !finalSubject)

  function handlePrimary() {
    if (hasActive) {
      if (paused) onResume()
      else onPause()
      return
    }
    onStart()
  }

  return (
    <section className={`preview-study-card preview-study-control-card${paused ? ' is-paused' : ''}`}>
      <div className="preview-study-control-content" key={hasActive ? 'active' : 'setup'}>
        {hasActive ? (
          <>
            <div className="preview-study-live-row">
              <span className={`preview-study-live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
              <span>{paused ? '일시정지' : '공부 중'}</span>
            </div>
            <strong className="preview-study-active-subject">{active.subject}</strong>
            <div className="preview-study-running-time" aria-label={`현재 스터디 시간 ${formatStudyDuration(elapsed)}`}>
              {formatStudyDuration(elapsed, { clock: true })}
            </div>
            <div className="preview-study-today-summary">
              <span>오늘 누적</span>
              <strong>{formatStudyDuration(todaySeconds)}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="preview-study-card-heading">
              <div>
                <p>공부 시작</p>
                <h2>공부할 과목을 선택해 주세요.</h2>
              </div>
            </div>

            <div className="preview-study-subjects" role="group" aria-label="공부 과목 선택">
              {SUBJECTS.map((subject) => (
                <button
                  type="button"
                  className={selectedSubject === subject ? 'is-selected' : ''}
                  aria-pressed={selectedSubject === subject}
                  onClick={() => onSubject(subject)}
                  key={subject}
                >
                  {subject}
                </button>
              ))}
            </div>

            {selectedSubject === '기타' ? (
              <label className="preview-study-custom-subject">
                <span>과목 이름</span>
                <input
                  value={customSubject}
                  onChange={(event) => onCustomSubject(event.target.value.slice(0, 24))}
                  placeholder="예: 생명과학"
                  autoComplete="off"
                  maxLength={24}
                />
              </label>
            ) : null}
          </>
        )}
      </div>

      {error ? <p className="preview-study-error" role="alert">{error}</p> : null}

      <div
        className={`preview-study-action-dock${hasActive ? ' is-active' : ' is-idle'}${paused ? ' is-paused' : ''}${saving ? ' is-saving' : ''}`}
        data-study-control-state={hasActive ? (paused ? 'paused' : 'running') : 'idle'}
      >
        <button
          type="button"
          className="preview-study-primary-button preview-study-morph-primary"
          onClick={handlePrimary}
          disabled={primaryDisabled}
          aria-live="polite"
        >
          <span className="preview-study-action-label" key={primaryLabel}>{primaryLabel}</span>
        </button>
        <button
          type="button"
          className="preview-study-stop-button preview-study-morph-stop"
          onClick={onStop}
          disabled={!hasActive || saving}
          tabIndex={hasActive ? 0 : -1}
          aria-hidden={!hasActive}
        >
          <span className="preview-study-action-label" key={stopLabel}>{stopLabel}</span>
        </button>
      </div>
    </section>
  )
}

function ActiveClassmates({ students, meId, nowMs, onStudent }) {
  const active = students
    .filter((student) => student.active)
    .sort((a, b) => Number(a.active.isPaused) - Number(b.active.isPaused)
      || Number(a.active.startedAt || 0) - Number(b.active.startedAt || 0))

  return (
    <section className="preview-study-section">
      <div className="preview-study-section-heading">
        <h2>현재 스터디</h2>
        <span>{active.length}명</span>
      </div>
      {active.length ? (
        <div className="preview-study-live-list">
          {active.map((student) => {
            const elapsed = activeSessionSeconds(student.active, nowMs)
            const id = studentIdentity(student)
            return (
              <button
                type="button"
                className={`preview-study-live-person${student.active.isPaused ? ' is-paused' : ''}`}
                key={id}
                onClick={() => onStudent(student)}
              >
                <span className={`preview-study-live-dot${student.active.isPaused ? ' is-paused' : ''}`} aria-hidden="true" />
                <span className="preview-study-person-copy">
                  <strong>{student.name}{id === meId ? ' · 본인' : ''}</strong>
                  <span>{student.active.subject}{student.active.isPaused ? ' · 일시정지' : ' · 공부 중'}</span>
                </span>
                <time>{formatStudyDuration(elapsed)}</time>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="preview-study-empty">현재 스터디 중인 학생이 없습니다.</div>
      )}
    </section>
  )
}

function StudyRanking({
  classSnapshot,
  schoolSnapshot,
  schoolLoading,
  schoolError,
  scope,
  onScope,
  onRetrySchool,
  meId,
  nowMs,
  onStudent,
}) {
  const source = scope === 'school' ? schoolSnapshot : classSnapshot
  const ranked = rankedStudents(source?.students, nowMs)
  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot

  return (
    <section className="preview-study-section preview-study-ranking-section">
      <div className="preview-study-section-heading">
        <h2>오늘 공부 랭킹</h2>
        <span>{waitingForSchool ? '불러오는 중' : `${ranked.length}명 기록`}</span>
      </div>

      <div className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 범위">
        <button
          type="button"
          className={scope === 'class' ? 'is-selected' : ''}
          aria-pressed={scope === 'class'}
          onClick={() => onScope('class')}
        >
          우리반
        </button>
        <button
          type="button"
          className={scope === 'school' ? 'is-selected' : ''}
          aria-pressed={scope === 'school'}
          onClick={() => onScope('school')}
        >
          전교
        </button>
      </div>

      <div className="preview-study-ranking-stage" key={scope}>
        {waitingForSchool ? (
          <div className="preview-study-empty preview-study-ranking-loading">전교 랭킹을 불러오는 중…</div>
        ) : schoolError && scope === 'school' && !schoolSnapshot ? (
          <div className="preview-study-load-error preview-study-ranking-error">
            <p>{schoolError}</p>
            <button type="button" onClick={onRetrySchool}>다시 불러오기</button>
          </div>
        ) : ranked.length ? (
          <div className="preview-study-today-list">
            {ranked.map((student, index) => {
              const id = studentIdentity(student)
              const detail = student.active
                ? `${student.active.subject}${student.active.isPaused ? ' · 일시정지' : ' · 공부 중'}`
                : '오늘 기록'
              const subtitle = scope === 'school' ? `${classLabel(student.classId)} · ${detail}` : detail
              return (
                <button
                  type="button"
                  className="preview-study-today-person"
                  key={id}
                  onClick={() => onStudent(student)}
                >
                  <span className="preview-study-rank" aria-label={`${index + 1}위`}>{index + 1}</span>
                  <span className="preview-study-person-copy">
                    <strong>{student.name}{id === meId ? ' · 본인' : ''}</strong>
                    <span>{subtitle}</span>
                  </span>
                  <time>{formatStudyDuration(student.displaySeconds)}</time>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="preview-study-empty">오늘 기록된 공부 시간이 없습니다.</div>
        )}
      </div>

      {scope === 'school' && schoolError && schoolSnapshot ? (
        <p className="preview-study-inline-warning">전교 랭킹 실시간 갱신이 일시적으로 중단되었습니다. 마지막 기록을 표시합니다.</p>
      ) : null}
    </section>
  )
}

function StudyStudentSheet({ student, meId, nowMs, onClose }) {
  const id = studentIdentity(student)
  const totalSeconds = studentTodaySeconds(student, nowMs)
  const subjects = studentSubjectTotals(student, nowMs)
  const knownSubjectSeconds = subjects.reduce((sum, item) => sum + item.totalSeconds, 0)
  const missingBreakdown = Math.max(0, totalSeconds - knownSubjectSeconds)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="preview-study-sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="preview-study-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name} 공부 기록`}
      >
        <div className="preview-study-sheet-handle" aria-hidden="true" />
        <header className="preview-study-sheet-header">
          <div>
            <span>{classLabel(student.classId)}</span>
            <h2>{student.name}{id === meId ? ' · 본인' : ''}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="preview-study-sheet-total">
          <span>오늘 총 공부</span>
          <strong>{formatStudyDuration(totalSeconds)}</strong>
        </div>

        {student.active ? (
          <div className="preview-study-sheet-live">
            <span className={`preview-study-live-dot${student.active.isPaused ? ' is-paused' : ''}`} aria-hidden="true" />
            <span>{student.active.subject} · {student.active.isPaused ? '일시정지' : '공부 중'}</span>
          </div>
        ) : null}

        <div className="preview-study-sheet-subject-heading">
          <h3>과목별 공부 시간</h3>
          <span>{subjects.length}개 과목</span>
        </div>

        {subjects.length ? (
          <div className="preview-study-subject-breakdown">
            {subjects.map((item) => (
              <div key={item.subject}>
                <span>{item.subject}</span>
                <strong>{formatStudyDuration(item.totalSeconds)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="preview-study-sheet-empty">아직 과목별 공부 기록이 없습니다.</div>
        )}

        {missingBreakdown > 2 ? (
          <p className="preview-study-sheet-note">
            업데이트 이전에 기록된 {formatStudyDuration(missingBreakdown)}은 과목별로 분리되지 않습니다.
          </p>
        ) : null}
      </section>
    </div>
  )
}

export function PreviewStudyPage({ requireOnline = () => true }) {
  const [snapshot, setSnapshot] = useState(null)
  const [schoolSnapshot, setSchoolSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [schoolError, setSchoolError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionKind, setActionKind] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const [rankingScope, setRankingScope] = useState('class')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const requestIdRef = useRef(0)
  const schoolRequestIdRef = useRef(0)
  const realtimeRefreshRef = useRef(0)
  const schoolRealtimeRefreshRef = useRef(0)
  const schoolSnapshotRef = useRef(null)
  const rankingScopeRef = useRef('class')

  useEffect(() => {
    schoolSnapshotRef.current = schoolSnapshot
  }, [schoolSnapshot])

  useEffect(() => {
    rankingScopeRef.current = rankingScope
  }, [rankingScope])

  const load = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestIdRef.current
    if (!silent) setLoading(true)
    try {
      const next = await loadPreviewStudy({ scope: 'class' })
      if (requestId !== requestIdRef.current) return
      setSnapshot(next)
      setLoadError('')
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setLoadError(error?.message || '스터디 정보를 불러오지 못했습니다.')
    } finally {
      if (requestId === requestIdRef.current && !silent) setLoading(false)
    }
  }, [])

  const loadSchool = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++schoolRequestIdRef.current
    if (!silent) setSchoolLoading(true)
    try {
      const next = await loadPreviewStudy({ scope: 'school' })
      if (requestId !== schoolRequestIdRef.current) return
      setSchoolSnapshot(next)
      setSchoolError('')
    } catch (error) {
      if (requestId !== schoolRequestIdRef.current) return
      setSchoolError(error?.message || '전교 랭킹을 불러오지 못했습니다.')
    } finally {
      if (requestId === schoolRequestIdRef.current && !silent) setSchoolLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (rankingScope !== 'school' || schoolSnapshot || schoolLoading) return
    loadSchool()
  }, [rankingScope, schoolSnapshot, schoolLoading, loadSchool])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let stopped = false
    let unsubscribe = () => {}
    subscribePreviewStudyRealtime(
      () => {
        if (stopped) return
        if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
        realtimeRefreshRef.current = window.setTimeout(() => {
          realtimeRefreshRef.current = 0
          load({ silent: true })
        }, 160)
      },
      () => {
        if (stopped || (!schoolSnapshotRef.current && rankingScopeRef.current !== 'school')) return
        if (schoolRealtimeRefreshRef.current) window.clearTimeout(schoolRealtimeRefreshRef.current)
        schoolRealtimeRefreshRef.current = window.setTimeout(() => {
          schoolRealtimeRefreshRef.current = 0
          loadSchool({ silent: true })
        }, 220)
      },
    ).then((cleanup) => {
      if (stopped) cleanup()
      else unsubscribe = cleanup
    }).catch((error) => {
      console.warn('S-Hub study realtime unavailable:', error)
    })
    return () => {
      stopped = true
      if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
      if (schoolRealtimeRefreshRef.current) window.clearTimeout(schoolRealtimeRefreshRef.current)
      realtimeRefreshRef.current = 0
      schoolRealtimeRefreshRef.current = 0
      unsubscribe()
    }
  }, [load, loadSchool])

  useEffect(() => {
    const refresh = () => {
      if (document.hidden || navigator.onLine === false) return
      setNowMs(Date.now())
      load({ silent: true })
      if (schoolSnapshotRef.current || rankingScopeRef.current === 'school') loadSchool({ silent: true })
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [load, loadSchool])

  const me = snapshot?.me || null
  const meId = studentIdentity(me)
  const myActive = me?.active || null
  const myTodaySeconds = useMemo(
    () => studentTodaySeconds(me, nowMs),
    [me, nowMs],
  )

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null
    const schoolMatch = schoolSnapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId)
    if (schoolMatch) return schoolMatch
    return snapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId) || null
  }, [selectedStudentId, schoolSnapshot, snapshot])

  const closeStudentSheet = useCallback(() => setSelectedStudentId(''), [])

  async function runAction({ kind, onlineLabel, action, broadcastAction, fallbackMessage }) {
    if (saving || !requireOnline(onlineLabel)) return false
    setSaving(true)
    setActionKind(kind)
    setActionError('')
    try {
      await action()
      await broadcastPreviewStudyRealtime(broadcastAction)
      await load({ silent: true })
      if (schoolSnapshotRef.current || rankingScopeRef.current === 'school') await loadSchool({ silent: true })
      setNowMs(Date.now())
      return true
    } catch (error) {
      setActionError(error?.message || fallbackMessage)
      return false
    } finally {
      setSaving(false)
      setActionKind('')
    }
  }

  async function start() {
    const subject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
    if (!subject || saving) return
    const succeeded = await runAction({
      kind: 'start',
      onlineLabel: '스터디를 시작',
      action: () => startPreviewStudy(subject),
      broadcastAction: 'start',
      fallbackMessage: '공부를 시작하지 못했습니다.',
    })
    if (succeeded) {
      setSelectedSubject('')
      setCustomSubject('')
    }
  }

  async function pause() {
    if (!myActive || myActive.isPaused) return
    await runAction({
      kind: 'pause',
      onlineLabel: '스터디를 일시정지',
      action: pausePreviewStudy,
      broadcastAction: 'pause',
      fallbackMessage: '스터디를 일시정지하지 못했습니다.',
    })
  }

  async function resume() {
    if (!myActive || !myActive.isPaused) return
    await runAction({
      kind: 'resume',
      onlineLabel: '스터디를 계속',
      action: resumePreviewStudy,
      broadcastAction: 'resume',
      fallbackMessage: '스터디를 계속하지 못했습니다.',
    })
  }

  async function stop() {
    if (!myActive) return
    await runAction({
      kind: 'stop',
      onlineLabel: '스터디를 종료',
      action: stopPreviewStudy,
      broadcastAction: 'stop',
      fallbackMessage: '공부를 종료하지 못했습니다.',
    })
  }

  return (
    <section className="preview-study-page">
      <header className="page-header preview-study-header">
        <div>
          <p className="eyebrow">S-Hub V2</p>
          <h1>스터디</h1>
        </div>
        <span className="preview-study-date">오늘</span>
      </header>

      {loading && !snapshot ? (
        <div className="preview-study-loading">스터디 기록을 불러오는 중…</div>
      ) : null}

      {loadError && !snapshot ? (
        <div className="preview-study-load-error">
          <p>{loadError}</p>
          <button type="button" onClick={() => load()}>다시 불러오기</button>
        </div>
      ) : null}

      {snapshot ? (
        <div className="preview-study-stack">
          <StudyControlCard
            active={myActive}
            todaySeconds={myTodaySeconds}
            nowMs={nowMs}
            selectedSubject={selectedSubject}
            customSubject={customSubject}
            onSubject={(subject) => {
              setSelectedSubject(subject)
              setActionError('')
              if (subject !== '기타') setCustomSubject('')
            }}
            onCustomSubject={(value) => {
              setCustomSubject(value)
              setActionError('')
            }}
            onStart={start}
            onPause={pause}
            onResume={resume}
            onStop={stop}
            saving={saving}
            actionKind={actionKind}
            error={actionError}
          />

          {loadError ? <p className="preview-study-inline-warning">실시간 새로고침이 일시적으로 중단되었습니다. 마지막으로 불러온 기록을 표시합니다.</p> : null}
          <ActiveClassmates
            students={snapshot.students}
            meId={meId}
            nowMs={nowMs}
            onStudent={(student) => setSelectedStudentId(studentIdentity(student))}
          />
          <StudyRanking
            classSnapshot={snapshot}
            schoolSnapshot={schoolSnapshot}
            schoolLoading={schoolLoading}
            schoolError={schoolError}
            scope={rankingScope}
            onScope={setRankingScope}
            onRetrySchool={() => loadSchool()}
            meId={meId}
            nowMs={nowMs}
            onStudent={(student) => setSelectedStudentId(studentIdentity(student))}
          />
        </div>
      ) : null}

      {selectedStudent ? (
        <StudyStudentSheet
          student={selectedStudent}
          meId={meId}
          nowMs={nowMs}
          onClose={closeStudentSheet}
        />
      ) : null}
    </section>
  )
}
