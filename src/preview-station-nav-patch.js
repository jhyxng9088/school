const STATION_NAV_CSS = `
/* Preview-only S-Hub V2 station navigation experiment. */
.bottom-nav {
  --station-slot: calc((100% - (var(--nav-padding) * 2)) / 5);
}

.bottom-nav .nav-indicator {
  transition: opacity 150ms ease;
}

.bottom-nav.is-class-expanded .nav-indicator {
  opacity: 0 !important;
}

.bottom-nav .nav-button[data-tab="class"] {
  transition: color 440ms var(--motion-soft), transform 280ms var(--motion-ease), opacity 180ms ease;
}

.bottom-nav.is-class-expanded .nav-button[data-tab="class"] {
  opacity: 0;
  pointer-events: none;
}

.class-nav-capsule {
  position: absolute;
  z-index: 4;
  top: var(--nav-padding);
  bottom: var(--nav-padding);
  left: calc(var(--nav-padding) + (var(--station-slot) * 1.5));
  width: var(--station-slot);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 4px;
  transform: translate3d(-50%, 0, 0) scaleX(.88);
  transform-origin: 50% 50%;
  overflow: hidden;
  opacity: 0;
  border: 0.5px solid var(--border);
  border-radius: 19px;
  background: var(--surface);
  box-shadow: inset 0 0 0 0.5px var(--border), 0 5px 18px rgba(0,0,0,.10);
  pointer-events: none;
  will-change: width, transform, opacity;
  transition:
    width 620ms cubic-bezier(.16, 1.18, .28, 1),
    transform 620ms cubic-bezier(.16, 1.18, .28, 1),
    opacity 150ms ease,
    border-radius 620ms cubic-bezier(.16, 1.18, .28, 1);
}

.class-nav-capsule.is-open {
  width: min(136px, calc(var(--station-slot) * 1.82));
  transform: translate3d(-50%, 0, 0) scaleX(1);
  opacity: 1;
  border-radius: 21px;
  pointer-events: auto;
}

.class-nav-mini-pill {
  position: absolute;
  z-index: 0;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / 2);
  border-radius: 16px;
  background: var(--surface-glass);
  box-shadow: inset 0 0 0 0.5px var(--border);
  pointer-events: none;
  transform: translate3d(0, 0, 0) scaleX(.96);
  transform-origin: 50% 50%;
  will-change: transform;
  transition: transform 560ms cubic-bezier(.18, 1.22, .32, 1);
}

.class-nav-mini-pill.is-board {
  transform: translate3d(100%, 0, 0) scaleX(.96);
}

.class-nav-subbutton {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: grid;
  grid-template-rows: 24px 12px;
  place-items: center;
  align-content: center;
  gap: 0;
  padding: 2px 1px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  touch-action: manipulation;
  transition: color 260ms var(--motion-soft), transform 150ms var(--motion-ease);
}

.class-nav-subbutton.is-active {
  color: var(--text);
}

.class-nav-subbutton:active {
  transform: scale(.93);
}

.class-nav-subbutton span {
  font-size: 9px;
  font-weight: 680;
  line-height: 1;
  white-space: nowrap;
}

.station-placeholder-page,
.station-ai-page {
  padding-top: 2px;
}

.station-placeholder-card,
.station-ai-card {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 28px 22px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--surface);
  text-align: center;
}

.station-placeholder-card h2,
.station-ai-card h2 {
  margin: 0;
  font-size: 19px;
  letter-spacing: -.035em;
}

.station-placeholder-card p,
.station-ai-card p {
  max-width: 310px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.station-ai-card button {
  min-height: 42px;
  margin-top: 4px;
  padding: 0 18px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--text);
  color: var(--background);
  font: inherit;
  font-size: 13px;
  font-weight: 720;
}

.station-schedule-switcher {
  width: max-content;
  max-width: 100%;
  display: flex;
  gap: 4px;
  margin: 0 0 14px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}

.station-schedule-switcher button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 11px;
  font-weight: 680;
  transition: background 260ms var(--motion-soft), color 260ms var(--motion-soft), transform 120ms var(--motion-ease);
}

.station-schedule-switcher button.is-active {
  background: var(--surface-glass);
  color: var(--text);
  box-shadow: inset 0 0 0 0.5px var(--border);
}

.station-schedule-switcher button:active {
  transform: scale(.95);
}

html.school-samsung .class-nav-capsule,
html.school-samsung .class-nav-mini-pill {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@media (max-width: 380px) {
  .class-nav-capsule.is-open {
    width: min(124px, calc(var(--station-slot) * 1.78));
  }

  .class-nav-subbutton span {
    font-size: 8.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .class-nav-capsule,
  .class-nav-mini-pill {
    transition-duration: .01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview station nav marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview station nav range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `const tabs = [\n  { id: 'home', label: '홈' },\n  { id: 'todo', label: '리마인더' },\n  { id: 'timetable', label: '시간표' },\n  { id: 'meal', label: '급식' },\n  { id: 'academic', label: '학사일정' },\n]`,
    `const tabs = [\n  { id: 'home', label: '홈' },\n  { id: 'class', label: '우리반' },\n  { id: 'ai', label: 'AI' },\n  { id: 'study', label: '스터디' },\n  { id: 'schedule', label: '일정' },\n]`,
    'station tabs',
  )

  next = replaceRequired(
    next,
    `  if (type === 'todo') {\n    return <svg {...common}><path d="M8.5 6.5h11"/><path d="M8.5 12h11"/><path d="M8.5 17.5h11"/><path d="m3.8 6.4 1.2 1.2 2-2.2"/><path d="m3.8 11.9 1.2 1.2 2-2.2"/><path d="m3.8 17.4 1.2 1.2 2-2.2"/></svg>\n  }`,
    `  if (type === 'class') {\n    return <svg {...common}><path d="M8.3 11.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M3.5 19.4v-1.2a4.8 4.8 0 0 1 4.8-4.8h.1a4.8 4.8 0 0 1 4.8 4.8v1.2"/><path d="M15.6 11.1a2.6 2.6 0 1 0 0-5.2"/><path d="M15.8 13.5a4.3 4.3 0 0 1 4.7 4.3v1.6"/></svg>\n  }\n  if (type === 'ai') {\n    return <svg {...common}><path d="M12 3.5c.5 3.3 2.2 5 5.5 5.5-3.3.5-5 2.2-5.5 5.5-.5-3.3-2.2-5-5.5-5.5 3.3-.5 5-2.2 5.5-5.5Z"/><path d="M18.2 14.5c.25 1.65 1.1 2.5 2.75 2.75-1.65.25-2.5 1.1-2.75 2.75-.25-1.65-1.1-2.5-2.75-2.75 1.65-.25 2.5-1.1 2.75-2.75Z"/></svg>\n  }\n  if (type === 'study') {\n    return <svg {...common}><path d="M4.2 5.1h5.5a3.2 3.2 0 0 1 2.3.95v13a3.2 3.2 0 0 0-2.3-.95H4.2z"/><path d="M19.8 5.1h-5.5a3.2 3.2 0 0 0-2.3.95v13a3.2 3.2 0 0 1 2.3-.95h5.5z"/></svg>\n  }\n  if (type === 'schedule') {\n    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3"/><path d="M16.5 3.5v3"/><path d="M3.5 9h17"/><path d="m8 14 2.1 2.1 4.4-4.6"/></svg>\n  }\n  if (type === 'board') {\n    return <svg {...common}><path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><path d="M7.5 9h9"/><path d="M7.5 13h6"/></svg>\n  }\n  if (type === 'todo') {\n    return <svg {...common}><path d="M8.5 6.5h11"/><path d="M8.5 12h11"/><path d="M8.5 17.5h11"/><path d="m3.8 6.4 1.2 1.2 2-2.2"/><path d="m3.8 11.9 1.2 1.2 2-2.2"/><path d="m3.8 17.4 1.2 1.2 2-2.2"/></svg>\n  }`,
    'station icons',
  )

  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `function PreviewBoardPage() {\n  return (\n    <section className="station-placeholder-page">\n      <header className="page-header"><div><p className="eyebrow">우리 반</p><h1>게시판</h1></div></header>\n      <div className="station-placeholder-card">\n        <Icon type="board" size={28} />\n        <h2>게시판 자리까지 먼저 연결했어</h2>\n        <p>이번 프리뷰에서는 스테이션과 알약 동작을 먼저 확인하고, 게시글 기능은 다음 단계에서 연결할 거야.</p>\n      </div>\n    </section>\n  )\n}\n\nfunction PreviewStudyPage() {\n  return (\n    <section className="station-placeholder-page">\n      <header className="page-header"><div><p className="eyebrow">S-Hub V2</p><h1>스터디</h1></div></header>\n      <div className="station-placeholder-card">\n        <Icon type="study" size={28} />\n        <h2>스터디 탭</h2>\n        <p>스터디 기능을 넣을 자리만 먼저 확보했어. 기존 기능에는 영향을 주지 않아.</p>\n      </div>\n    </section>\n  )\n}\n\nfunction PreviewAIPage({ onOpenAI }) {\n  return (\n    <section className="station-ai-page">\n      <header className="page-header"><div><p className="eyebrow">S-Hub</p><h1>AI</h1></div></header>\n      <div className="station-ai-card">\n        <SHubAIOrb size={34} />\n        <h2>S-Hub AI</h2>\n        <p>기존 AI 기능을 그대로 사용해. 아래 버튼을 누르면 다시 열 수 있어.</p>\n        <button type="button" onClick={onOpenAI}>AI 열기</button>\n      </div>\n    </section>\n  )\n}\n\nfunction ScheduleStationPage({ section, onSectionChange, todoPage, academicPage, mealPage }) {\n  return (\n    <section className="station-schedule-page">\n      <div className="station-schedule-switcher" aria-label="일정 세부 메뉴">\n        <button type="button" className={section === 'todo' ? 'is-active' : ''} onClick={() => onSectionChange('todo')}>리마인더</button>\n        <button type="button" className={section === 'academic' ? 'is-active' : ''} onClick={() => onSectionChange('academic')}>학사일정</button>\n        <button type="button" className={section === 'meal' ? 'is-active' : ''} onClick={() => onSectionChange('meal')}>급식</button>\n      </div>\n      {section === 'academic' ? academicPage : section === 'meal' ? mealPage : todoPage}\n    </section>\n  )\n}\n\nfunction AppShell({ profile }) {`,
    'station helper pages',
  )

  next = replaceRequired(
    next,
    `  const [activeTab, setActiveTab] = useState('home')\n  const [contentDirection, setContentDirection] = useState(1)\n  const [aiOpen, setAiOpen] = useState(false)`,
    `  const [activeTab, setActiveTab] = useState('home')\n  const [contentDirection, setContentDirection] = useState(1)\n  const [aiOpen, setAiOpen] = useState(false)\n  const [classSection, setClassSection] = useState('timetable')\n  const [classNavExpanded, setClassNavExpanded] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')`,
    'station state',
  )

  next = replaceRequired(
    next,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n  useEffect(() => {`,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      return undefined\n    }\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 250)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => {`,
    'class capsule expansion timing',
  )

  const contentReplacement = `  const content = {\n    home: (\n      <Home\n        name={name}\n        now={now}\n        weeklySchedule={weeklySchedule}\n        overrides={overrides}\n        schoolData={schoolData}\n        todoData={todoData}\n        presence={presence}\n        academicData={academicData}\n        onOpenAI={() => setAiOpen(true)}\n      />\n    ),\n    class: classSection === 'board' ? (\n      <PreviewBoardPage />\n    ) : (\n      <TimetablePage\n        now={now}\n        weeklySchedule={weeklySchedule}\n        overrides={overrides}\n        sharedWeeklySchedule={sharedWeeklySchedule}\n        sharedOverrides={sharedOverrides}\n        personalWeeklySchedule={personalWeeklySchedule}\n        personalOverrides={personalOverrides}\n        onSaveWeekly={commitWeeklySchedule}\n        onSaveOverrides={commitOverrides}\n        onSavePersonalWeekly={commitPersonalWeeklySchedule}\n        onSavePersonalOverrides={commitPersonalOverrides}\n        activity={activity}\n        profile={profile}\n        requireOnline={requireOnline}\n      />\n    ),\n    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n    study: <PreviewStudyPage />,\n    schedule: (\n      <ScheduleStationPage\n        section={scheduleSection}\n        onSectionChange={setScheduleSection}\n        todoPage={<TodoPage now={now} todoData={todoData} requireOnline={requireOnline} />}\n        academicPage={<SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} requireOnline={requireOnline} />}\n        mealPage={<Stage3MealPage schoolData={schoolData} />}\n      />\n    ),\n  }\n\n`
  next = spliceRequired(next, '  const content = {\n', '  function changeTab(nextTab) {', contentReplacement, 'station content')

  next = replaceRequired(
    next,
    `  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) return\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    if (nextIndex < 0) return\n    const previousIndex = activeIndexRef.current\n    activeTabRef.current = nextTab\n    activeIndexRef.current = nextIndex\n    setContentDirection(nextIndex > previousIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }`,
    `  function changeTab(nextTab) {\n    if (nextTab === 'ai') setAiOpen(true)\n    if (nextTab === activeTabRef.current) return\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    if (nextIndex < 0) return\n    const previousIndex = activeIndexRef.current\n    activeTabRef.current = nextTab\n    activeIndexRef.current = nextIndex\n    setContentDirection(nextIndex > previousIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }`,
    'AI station behavior',
  )

  next = replaceRequired(
    next,
    `      <nav\n        ref={navRef}\n        className="bottom-nav"\n        style={{ '--indicator-x': \`${'${activeIndex * 100}%'}\`, '--nav-count': tabs.length }}\n        aria-label="주요 메뉴"\n      >\n        <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />\n        {tabs.map((tab, index) => (\n          <button\n            ref={(node) => { buttonRefs.current[index] = node }}\n            key={tab.id}\n            type="button"\n            className={\`nav-button ${'${activeTab === tab.id ? \'active\' : \'\'}'}\`}\n            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}\n            aria-current={activeTab === tab.id ? 'page' : undefined}\n          >\n            <Icon type={tab.id} />\n            <span>{tab.label}</span>\n          </button>\n        ))}\n      </nav>`,
    `      <nav\n        ref={navRef}\n        className={\`bottom-nav ${'${classNavExpanded ? \'is-class-expanded\' : \'\'}'}\`}\n        style={{ '--indicator-x': \`${'${activeIndex * 100}%'}\`, '--nav-count': tabs.length }}\n        aria-label="주요 메뉴"\n      >\n        <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />\n        {tabs.map((tab, index) => (\n          <button\n            ref={(node) => { buttonRefs.current[index] = node }}\n            key={tab.id}\n            type="button"\n            data-tab={tab.id}\n            className={\`nav-button ${'${activeTab === tab.id ? \'active\' : \'\'}'}\`}\n            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}\n            aria-current={activeTab === tab.id ? 'page' : undefined}\n          >\n            <Icon type={tab.id} />\n            <span>{tab.label}</span>\n          </button>\n        ))}\n        <div\n          className={\`class-nav-capsule ${'${classNavExpanded ? \'is-open\' : \'\'}'}\`}\n          aria-hidden={!classNavExpanded}\n        >\n          <span className={\`class-nav-mini-pill ${'${classSection === \'board\' ? \'is-board\' : \'is-timetable\'}'}\`} aria-hidden="true" />\n          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'timetable\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}\n            aria-label="우리 반 시간표"\n            aria-pressed={classSection === 'timetable'}\n            onClick={() => setClassSection('timetable')}\n          >\n            <Icon type="timetable" size={20} />\n            <span>시간표</span>\n          </button>\n          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'board\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}\n            aria-label="우리 반 게시판"\n            aria-pressed={classSection === 'board'}\n            onClick={() => setClassSection('board')}\n          >\n            <Icon type="board" size={20} />\n            <span>게시판</span>\n          </button>\n        </div>\n      </nav>`,
    'expanded class capsule nav',
  )

  return next
}

export function patchPreviewStationNavSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only S-Hub V2 station navigation experiment')) return current
    return `${current}\n${STATION_NAV_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
