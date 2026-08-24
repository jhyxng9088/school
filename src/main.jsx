import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

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

function Icon({ type }) {
  const common = {
    width: 22,
    height: 22,
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
  return <svg {...common}><path d="M4.5 4.5v6.2a3 3 0 0 0 3 3h.5"/><path d="M7.5 4.5v15"/><path d="M15.5 4.5v6.2"/><path d="M19.5 4.5v6.2"/><path d="M15.5 8.2h4"/><path d="M17.5 10.7v8.8"/></svg>
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

function EmptyPanel({ title, description }) {
  return (
    <section className="empty-panel">
      <h2>{title}</h2>
      <p>{description}</p>
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
      <header className="page-header home-header">
        <p className="date-label">{today}</p>
        <h1>{name}</h1>
      </header>
      <div className="home-grid">
        <EmptyPanel title="오늘 시간표" description="아직 시간표를 설정하지 않았어." />
        <EmptyPanel title="할 일" description="아직 등록된 할 일이 없어." />
        <EmptyPanel title="오늘 급식" description="급식 정보는 아직 연결되지 않았어." />
      </div>
    </>
  )
}

function AppShell({ name }) {
  const [activeTab, setActiveTab] = useState('home')

  const content = {
    home: <Home name={name} />,
    todo: <><header className="page-header"><p className="date-label">School</p><h1>투두</h1></header><EmptyPanel title="아직 비어 있어" description="등록된 할 일이 없어." /></>,
    timetable: <><header className="page-header"><p className="date-label">School</p><h1>시간표</h1></header><EmptyPanel title="시간표 설정 전" description="기본 시간표가 아직 없어." /></>,
    meal: <><header className="page-header"><p className="date-label">School</p><h1>급식</h1></header><EmptyPanel title="급식 연결 전" description="오늘 급식 정보가 아직 없어." /></>,
  }

  return (
    <div className="app-shell">
      <main className="app-content">{content[activeTab]}</main>
      <nav className="bottom-nav" aria-label="주요 메뉴">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
