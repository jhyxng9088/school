import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './motion.css'

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

function SectionTitle({ children, aside }) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {aside ? <span>{aside}</span> : null}
    </div>
  )
}

function CurrentClassPreview() {
  return (
    <section className="current-class-card">
      <div className="current-class-icon"><Icon type="clock" size={20} /></div>
      <div className="current-class-copy">
        <p className="current-class-label">현재 수업</p>
        <h2>시간표 설정 전</h2>
        <p>시간표를 설정하면 지금 수업과 다음 수업이 여기에 표시돼.</p>
      </div>
      <div className="next-class-row">
        <span>다음 수업</span>
        <strong>—</strong>
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

function TimetablePreview() {
  return (
    <section className="home-section">
      <SectionTitle>오늘 시간표</SectionTitle>
      <div className="period-strip" aria-label="오늘 시간표 미리보기">
        {Array.from({ length: 7 }, (_, index) => (
          <div className="period-item" key={index + 1}>
            <span>{index + 1}</span>
            <strong>—</strong>
          </div>
        ))}
      </div>
      <p className="section-note">Stage 2에서 기본 시간표를 연결할게.</p>
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

function Home({ name }) {
  const today = useMemo(() => new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()), [])

  return (
    <>
      <header className="home-topbar">
        <div>
          <p className="date-label">{today}</p>
          <h1>오늘</h1>
        </div>
        <span className="user-name">{name}</span>
      </header>

      <div className="home-stack">
        <CurrentClassPreview />
        <TodoPreview />
        <TimetablePreview />
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

      const stiffness = 42
      const damping = 9.2
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
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  const content = {
    home: <Home name={name} />,
    todo: <StandardPage title="투두"><EmptyPanel title="아직 비어 있어" description="Stage 4에서 할 일과 수행평가를 연결할게." /></StandardPage>,
    timetable: <StandardPage title="시간표"><EmptyPanel title="시간표 설정 전" description="Stage 2에서 기본 시간표와 날짜별 변경 기능을 만들게." /></StandardPage>,
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
