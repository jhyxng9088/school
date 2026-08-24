import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './timetable.css'
import './motion.css'
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
  loadOverrides,
  loadWeeklySchedule,
  saveOverrides,
  saveWeeklySchedule,
} from './timetable'

const INSTALL_DONE_KEY = 'school.installGuideDone'
const USER_NAME_KEY = 'school.userName'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function getBrowser() {
  const ua = navigator.userAgent
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua)) return 'safari'
  return 'other'
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
          'Safari의 더 보기(…)에서 ‘공유’를 눌러. 공유 버튼이 바로 보이면 그걸 눌러도 돼.',
          '목록에서 ‘홈 화면에 추가’를 선택해.',
          '‘웹 앱으로 열기’를 켠 뒤 ‘추가’를 눌러.',
        ],
      }
    : browser === 'samsung'
      ? {
          title: 'Samsung Internet에서 설치해줘',
          steps: [
            '주소창에 + 또는 설치 아이콘이 보이면 눌러.',
            '아이콘이 없다면 브라우저 메뉴에서 ‘홈 화면에 추가’를 선택해.',
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
        <p className="onboarding-copy">홈 화면에 추가해서 일반 앱처럼 쓰는 걸 기준으로 만들었어.</p>
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

function NameSetup({ onSave }) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  function submit(event) {
    event.preventDefault()
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <main className="onboarding-page">
      <form className="onboarding-card name-card" onSubmit={submit}>
        <p className="eyebrow">마지막 설정</p>
        <h1>이름이 뭐야?</h1>
        <p className="onboarding-copy">우리 반에서 누가 쓰는 앱인지 구분할 때 사용할 이름이야.</p>
        <label className="name-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름 입력"
            autoComplete="name"
            autoFocus
            maxLength={20}
          />
        </label>
        <button className="primary-button" disabled={!trimmed}>시작하기</button>
      </form>
    </main>
  )
}

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'todo', label: '투두' },
  { id: 'timetable', label: '시간표' },
  { id: 'meal', label: '급식' },
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

function SectionTitle({ children, aside }) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {aside ? <span>{aside}</span> : null}
    </div>
  )
}

function CurrentClassPreview({ schoolState }) {
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
    description = `${schoolState.next.number}교시 · ${schoolState.next.start} 시작`
    nextLabel = '첫 수업'
    nextValue = `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
  } else if (schoolState.kind === 'class') {
    label = `${schoolState.current.number}교시 · 진행 중`
    title = subjectName(schoolState.current)
    description = `${schoolState.current.start}–${schoolState.current.end}`
    nextValue = schoolState.next
      ? `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
      : '오늘 마지막 수업'
  } else if (schoolState.kind === 'break') {
    label = '쉬는 시간'
    title = schoolState.next ? `다음 · ${subjectName(schoolState.next)}` : '수업 종료'
    description = schoolState.next
      ? `${schoolState.next.number}교시 · ${schoolState.next.start} 시작`
      : '오늘 수업이 모두 끝났어.'
    nextValue = schoolState.next
      ? `${schoolState.next.number}교시 · ${subjectName(schoolState.next)}`
      : '—'
  } else if (schoolState.kind === 'lunch') {
    label = '점심시간'
    title = '점심시간'
    description = '14:00까지'
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

function TodoPreview() {
  return (
    <section className="home-section">
      <SectionTitle aside="0개">할 일</SectionTitle>
      <div className="compact-empty">아직 등록된 할 일이 없어.</div>
    </section>
  )
}

function TimetablePreview({ schedule, now, configured }) {
  if (!schedule.length) {
    return (
      <section className="home-section">
        <SectionTitle>오늘 시간표</SectionTitle>
        <div className="today-timetable-empty">오늘은 정규 수업이 없어.</div>
      </section>
    )
  }

  const hasOverride = schedule.some((period) => period.isOverride)

  return (
    <section className="home-section">
      <SectionTitle>오늘 시간표</SectionTitle>
      <div
        className="period-strip"
        aria-label="오늘 시간표 미리보기"
        style={{ '--period-count': schedule.length }}
      >
        {schedule.map((period) => {
          const visualState = getPeriodVisualState(now, period)
          return (
            <div
              className={`period-item is-${visualState} ${period.isOverride ? 'is-override' : ''}`}
              key={period.number}
            >
              <span>{period.number}</span>
              <strong>{period.subject.trim() || '—'}</strong>
            </div>
          )
        })}
      </div>
      {!configured ? <p className="section-note">시간표 탭에서 기본 시간표를 입력해줘.</p> : null}
      {configured && hasOverride ? <p className="section-note">변경된 수업은 작은 점으로 표시돼.</p> : null}
    </section>
  )
}

function MealPreview() {
  return (
    <section className="home-section meal-preview">
      <SectionTitle>오늘 급식</SectionTitle>
      <p className="meal-empty">급식 연결 전</p>
      <p className="section-note">Stage 3에서 NEIS 급식 정보를 연결할게.</p>
    </section>
  )
}

function Home({ name, now, weeklySchedule, overrides }) {
  const today = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now)
  const schoolState = getSchoolState(now, weeklySchedule, overrides)

  return (
    <>
      <header className="home-topbar">
        <div>
          <p className="date-label">{today}</p>
          <h1>홈</h1>
        </div>
        <span className="user-name">{name}</span>
      </header>

      <div className="home-stack">
        <CurrentClassPreview schoolState={schoolState} />
        <TodoPreview />
        <TimetablePreview
          schedule={schoolState.schedule}
          now={now}
          configured={schoolState.configured}
        />
        <MealPreview />
      </div>
    </>
  )
}

function EmptyPanel({ title, description }) {
  return (
    <section className="empty-panel">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

function StandardPage({ eyebrow = 'School', title, children }) {
  return (
    <>
      <header className="page-header">
        <p className="date-label">{eyebrow}</p>
        <h1>{title}</h1>
      </header>
      {children}
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

function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides }) {
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
  const availablePeriods = selectedDay ? getPeriodsForDay(selectedDay.id) : []
  const baseSubject = selectedDay ? weeklySchedule?.[selectedDay.id]?.[changePeriod] || '' : ''

  useEffect(() => {
    if (!selectedDay || changePeriod > selectedDay.periodCount) setChangePeriod(1)
    setChangeSubject('')
  }, [changeDate])

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
      })),
  )

  function startEditing() {
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

  function saveBaseSchedule() {
    onSaveWeekly(draft)
    setEditing(false)
  }

  function saveChange() {
    if (!selectedDay) return
    const subject = changeSubject.trim()
    if (!subject) return

    const next = { ...overrides }
    const dateOverrides = { ...(next[changeDate] || {}) }

    if (subject === baseSubject.trim()) {
      delete dateOverrides[changePeriod]
    } else {
      dateOverrides[changePeriod] = subject
    }

    if (Object.keys(dateOverrides).length) next[changeDate] = dateOverrides
    else delete next[changeDate]

    onSaveOverrides(next)
    setChangeSubject('')
    setChangeOpen(false)
  }

  function removeChange(targetDate, period) {
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]
    onSaveOverrides(next)
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
              onClick={() => setChangeOpen((value) => !value)}
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
                if (period.number > day.periodCount) {
                  return <div className="week-cell not-applicable" key={`${day.id}-${period.number}`}>—</div>
                }

                if (editing) {
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

                const date = weekDates[dayIndex]
                const daySchedule = getScheduleForDate(date, weeklySchedule, overrides)
                const item = daySchedule.find((entry) => entry.number === period.number)
                const isCurrent = dateKey(date) === todayKey && currentState.current?.number === period.number
                const classes = [
                  'week-cell',
                  item?.subject?.trim() ? '' : 'empty',
                  item?.isOverride ? 'is-override' : '',
                  isCurrent ? 'is-current' : '',
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

      {changeOpen && !editing ? (
        <section className="change-editor">
          <div className="change-editor-head">
            <div>
              <h2>변경 시간표 추가</h2>
              <p>기본 시간표는 그대로 두고 선택한 날짜에만 적용돼.</p>
            </div>
          </div>
          <div className="change-form">
            <label className="change-field">
              <span>날짜</span>
              <input type="date" value={changeDate} onChange={(event) => setChangeDate(event.target.value)} />
            </label>
            <label className="change-field">
              <span>교시</span>
              <select
                value={changePeriod}
                onChange={(event) => setChangePeriod(Number(event.target.value))}
                disabled={!selectedDay}
              >
                {availablePeriods.map((period) => (
                  <option value={period.number} key={period.number}>{period.number}교시</option>
                ))}
              </select>
            </label>
            <label className="change-field full">
              <span>변경 과목</span>
              <input
                value={changeSubject}
                onChange={(event) => setChangeSubject(event.target.value)}
                placeholder="변경된 과목 입력"
                maxLength={20}
                disabled={!selectedDay}
              />
            </label>
            {selectedDay ? (
              <p className="change-base">기본: {baseSubject.trim() || '미설정'}</p>
            ) : (
              <p className="change-warning">토·일요일에는 정규 시간표를 변경할 수 없어.</p>
            )}
            <div className="change-submit-row">
              <button onClick={() => setChangeOpen(false)}>취소</button>
              <button
                className="save-change"
                onClick={saveChange}
                disabled={!selectedDay || !changeSubject.trim()}
              >
                변경 저장
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!editing && weekChanges.length ? (
        <section className="week-changes">
          <h2>이번 주 변경</h2>
          <div className="change-list">
            {weekChanges.map((change) => (
              <div className="change-item" key={`${dateKey(change.date)}-${change.number}`}>
                <div className="change-item-main">
                  <strong>{change.date.getMonth() + 1}/{change.date.getDate()} {change.dayLabel} · {change.number}교시</strong>
                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
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

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
    }
  }, [activeIndex])

  return { navRef, indicatorRef, buttonRefs }
}

function AppShell({ name }) {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
  const [weeklySchedule, setWeeklySchedule] = useState(loadWeeklySchedule)
  const [overrides, setOverrides] = useState(loadOverrides)
  const now = useNow()
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  function commitWeeklySchedule(nextSchedule) {
    saveWeeklySchedule(nextSchedule)
    setWeeklySchedule(nextSchedule)
  }

  function commitOverrides(nextOverrides) {
    saveOverrides(nextOverrides)
    setOverrides(nextOverrides)
  }

  const content = {
    home: <Home name={name} now={now} weeklySchedule={weeklySchedule} overrides={overrides} />,
    todo: <StandardPage title="투두"><EmptyPanel title="아직 비어 있어" description="Stage 4에서 할 일과 수행평가를 연결할게." /></StandardPage>,
    timetable: (
      <TimetablePage
        now={now}
        weeklySchedule={weeklySchedule}
        overrides={overrides}
        onSaveWeekly={commitWeeklySchedule}
        onSaveOverrides={commitOverrides}
      />
    ),
    meal: <StandardPage title="급식"><EmptyPanel title="급식 연결 전" description="Stage 3에서 NEIS 급식 정보를 연결할게." /></StandardPage>,
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
        className="app-content"
        key={activeTab}
        style={{ '--content-enter-x': `${contentDirection * 16}px` }}
      >
        {content[activeTab]}
      </main>
      <nav ref={navRef} className="bottom-nav" aria-label="주요 메뉴">
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
    </div>
  )
}

function App() {
  const [name, setName] = useState(() => localStorage.getItem(USER_NAME_KEY) || '')
  const [installDone, setInstallDone] = useState(() => localStorage.getItem(INSTALL_DONE_KEY) === 'true')
  const standalone = isStandalone()

  function completeInstallGuide() {
    localStorage.setItem(INSTALL_DONE_KEY, 'true')
    setInstallDone(true)
  }

  function saveName(nextName) {
    localStorage.setItem(USER_NAME_KEY, nextName)
    setName(nextName)
  }

  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />
  if (!name) return <NameSetup onSave={saveName} />
  return <AppShell name={name} />
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const hadController = Boolean(navigator.serviceWorker.controller)
    let refreshing = false

    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    }

    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        updateViaCache: 'none',
      })

      await registration.update()
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    } catch {
      // The app still works online even if service worker registration fails.
    }
  })
}
