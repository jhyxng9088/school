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

function StudyStartCard({ selectedSubject, customSubject, onSubject, onCustomSubject, onStart, saving, error }) {
  const finalSubject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
  return (
    <section className="preview-study-card preview-study-start-card">
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

function StudyActiveCard({ active, todaySeconds, nowMs, onPause, onResume, onStop, saving, error }) {
  const elapsed = activeSessionSeconds(active, nowMs)
  return (
    <section className={`preview-study-card preview-study-active-card${active.isPaused ? ' is-paused' : ''}`}>
      <div className="preview-study-live-row">
        <span className={`preview-study-live-dot${active.isPaused ? ' is-paused' : ''}`} aria-hidden="true" />
        <span>{active.isPaused ? '일시정지' : '공부 중'}</span>
      </div>
      <strong className="preview-study-active-subject">{active.subject}</strong>
      <div className="preview-study-running-time" aria-label={`현재 스터디 시간 ${formatStudyDuration(elapsed)}`}>
        {formatStudyDuration(elapsed, { clock: true })}
      </div>
      <div className="preview-study-today-summary">
        <span>오늘 누적</span>
        <strong>{formatStudyDuration(todaySeconds)}</strong>
      </div>
      {error ? <p className="preview-study-error" role="alert">{error}</p> : null}
      <div className="preview-study-action-row">
        <button
          type="button"
          className="preview-study-pause-button"
          onClick={active.isPaused ? onResume : onPause}
          disabled={saving}
        >
          {saving ? '처리 중…' : active.isPaused ? '계속하기' : '일시정지'}
        </button>
        <button
          type="button"
          className="preview-study-stop-button"
          onClick={onStop}
          disabled={saving}
        >
          {saving ? '처리 중…' : '공부 종료'}
        </button>
      </div>
    </section>
  )
}

function ActiveClassmates({ students, meKey, nowMs }) {
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
            return (
              <div className={`preview-study-live-person${student.active.isPaused ? ' is-paused' : ''}`} key={student.studentKey}>
                <span className={`preview-study-live-dot${student.active.isPaused ? ' is-paused' : ''}`} aria-hidden="true" />
                <div>
                  <strong>{student.name}{student.studentKey === meKey ? ' · 본인' : ''}</strong>
                  <span>{student.active.subject}{student.active.isPaused ? ' · 일시정지' : ' · 공부 중'}</span>
                </div>
                <time>{formatStudyDuration(elapsed)}</time>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="preview-study-empty">현재 스터디 중인 학생이 없습니다.</div>
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
              <span className="preview-study-rank" aria-label={`${index + 1}위`}>{index + 1}</span>
              <div>
                <strong>{student.name}{student.studentKey === meKey ? ' · 본인' : ''}</strong>
                {student.active ? (
                  <span>{student.active.subject}{student.active.isPaused ? ' · 일시정지' : ' · 공부 중'}</span>
                ) : <span>오늘 기록</span>}
              </div>
              <time>{formatStudyDuration(student.displaySeconds)}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-study-empty">오늘 기록된 공부 시간이 없습니다.</div>
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
      setLoadError(error?.message || '스터디 정보를 불러오지 못했습니다.')
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

  async function runAction({ onlineLabel, action, broadcastAction, fallbackMessage }) {
    if (saving || !requireOnline(onlineLabel)) return
    setSaving(true)
    setActionError('')
    try {
      await action()
      await broadcastPreviewStudyRealtime(broadcastAction)
      await load({ silent: true })
      setNowMs(Date.now())
    } catch (error) {
      setActionError(error?.message || fallbackMessage)
    } finally {
      setSaving(false)
    }
  }

  async function start() {
    const subject = selectedSubject === '기타' ? customSubject.trim() : selectedSubject
    if (!subject || saving) return
    await runAction({
      onlineLabel: '스터디를 시작',
      action: () => startPreviewStudy(subject),
      broadcastAction: 'start',
      fallbackMessage: '공부를 시작하지 못했습니다.',
    })
    setSelectedSubject('')
    setCustomSubject('')
  }

  async function pause() {
    if (!myActive || myActive.isPaused) return
    await runAction({
      onlineLabel: '스터디를 일시정지',
      action: pausePreviewStudy,
      broadcastAction: 'pause',
      fallbackMessage: '스터디를 일시정지하지 못했습니다.',
    })
  }

  async function resume() {
    if (!myActive || !myActive.isPaused) return
    await runAction({
      onlineLabel: '스터디를 계속',
      action: resumePreviewStudy,
      broadcastAction: 'resume',
      fallbackMessage: '스터디를 계속하지 못했습니다.',
    })
  }

  async function stop() {
    if (!myActive) return
    await runAction({
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
          {myActive ? (
            <StudyActiveCard
              active={myActive}
              todaySeconds={myTodaySeconds}
              nowMs={nowMs}
              onPause={pause}
              onResume={resume}
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

          {loadError ? <p className="preview-study-inline-warning">실시간 새로고침이 일시적으로 중단되었습니다. 마지막으로 불러온 기록을 표시합니다.</p> : null}
          <ActiveClassmates students={snapshot.students} meKey={meKey} nowMs={nowMs} />
          <TodayStudyList students={snapshot.students} meKey={meKey} nowMs={nowMs} />
        </div>
      ) : null}
    </section>
  )
}
