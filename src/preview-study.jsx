import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadPreviewStudy,
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

function studentTodaySeconds(student, nowMs) {
  return Math.max(0, Number(student?.totalSeconds || 0))
    + (student?.active ? runningTodaySeconds(student.active.startedAt, nowMs) : 0)
}

function StudyStartCard({ selectedSubject, customSubject, onSubject, onCustomSubject, onStart, saving, error }) {
  const finalSubject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
  return (
    <section className="preview-study-card preview-study-start-card">
      <div className="preview-study-card-heading">
        <div>
          <p>공부 시작</p>
          <h2>무슨 과목 할 거야?</h2>
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

      {error ? <p className="preview-study-error" role="alert">{error}</p> : null}
      <button
        type="button"
        className="preview-study-primary-button"
        onClick={onStart}
        disabled={!finalSubject || saving}
      >
        {saving ? '시작 중…' : '공부 시작'}
      </button>
    </section>
  )
}

function StudyActiveCard({ active, todaySeconds, nowMs, onStop, saving, error }) {
  const elapsed = Math.max(0, Math.floor((nowMs - Number(active.startedAt || 0)) / 1000))
  return (
    <section className="preview-study-card preview-study-active-card">
      <div className="preview-study-live-row">
        <span className="preview-study-live-dot" aria-hidden="true" />
        <span>공부 중</span>
      </div>
      <strong className="preview-study-active-subject">{active.subject}</strong>
      <div className="preview-study-running-time" aria-label={`현재 공부 시간 ${formatStudyDuration(elapsed)}`}>
        {formatStudyDuration(elapsed, { clock: true })}
      </div>
      <div className="preview-study-today-summary">
        <span>오늘 누적</span>
        <strong>{formatStudyDuration(todaySeconds)}</strong>
      </div>
      {error ? <p className="preview-study-error" role="alert">{error}</p> : null}
      <button
        type="button"
        className="preview-study-stop-button"
        onClick={onStop}
        disabled={saving}
      >
        {saving ? '종료 중…' : '공부 종료'}
      </button>
    </section>
  )
}

function ActiveClassmates({ students, meKey, nowMs }) {
  const active = students
    .filter((student) => student.active)
    .sort((a, b) => Number(a.active.startedAt || 0) - Number(b.active.startedAt || 0))

  return (
    <section className="preview-study-section">
      <div className="preview-study-section-heading">
        <h2>지금 공부 중</h2>
        <span>{active.length}명</span>
      </div>
      {active.length ? (
        <div className="preview-study-live-list">
          {active.map((student) => {
            const elapsed = Math.max(0, Math.floor((nowMs - Number(student.active.startedAt || 0)) / 1000))
            return (
              <div className="preview-study-live-person" key={student.studentKey}>
                <span className="preview-study-live-dot" aria-hidden="true" />
                <div>
                  <strong>{student.name}{student.studentKey === meKey ? ' · 나' : ''}</strong>
                  <span>{student.active.subject}</span>
                </div>
                <time>{formatStudyDuration(elapsed)}</time>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="preview-study-empty">지금 공부 중인 학생이 없어.</div>
      )}
    </section>
  )
}

function TodayStudyList({ students, meKey, nowMs }) {
  const ranked = [...students]
    .map((student) => ({ ...student, displaySeconds: studentTodaySeconds(student, nowMs) }))
    .filter((student) => student.displaySeconds > 0 || student.active)
    .sort((a, b) => b.displaySeconds - a.displaySeconds || a.name.localeCompare(b.name, 'ko'))

  return (
    <section className="preview-study-section">
      <div className="preview-study-section-heading">
        <h2>오늘 공부 시간</h2>
        <span>{ranked.length}명 기록</span>
      </div>
      {ranked.length ? (
        <div className="preview-study-today-list">
          {ranked.map((student, index) => (
            <div className="preview-study-today-person" key={student.studentKey}>
              <span className="preview-study-rank" aria-label={`${index + 1}번째`}>{index + 1}</span>
              <div>
                <strong>{student.name}{student.studentKey === meKey ? ' · 나' : ''}</strong>
                {student.active ? <span>{student.active.subject} 공부 중</span> : <span>오늘 기록</span>}
              </div>
              <time>{formatStudyDuration(student.displaySeconds)}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-study-empty">오늘 기록된 공부 시간이 없어.</div>
      )}
    </section>
  )
}

export function PreviewStudyPage({ requireOnline = () => true }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const requestIdRef = useRef(0)
  const realtimeRefreshRef = useRef(0)

  const load = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestIdRef.current
    if (!silent) setLoading(true)
    try {
      const next = await loadPreviewStudy()
      if (requestId !== requestIdRef.current) return
      setSnapshot(next)
      setLoadError('')
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setLoadError(error?.message || '스터디 정보를 불러오지 못했어.')
    } finally {
      if (requestId === requestIdRef.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let stopped = false
    let unsubscribe = () => {}
    subscribePreviewStudyRealtime(() => {
      if (stopped) return
      if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
      realtimeRefreshRef.current = window.setTimeout(() => {
        realtimeRefreshRef.current = 0
        load({ silent: true })
      }, 160)
    }).then((cleanup) => {
      if (stopped) cleanup()
      else unsubscribe = cleanup
    }).catch((error) => {
      console.warn('S-Hub study realtime unavailable:', error)
    })
    return () => {
      stopped = true
      if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
      realtimeRefreshRef.current = 0
      unsubscribe()
    }
  }, [load])

  useEffect(() => {
    const refresh = () => {
      if (document.hidden || navigator.onLine === false) return
      setNowMs(Date.now())
      load({ silent: true })
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [load])

  const me = snapshot?.me || null
  const meKey = me?.studentKey || ''
  const myActive = me?.active || null
  const myTodaySeconds = useMemo(
    () => studentTodaySeconds(me, nowMs),
    [me, nowMs],
  )

  async function start() {
    const subject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
    if (!subject || saving) return
    if (!requireOnline('스터디를 시작')) return
    setSaving(true)
    setActionError('')
    try {
      await startPreviewStudy(subject)
      await broadcastPreviewStudyRealtime('start')
      await load({ silent: true })
      setSelectedSubject('')
      setCustomSubject('')
      setNowMs(Date.now())
    } catch (error) {
      setActionError(error?.message || '공부를 시작하지 못했어.')
    } finally {
      setSaving(false)
    }
  }

  async function stop() {
    if (!myActive || saving) return
    if (!requireOnline('스터디를 종료')) return
    setSaving(true)
    setActionError('')
    try {
      await stopPreviewStudy()
      await broadcastPreviewStudyRealtime('stop')
      await load({ silent: true })
      setNowMs(Date.now())
    } catch (error) {
      setActionError(error?.message || '공부를 종료하지 못했어.')
    } finally {
      setSaving(false)
    }
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
        <div className="preview-study-loading">스터디 기록 불러오는 중…</div>
      ) : null}

      {loadError && !snapshot ? (
        <div className="preview-study-load-error">
          <p>{loadError}</p>
          <button type="button" onClick={() => load()}>다시 불러오기</button>
        </div>
      ) : null}

      {snapshot ? (
        <div className="preview-study-stack">
          {myActive ? (
            <StudyActiveCard
              active={myActive}
              todaySeconds={myTodaySeconds}
              nowMs={nowMs}
              onStop={stop}
              saving={saving}
              error={actionError}
            />
          ) : (
            <StudyStartCard
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
              saving={saving}
              error={actionError}
            />
          )}

          {loadError ? <p className="preview-study-inline-warning">실시간 새로고침이 잠시 끊겼어. 마지막으로 받은 기록을 보여주고 있어.</p> : null}
          <ActiveClassmates students={snapshot.students} meKey={meKey} nowMs={nowMs} />
          <TodayStudyList students={snapshot.students} meKey={meKey} nowMs={nowMs} />
        </div>
      ) : null}
    </section>
  )
}
