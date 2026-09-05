function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview home info patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

const POLITE_IMPORT = "import { installPoliteCopyRuntime } from './polite-copy-runtime.js'\n"
const HOME_SIGNALS_IMPORT = "import { PreviewHomeSignals } from './preview-home-signals.jsx'\n"
const HOME_NAV_ACTION_IMPORT = "import { HomeNavAction } from './home-nav-action.jsx'\n"
const HOME_MEAL_PRIORITY_IMPORT = "import { useHomeMealPriority } from './home-meal-priority.js'\n"

export function patchPreviewHomeInfoImports(source) {
  let next = String(source || '')

  if (!next.includes(HOME_SIGNALS_IMPORT)) {
    next = replaceRequired(
      next,
      POLITE_IMPORT,
      `${POLITE_IMPORT}${HOME_SIGNALS_IMPORT}`,
      'home signals import',
    )
  }

  if (!next.includes(HOME_NAV_ACTION_IMPORT)) {
    next = replaceRequired(
      next,
      HOME_SIGNALS_IMPORT,
      `${HOME_SIGNALS_IMPORT}${HOME_NAV_ACTION_IMPORT}`,
      'home nav action import',
    )
  }

  if (!next.includes(HOME_MEAL_PRIORITY_IMPORT)) {
    next = replaceRequired(
      next,
      HOME_NAV_ACTION_IMPORT,
      `${HOME_NAV_ACTION_IMPORT}${HOME_MEAL_PRIORITY_IMPORT}`,
      'home meal priority import',
    )
  }

  return next
}

export function patchPreviewHomeInfoSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = patchPreviewHomeInfoImports(source)

  next = replaceRequired(
    next,
    '  return (\n    <section className="current-class-card">\n      <div className="current-class-icon"><Icon type="clock" size={20} /></div>',
    '  return (\n    <section className="current-class-card home-nav-native-surface" data-home-nav-ready="true">\n      <HomeNavAction tab="class" section="timetable" label="시간표 열기" />\n      <div className="current-class-icon"><Icon type="clock" size={20} /></div>',
    'current class native timetable navigation',
  )

  next = replaceRequired(
    next,
    '    return (\n      <section className="home-section">\n        <SectionTitle>{title}</SectionTitle>\n        <div className="today-timetable-empty">',
    '    return (\n      <section className="home-section home-nav-native-surface" data-home-nav-ready="true">\n        <HomeNavAction tab="class" section="timetable" label="시간표 열기" />\n        <SectionTitle>{title}</SectionTitle>\n        <div className="today-timetable-empty">',
    'empty timetable native navigation',
  )

  next = replaceRequired(
    next,
    '  return (\n    <section className="home-section">\n      <SectionTitle>{title}</SectionTitle>\n      <div\n        className="period-strip"',
    '  return (\n    <section className="home-section home-nav-native-surface" data-home-nav-ready="true">\n      <HomeNavAction tab="class" section="timetable" label="시간표 열기" />\n      <SectionTitle>{title}</SectionTitle>\n      <div\n        className="period-strip"',
    'timetable preview native navigation',
  )

  next = replaceRequired(
    next,
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI }) {',
    'function Home({ profile, name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI, onNavigate }) {',
    'home profile prop',
  )

  next = replaceRequired(
    next,
    'function Home({ profile, name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI, onNavigate }) {\n  const today =',
    'function Home({ profile, name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI, onNavigate }) {\n  const { homeStackRef, mealPriority } = useHomeMealPriority(now)\n  const today =',
    'home meal priority owner',
  )

  next = replaceRequired(
    next,
    '      <div className="home-stack">',
    "      <div ref={homeStackRef} className={`home-stack ${mealPriority ? 'is-meal-priority' : ''}`} data-home-lunch-ready=\"true\">",
    'home meal priority surface',
  )

  next = replaceRequired(
    next,
    '        <CurrentClassPreview schoolState={schoolState} now={now} />\n        <TodoHomePreview todos={todoData.todos} categories={todoData.categories} now={now} />',
    '        <CurrentClassPreview schoolState={schoolState} now={now} />\n        <PreviewHomeSignals profile={profile} presence={presence} todos={todoData.todos} onNavigate={onNavigate} />\n        <TodoHomePreview todos={todoData.todos} categories={todoData.categories} now={now} />',
    'home overview placement',
  )

  next = replaceRequired(
    next,
    '  const content = {\n    home: (',
    `  function navigateHomeSignal(target) {\n    if (target === 'class') {\n      openClassRoster()\n      return\n    }\n    if (target === 'board') {\n      setClassSection('board')\n      changeTab('class')\n      return\n    }\n    if (target === 'study') {\n      changeTab('study')\n      return\n    }\n    if (target === 'reminder') {\n      setScheduleSection('todo')\n      changeTab('schedule')\n    }\n  }\n\n  const content = {\n    home: (`,
    'home signal navigation',
  )

  next = replaceRequired(
    next,
    '      <Home\n        name={name}\n        now={now}',
    '      <Home\n        profile={profile}\n        onNavigate={navigateHomeSignal}\n        name={name}\n        now={now}',
    'home profile wiring',
  )

  return next
}
