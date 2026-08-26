import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './timetable.css'
import './motion.css'
import './stage3.css'
import './todo.css'
import {
  PERIODS,
  WEEKDAYS,
  dateFromKey,
  dateKey,
  getDayForDate,
  getPeriodVisualState,
  getPeriodsForDay,
  getScheduleForDate,
  getSchoolState,
  getWeekDates,
  pruneExpiredOverrides,
  timeToMinutes,
} from './timetable'
import {
  MealPage as Stage3MealPage,
  MealPreview as Stage3MealPreview,
  useSchoolData,
} from './stage3'
import { TodoHomePreview, TodoPage, useTodos } from './todo'
import { prepareClientDataGeneration, readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'
import { SharedAcademicPage, SharedAcademicPreview } from './academic-shared'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import { OfflineToast, useNetworkGuard } from './network-guard'
import { activityKey, activityLabel, recordClassActivities, useClassActivity, useSharedAcademic } from './class-activity'

const INSTALL_DONE_KEY = 'school.installGuideDone'
const USER_NAME_KEY = 'school.userName'
const MOBILE_BROWSER_COMPAT = /iPhone|iPod|Android|SamsungBrowser/i.test(navigator.userAgent)
const SAMSUNG_BROWSER = /SamsungBrowser/i.test(navigator.userAgent)
if (MOBILE_BROWSER_COMPAT) document.documentElement.classList.add('school-mobile-compat')
if (SAMSUNG_BROWSER) document.documentElement.classList.add('school-samsung')


if (!window.__schoolPinchZoomBlocked) {
  window.__schoolPinchZoomBlocked = true
  const preventGestureZoom = (event) => event.preventDefault()
  const preventMultiTouchZoom = (event) => {
    if (event.touches?.length > 1) event.preventDefault()
  }
  document.addEventListener('gesturestart', preventGestureZoom, { passive: false })
  document.addEventListener('gesturechange', preventGestureZoom, { passive: false })
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function getBrowser() {
  const ua = navigator.userAgent
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua)) return 'safari'
  return 'other'
}

function nativeDateDisplay(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${month}/${day}/${String(year).slice(-2)}`
}

function Icon({ type, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  if (type === 'home') {
    return <svg {...common}><path d="M3.5 10.7 12 3.8l8.5 6.9"/><path d="M5.5 9.8v10h13v-10"/><path d="M9.2 19.8v-6.2h5.6v6.2"/></svg>
  }
  if (type === 'todo') {
    return <svg {...common}><path d="M8.5 6.5h11"/><path d="M8.5 12h11"/><path d="M8.5 17.5h11"/><path d="m3.8 6.4 1.2 1.2 2-2.2"/><path d="m3.8 11.9 1.2 1.2 2-2.2"/><path d="m3.8 17.4 1.2 1.2 2-2.2"/></svg>
  }
  if (type === 'timetable') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="M8 12.5h.01"/><path d="M12 12.5h.01"/><path d="M16 12.5h.01"/><path d="M8 16.5h.01"/><path d="M12 16.5h.01"/></svg>
  }
  if (type === 'meal') {
    return <svg {...common}><path d="M4.5 4.5v6.2a3 3 0 0 0 3 3h.5"/><path d="M7.5 4.5v15"/><path d="M15.5 4.5v6.2"/><path d="M19.5 4.5v6.2"/><path d="M15.5 8.2h4"/><path d="M17.5 10.7v8.8"/></svg>
  }
  if (type === 'academic') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="M8 13h3"/><path d="M8 16.5h8"/><path d="M15 12.5h1.5v1.5H15z"/></svg>
  }
  if (type === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></svg>
  }
  return null
}

function InstallGuide({ onDone }) {
  const browser = getBrowser()

  const guide = browser === 'safari'
    ? {
        title: 'Safari에서 홈 화면에 추가해줘',
        steps: [
          '더 보기(…)에서 ‘공유’를 눌러.',
          '‘홈 화면에 추가’를 선택해.',
          '‘웹 앱으로 열기’를 켜고 ‘추가’를 눌러.',
        ],
      }
    : browser === 'samsung'
      ? {
          title: 'Samsung Internet에서 설치해줘',
          steps: [
            '주소창의 + 또는 설치 아이콘을 눌러.',
            '없으면 메뉴에서 ‘홈 화면에 추가’를 선택해.',
            '추가가 끝나면 아래 버튼을 눌러.',
          ],
        }
      : {
          title: '먼저 홈 화면에 추가해줘',
          steps: [
            '브라우저 메뉴를 열어.',
            '‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해.',
            '설치가 끝나면 아래 버튼을 눌러.',
          ],
        }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="app-mark" aria-hidden="true">S</div>
        <p className="eyebrow">School</p>
        <h1>{guide.title}</h1>
        <ol className="install-steps">
          {guide.steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <button className="primary-button" onClick={onDone}>홈 화면에 추가했어</button>
      </section>
    </main>
  )
}

function StudentSetup({ initialName = '', onSave }) {
  const [classNumber, setClassNumber] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  const classValue = Number(classNumber)
  const studentValue = Number(studentNumber)
  const validClass = Number.isInteger(classValue) && classValue >= 1 && classValue <= 30
  const validStudent = Number.isInteger(studentValue) && studentValue >= 1 && studentValue <= 60
  const canSubmit = Boolean(trimmed && validClass && validStudent)

  function submit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onSave({
      name: trimmed,
      classNumber: classValue,
      studentNumber: studentValue,
    })
  }

  return (
    <main className="onboarding-page">
      <form className="onboarding-card name-card" onSubmit={submit}>
        <p className="eyebrow">마지막 설정</p>
        <h1>반, 번호, 이름 알려줘</h1>
        <p className="onboarding-copy">같은 반끼리 시간표·리마인더·학사일정을 공유해. 리마인더 완료와 삭제는 같은 학생의 기기끼리만 동기화돼.</p>
        <label className="name-field">
          <span>반</span>
          <input
            value={classNumber}
            onChange={(event) => setClassNumber(event.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="예: 7"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
          />
        </label>
        <label className="name-field">
          <span>번호</span>
          <input
            value={studentNumber}
            onChange={(event) => setStudentNumber(event.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="예: 18"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <label className="name-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름 입력"
            autoComplete="name"
            maxLength={20}
          />
        </label>
        <button className="primary-button" disabled={!canSubmit}>시작하기</button>
      </form>
    </main>
  )
}

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'todo', label: '투두' },
  { id: 'timetable', label: '시간표' },
  { id: 'meal', label: '급식' },
  { id: 'academic', label: '학사일정' },
]

function useNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    const syncNow = () => {
      if (!document.hidden) setNow(new Date())
    }

    document.addEventListener('visibilitychange', syncNow)
    window.addEventListener('focus', syncNow)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', syncNow)
      window.removeEventListener('focus', syncNow)
    }
  }, [])

  return now
}

function subjectName(period) {
  return period?.subject?.trim() || '과목 미설정'
}

function minutesUntil(now, targetTime) {
  if (!targetTime) return null
  const [hour, minute] = targetTime.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60000))
}

function remainingLabel(now, targetTime) {
  const minutes = minutesUntil(now, targetTime)
  if (minutes === null) return ''
  return minutes <= 0 ? '곧' : `${minutes}분 남음`
}

function SectionTitle({ children, aside }) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {aside ? <span>{aside}</span> : null}
    </div>
  )
}

function CurrentClassPreview({ schoolState, now }) {
  let label = '현재 수업'
  let title = '시간표 설정 전'
  let description = '시간표를 설정하면 지금 수업과 다음 수업이 여기에 표시돼.'
  let nextLabel = '다음 수업'
  let nextValue = '—'

  if (schoolState.kind === 'off') {
    label = '오늘'
    title = '수업 없는 날'
    description = '오늘은 정규 수업이 없어.'
  } else if (schoolState.kind === 'before') {
    label = '수업 전'
    title = subjectName(schoolState.next)
    description = `${schoolState.next.number}교시 · ${schoolState.next.start} 시작 · ${remainingLabel(now, schoolState.next.start)}`
    nextLabel = '첫 수업'
    nextValue = `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
  } else if (schoolState.kind === 'class') {
    label = `${schoolState.current.number}교시 · 진행 중`
    title = subjectName(schoolState.current)
    description = `${schoolState.current.start}–${schoolState.current.end} · ${remainingLabel(now, schoolState.current.end)}`
    nextValue = schoolState.next
      ? `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
      : '오늘 마지막 수업'
  } else if (schoolState.kind === 'break') {
    label = '쉬는 시간'
    title = schoolState.next ? `다음 · ${subjectName(schoolState.next)}` : '수업 종료'
    description = schoolState.next
      ? `${schoolState.next.number}교시 · ${schoolState.next.start} 시작 · ${remainingLabel(now, schoolState.next.start)}`
      : '오늘 수업이 모두 끝났어.'
    nextValue = schoolState.next
      ? `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
      : '—'
  } else if (schoolState.kind === 'lunch') {
    label = '점심시간'
    title = '점심시간'
    description = `14:00까지 · ${remainingLabel(now, '14:00')}`
    nextValue = schoolState.next
      ? `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
      : '—'
  } else if (schoolState.kind === 'done') {
    label = '수업 종료'
    title = '오늘 수업 끝'
    description = schoolState.last
      ? `${schoolState.last.number}교시 · ${subjectName(schoolState.last)}까지 완료`
      : '오늘 수업이 모두 끝났어.'
    nextLabel = '마지막 수업'
    nextValue = schoolState.last ? subjectName(schoolState.last) : '—'
  }

  return (
    <section className="current-class-card">
      <div className="current-class-icon"><Icon type="clock" size={20} /></div>
      <div className="current-class-copy">
        <p className="current-class-label">{label}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="next-class-row">
        <span>{nextLabel}</span>
        <strong>{nextValue}</strong>
      </div>
    </section>
  )
}

function TimetablePreview({ schedule, now, configured, title = '오늘 시간표', futureDay = false }) {
  if (!schedule.length) {
    return (
      <section className="home-section">
        <SectionTitle>{title}</SectionTitle>
        <div className="today-timetable-empty">{futureDay ? '내일은 정규 수업이 없어.' : '오늘은 정규 수업이 없어.'}</div>
      </section>
    )
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nextPeriod = futureDay
    ? schedule[0] || null
    : schedule.find((period) => timeToMinutes(period.start) > nowMinutes) || null

  return (
    <section className="home-section">
      <SectionTitle>{title}</SectionTitle>
      <div
        className="period-strip"
        aria-label={`${title} 미리보기`}
        style={{ '--period-count': schedule.length }}
      >
        {schedule.map((period) => {
          const visualState = futureDay ? 'future' : getPeriodVisualState(now, period)
          const isNext = visualState !== 'current' && nextPeriod?.number === period.number
          return (
            <div
              className={`period-item is-${visualState} ${isNext ? 'is-next' : ''} ${period.isOverride ? 'is-override' : ''}`}
              key={period.number}
            >
              <span>{period.number}</span>
              <strong>{period.subject.trim() || '—'}</strong>
            </div>
          )
        })}
      </div>
      {!configured ? <p className="section-note">시간표 탭에서 기본 시간표를 입력해줘.</p> : null}
    </section>
  )
}

function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData }) {
  const today = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now)
  const schoolState = getSchoolState(now, weeklySchedule, overrides)
  const showTomorrowTimetable = schoolState.kind === 'done'
  const timetablePreviewDate = showTomorrowTimetable
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0)
    : now
  const timetablePreviewSchedule = showTomorrowTimetable
    ? getScheduleForDate(timetablePreviewDate, weeklySchedule, overrides)
    : schoolState.schedule

  return (
    <>
      <header className="home-topbar">
        <div>
          <p className="date-label">{today}</p>
          <div className="home-title-row">
            <h1>홈</h1>
            <span
              className="class-presence-count"
              aria-label={`현재 접속 ${presence.online}명, 반 인원 ${presence.total}명`}
            >
              {presence.online}/{presence.total}
            </span>
          </div>
        </div>
        <span className="user-name">{name}</span>
      </header>

      <div className="home-stack">
        <CurrentClassPreview schoolState={schoolState} now={now} />
        <TodoHomePreview todos={todoData.todos} now={now} />
        <TimetablePreview
          schedule={timetablePreviewSchedule}
          now={now}
          configured={schoolState.configured}
          title={showTomorrowTimetable ? '내일 시간표' : '오늘 시간표'}
          futureDay={showTomorrowTimetable}
        />
        <SharedAcademicPreview now={now} schoolData={schoolData} academicData={academicData} />
        <Stage3MealPreview now={now} schoolData={schoolData} />
      </div>
    </>
  )
}

function cloneWeeklySchedule(schedule) {
  return JSON.parse(JSON.stringify(schedule))
}

function formatWeekRange(weekDates) {
  const first = weekDates[0]
  const last = weekDates[weekDates.length - 1]
  if (first.getMonth() === last.getMonth()) {
    return `${first.getMonth() + 1}월 ${first.getDate()}–${last.getDate()}일`
  }
  return `${first.getMonth() + 1}월 ${first.getDate()}일–${last.getMonth() + 1}월 ${last.getDate()}일`
}

function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides, activity, profile, requireOnline = () => true }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => cloneWeeklySchedule(weeklySchedule))
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeDate, setChangeDate] = useState(() => dateKey(now))
  const [changePeriod, setChangePeriod] = useState(1)
  const [changeSubject, setChangeSubject] = useState('')

  const weekDates = useMemo(() => getWeekDates(now), [dateKey(now)])
  const currentState = getSchoolState(now, weeklySchedule, overrides)
  const todayKey = dateKey(now)
  const selectedDate = dateFromKey(changeDate)
  const selectedDay = getDayForDate(selectedDate)
  const selectedDateIsPast = Boolean(changeDate && changeDate < todayKey)
  const selectedDateIsToday = changeDate === todayKey
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const availablePeriods = selectedDay && !selectedDateIsPast
    ? getPeriodsForDay(selectedDay.id).filter((period) => !selectedDateIsToday || timeToMinutes(period.end) > nowMinutes)
    : []
  const availablePeriodSignature = availablePeriods.map((period) => period.number).join(',')
  const selectedPeriodIsAvailable = availablePeriods.some((period) => period.number === changePeriod)
  const baseSubject = selectedDay ? weeklySchedule?.[selectedDay.id]?.[changePeriod] || '' : ''

  useEffect(() => {
    if (!selectedPeriodIsAvailable) {
      setChangePeriod(availablePeriods[0]?.number || 1)
    }
  }, [changeDate, availablePeriodSignature])

  useEffect(() => {
    setChangeSubject('')
  }, [changePeriod])

  const weekChanges = weekDates.flatMap((date, dayIndex) =>
    getScheduleForDate(date, weeklySchedule, overrides)
      .filter((period) => period.isOverride)
      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        ...period,
        activity: activity?.[activityKey('timetable', `${dateKey(date)}-${period.number}`)] || null,
      })),
  ).sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.number - b.number)

  function startEditing() {
    if (!requireOnline('시간표를 수정')) return
    setDraft(cloneWeeklySchedule(weeklySchedule))
    setChangeOpen(false)
    setEditing(true)
  }

  function updateDraft(dayId, period, value) {
    setDraft((current) => ({
      ...current,
      [dayId]: {
        ...current[dayId],
        [period]: value.slice(0, 20),
      },
    }))
  }

  async function saveBaseSchedule() {
    if (!requireOnline('시간표를 수정')) return
    const changedCells = WEEKDAYS.flatMap((day) =>
      PERIODS
        .filter((period) => period.number <= day.regularPeriodCount)
        .filter((period) => String(weeklySchedule?.[day.id]?.[period.number] || '').trim() !== String(draft?.[day.id]?.[period.number] || '').trim())
        .map((period) => ({ dayId: day.id, period: period.number })),
    )

    if (!changedCells.length) {
      setEditing(false)
      return
    }

    const saved = await onSaveWeekly(draft)
    if (!saved) return
    recordClassActivities(profile, [
      { entityType: 'timetable', entityId: 'weekly', action: 'edited' },
      ...changedCells.map(({ dayId, period }) => ({
        entityType: 'timetable',
        entityId: 'base-' + dayId + '-' + period,
        action: 'edited',
      })),
    ]).catch((error) => console.error('Timetable attribution save failed:', error))
    setEditing(false)
  }

  async function saveChange() {
    if (!selectedDay || !selectedPeriodIsAvailable) return
    if (!requireOnline('시간표를 수정')) return
    const subject = changeSubject.trim()
    if (!subject) return
    const activityAction = overrides?.[changeDate]?.[changePeriod] ? 'edited' : 'added'

    const next = { ...overrides }
    const dateOverrides = { ...(next[changeDate] || {}) }

    if (subject === baseSubject.trim()) {
      delete dateOverrides[changePeriod]
    } else {
      dateOverrides[changePeriod] = subject
    }

    if (Object.keys(dateOverrides).length) next[changeDate] = dateOverrides
    else delete next[changeDate]

    const saved = await onSaveOverrides(next)
    if (!saved) return
    recordClassActivities(profile, [{
      entityType: 'timetable',
      entityId: `${changeDate}-${changePeriod}`,
      action: activityAction,
    }]).catch((error) => console.error('Timetable change attribution save failed:', error))
    setChangeSubject('')
    setChangeOpen(false)
  }

  async function removeChange(targetDate, period) {
    if (!requireOnline('시간표를 수정')) return
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]
    await onSaveOverrides(next)
  }

  async function clearAllChanges() {
    if (!Object.keys(overrides || {}).length) return
    if (!requireOnline('시간표를 수정')) return
    await onSaveOverrides({})
  }

  return (
    <section className="timetable-page">
      <header className="timetable-header">
        <div>
          <p className="date-label">{editing ? '기본 시간표' : '이번 주'}</p>
          <h1>시간표</h1>
        </div>
        {!editing ? (
          <div className="timetable-actions">
            <button className="timetable-action" onClick={startEditing}>기본 수정</button>
            <button
              className="timetable-action primary"
              onClick={() => {
                if (!requireOnline('시간표를 수정')) return
                const initialDate = currentState.kind === 'done'
                  ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0)
                  : now
                setChangeDate(dateKey(initialDate))
                setChangeSubject('')
                setChangeOpen(true)
              }}
            >
              변경 추가
            </button>
          </div>
        ) : null}
      </header>

      <div className="week-summary">
        <strong>{editing ? '월–금 기본 시간표' : formatWeekRange(weekDates)}</strong>
        <div className="week-legend">
          {!editing ? <span className="legend-item"><i className="legend-dot" />변경</span> : null}
          {!editing ? <span className="legend-item"><i className="legend-ring" />현재</span> : null}
          {!editing && activity?.[activityKey('timetable', 'weekly')] ? (
            <span className="activity-attribution timetable-attribution">{activityLabel(activity[activityKey('timetable', 'weekly')])}</span>
          ) : null}
          {editing ? <span>7교시는 수·금만</span> : null}
        </div>
      </div>

      <div className="week-table-wrap">
        <div className="week-grid">
          <div className="week-corner">교시</div>
          {weekDates.map((date, index) => (
            <div
              className={`week-day-head ${dateKey(date) === todayKey && !editing ? 'today' : ''}`}
              key={WEEKDAYS[index].id}
            >
              <strong>{WEEKDAYS[index].label}</strong>
              <span>{date.getMonth() + 1}/{date.getDate()}</span>
            </div>
          ))}

          {PERIODS.map((period) => (
            <React.Fragment key={period.number}>
              <div className="week-period-label">
                <strong>{period.number}</strong>
                <span>{period.start}</span>
              </div>

              {WEEKDAYS.map((day, dayIndex) => {
                const date = weekDates[dayIndex]
                const daySchedule = getScheduleForDate(date, weeklySchedule, overrides)
                const item = daySchedule.find((entry) => entry.number === period.number)
                const outsideBaseSchedule = period.number > day.regularPeriodCount

                if (editing) {
                  if (outsideBaseSchedule) {
                    return <div className="week-cell not-applicable" key={`${day.id}-${period.number}`}>—</div>
                  }
                  return (
                    <div className="week-cell editor-cell" key={`${day.id}-${period.number}`}>
                      <input
                        aria-label={`${day.label}요일 ${period.number}교시`}
                        value={draft?.[day.id]?.[period.number] || ''}
                        onChange={(event) => updateDraft(day.id, period.number, event.target.value)}
                        placeholder="—"
                        maxLength={20}
                        autoComplete="off"
                      />
                    </div>
                  )
                }

                if (outsideBaseSchedule && !item?.isOverride) {
                  return <div className="week-cell not-applicable" key={`${day.id}-${period.number}`}>—</div>
                }
                const cellActivity = item?.isOverride
                  ? activity?.[activityKey('timetable', dateKey(date) + '-' + period.number)] || null
                  : activity?.[activityKey('timetable', 'base-' + day.id + '-' + period.number)] || null
                const isToday = dateKey(date) === todayKey
                const visualState = isToday ? getPeriodVisualState(now, period) : null
                const isCurrent = visualState === 'current'
                const isPast = visualState === 'past'
                const isNext = isToday && !isCurrent && currentState.next?.number === period.number
                const classes = [
                  'week-cell',
                  item?.subject?.trim() ? '' : 'empty',
                  item?.isOverride ? 'is-override' : '',
                  isPast ? 'is-past' : '',
                  isCurrent ? 'is-current' : '',
                  isNext ? 'is-next' : '',
                ].filter(Boolean).join(' ')

                return (
                  <div className={classes} key={`${day.id}-${period.number}`}>
                    {item?.isOverride ? <span className="change-dot" aria-label="변경 시간표" /> : null}
                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {editing ? (
        <div className="editor-actions">
          <button className="editor-button" onClick={() => setEditing(false)}>취소</button>
          <button className="editor-button save" onClick={saveBaseSchedule}>저장</button>
        </div>
      ) : null}

      <UnifiedBottomSheet
        open={changeOpen && !editing}
        onClose={() => setChangeOpen(false)}
        title="변경 시간표 추가"
        subtitle="기본 시간표는 그대로 두고 선택한 날짜에만 적용돼."
        ariaLabel="변경 시간표 추가"
        className="timetable-unified-sheet"
      >
        <div className="timetable-sheet-form">
          <div className="timetable-sheet-primary-grid">
            <label className="change-field timetable-date-field">
              <span>날짜</span>
              <span className="timetable-control-shell timetable-date-shell">
                <span className="timetable-native-date-value" aria-hidden="true">{nativeDateDisplay(changeDate)}</span>
                <input
                  type="date"
                  value={changeDate}
                  min={todayKey}
                  onChange={(event) => {
                    setChangeDate(event.target.value)
                    setChangeSubject('')
                  }}
                />
              </span>
            </label>
            <label className="change-field timetable-period-field">
              <span>교시</span>
              <span className="timetable-control-shell timetable-period-shell">
                <select
                  value={selectedPeriodIsAvailable ? changePeriod : ''}
                  onChange={(event) => setChangePeriod(Number(event.target.value))}
                  disabled={!selectedDay || !availablePeriods.length}
                >
                  {availablePeriods.map((period) => (
                    <option value={period.number} key={period.number}>{period.number}교시</option>
                  ))}
                </select>
              </span>
            </label>
          </div>
          <label className="change-field">
            <span>변경 과목</span>
            <input
              value={changeSubject}
              onChange={(event) => setChangeSubject(event.target.value)}
              placeholder="변경된 과목 입력"
              maxLength={20}
              disabled={!selectedDay || !availablePeriods.length}
            />
          </label>
          {!selectedDay ? (
            <p className="change-warning">토·일요일에는 정규 시간표를 변경할 수 없어.</p>
          ) : selectedDateIsPast ? (
            <p className="change-warning">지난 날짜의 시간표는 변경할 수 없어.</p>
          ) : !availablePeriods.length ? (
            <p className="change-warning">오늘 이미 끝난 교시는 변경할 수 없어.</p>
          ) : (
            <p className="change-base">기본: {baseSubject.trim() || '미설정'}</p>
          )}
          <div className="timetable-sheet-actions">
            <button type="button" onClick={() => setChangeOpen(false)}>취소</button>
            <button
              type="button"
              className="save-change"
              onClick={saveChange}
              disabled={!selectedDay || !selectedPeriodIsAvailable || !changeSubject.trim()}
            >
              변경 저장
            </button>
          </div>
        </div>
      </UnifiedBottomSheet>

      {!editing && weekChanges.length ? (
        <section className="week-changes">
          <div className="week-changes-head">
            <h2>이번 주 변경</h2>
            <button className="clear-changes" onClick={clearAllChanges}>변경 모두 지우기</button>
          </div>
          <div className="change-list">
            {weekChanges.map((change) => (
              <div className="change-item" key={`${dateKey(change.date)}-${change.number}`}>
                <div className="change-item-main">
                  <strong>{change.date.getMonth() + 1}/{change.date.getDate()} {change.dayLabel} · {change.number}교시</strong>
                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                  {change.activity ? <small className="activity-attribution">{activityLabel(change.activity)}</small> : null}
                </div>
                <button className="remove-change" onClick={() => removeChange(change.date, change.number)}>되돌리기</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

function stopInlineIndicatorStyles(indicator) {
  indicator.style.width = ''
  indicator.style.transform = ''
  indicator.style.borderRadius = ''
  indicator.style.transition = ''
  indicator.style.removeProperty('will-change')
}

function useNavSpring(activeIndex) {
  const navRef = useRef(null)
  const indicatorRef = useRef(null)
  const buttonRefs = useRef([])
  const physicsRef = useRef({
    x: 0,
    velocity: 0,
    targetX: 0,
    baseWidth: 0,
    initialized: false,
    frame: null,
    lastTime: 0,
  })

  useLayoutEffect(() => {
    const nav = navRef.current
    const indicator = indicatorRef.current
    const targetButton = buttonRefs.current[activeIndex]
    if (!nav || !indicator || !targetButton) return undefined

    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const compatibilityMotion = MOBILE_BROWSER_COMPAT
    const compatibilityTransition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), width 420ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 420ms cubic-bezier(0.16, 1, 0.3, 1)'

    if (compatibilityMotion) {
      stopInlineIndicatorStyles(indicator)
      return undefined
    }

    function paint() {
      const speed = Math.abs(physics.velocity)
      const stretch = Math.min(speed * 0.032, 18)
      const movingRight = physics.velocity > 0
      const movingLeft = physics.velocity < 0
      const visualX = movingLeft ? physics.x - stretch : physics.x
      const visualWidth = physics.baseWidth + stretch
      const compression = Math.min(speed / 18000, 0.028)

      indicator.style.width = `${visualWidth}px`
      indicator.style.transform = `translate3d(${visualX}px, 0, 0) scaleY(${1 - compression})`
      indicator.style.borderRadius = `${Math.max(16, 20 - stretch * 0.08)}px`
      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'
    }

    function measure(immediate = false) {
      const navRect = nav.getBoundingClientRect()
      const buttonRect = targetButton.getBoundingClientRect()
      physics.targetX = buttonRect.left - navRect.left
      physics.baseWidth = buttonRect.width

      if (!physics.initialized || immediate || reduceMotion) {
        physics.initialized = true
        physics.x = physics.targetX
        physics.velocity = 0
        paint()
      }
    }

    function stopAnimation() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, 0.032)
      physics.lastTime = time

      const stiffness = 50
      const damping = 10
      const mass = 1
      const displacement = physics.x - physics.targetX
      const springForce = -stiffness * displacement
      const dampingForce = -damping * physics.velocity
      const acceleration = (springForce + dampingForce) / mass

      physics.velocity += acceleration * dt
      physics.x += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.x - physics.targetX) < 0.06 && Math.abs(physics.velocity) < 0.06
      if (settled) {
        physics.x = physics.targetX
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        paint()
        return
      }

      physics.frame = requestAnimationFrame(animate)
    }

    stopAnimation()
    const wasInitialized = physics.initialized
    measure(!physics.initialized)

    if (!reduceMotion && Math.abs(physics.x - physics.targetX) > 0.01) {
      physics.lastTime = 0
      physics.frame = requestAnimationFrame(animate)
    }

    const handleViewportChange = () => {
      stopAnimation()
      physics.lastTime = 0
      measure(true)
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
    }
  }, [activeIndex])

  return { navRef, indicatorRef, buttonRefs }
}

function AppShell({ profile }) {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
  const { toast, requireOnline } = useNetworkGuard()
  const now = useNow()
  const {
    weeklySchedule,
    overrides,
    commitWeeklySchedule,
    commitOverrides,
  } = useSharedTimetable(profile, now)
  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const presence = useClassPresence(profile)
  const academicData = useSharedAcademic(profile)
  const activity = useClassActivity(profile)
  const name = profile.name
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  useEffect(() => {
    if (navigator.onLine === false) return
    const pruned = pruneExpiredOverrides(overrides, now)
    if (JSON.stringify(pruned) === JSON.stringify(overrides)) return
    commitOverrides(pruned)
  }, [now, overrides, commitOverrides])

  const content = {
    home: (
      <Home
        name={name}
        now={now}
        weeklySchedule={weeklySchedule}
        overrides={overrides}
        schoolData={schoolData}
        todoData={todoData}
        presence={presence}
        academicData={academicData}
      />
    ),
    todo: <TodoPage now={now} todoData={todoData} requireOnline={requireOnline} />,
    timetable: (
      <TimetablePage
        now={now}
        weeklySchedule={weeklySchedule}
        overrides={overrides}
        onSaveWeekly={commitWeeklySchedule}
        onSaveOverrides={commitOverrides}
        activity={activity}
        profile={profile}
        requireOnline={requireOnline}
      />
    ),
    meal: <Stage3MealPage schoolData={schoolData} />,
    academic: <SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} requireOnline={requireOnline} />,
  }

  function changeTab(nextTab) {
    if (nextTab === activeTab) return
    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)
    setContentDirection(nextIndex > activeIndex ? 1 : -1)
    setActiveTab(nextTab)
  }

  return (
    <div className="app-shell">
      <main
        className={`app-content tab-${activeTab}`}
        key={activeTab}
        style={{ '--content-enter-x': `${contentDirection * 16}px` }}
      >
        {content[activeTab]}
      </main>
      <nav ref={navRef} className="bottom-nav" style={{ '--indicator-x': `${activeIndex * 100}%` }} aria-label="주요 메뉴">
        <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />
        {tabs.map((tab, index) => (
          <button
            ref={(node) => { buttonRefs.current[index] = node }}
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => changeTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <Icon type={tab.id} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      <OfflineToast toast={toast} />
    </div>
  )
}

function App() {
  const [profile, setProfile] = useState(() => {
    prepareClientDataGeneration()
    return readStudentProfile()
  })
  const [installDone, setInstallDone] = useState(() => localStorage.getItem(INSTALL_DONE_KEY) === 'true')
  const standalone = isStandalone()
  const legacyName = localStorage.getItem(USER_NAME_KEY) || ''

  function completeInstallGuide() {
    localStorage.setItem(INSTALL_DONE_KEY, 'true')
    setInstallDone(true)
  }

  function saveProfile(nextProfile) {
    const saved = saveStudentProfile(nextProfile)
    if (!saved) return
    localStorage.setItem(USER_NAME_KEY, saved.name)
    setProfile(saved)
  }

  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />
  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />
  return <AppShell profile={profile} />
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      updateViaCache: 'none',
    }).then((registration) => {
      window.setTimeout(() => {
        registration.update().catch(() => {})
      }, 5000)
    }).catch(() => {
      // The app still works online even if service worker registration fails.
    })
  })
}
