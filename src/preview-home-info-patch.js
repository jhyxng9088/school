function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview home info patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

export function patchPreviewHomeInfoSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')

  next = replaceRequired(
    next,
    "import { installPoliteCopyRuntime } from './polite-copy-runtime.js'\n",
    "import { installPoliteCopyRuntime } from './polite-copy-runtime.js'\nimport { PreviewHomeSignals } from './preview-home-signals.jsx'\n",
    'home signals import',
  )

  next = replaceRequired(
    next,
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI }) {',
    'function Home({ profile, name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI, onNavigate }) {',
    'home profile prop',
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
    `  function navigateHomeSignal(target) {\n    if (target === 'class') {\n      document.querySelector('.class-presence-count')?.click()\n      return\n    }\n    if (target === 'board') {\n      setClassSection('board')\n      changeTab('class')\n      return\n    }\n    if (target === 'study') {\n      changeTab('study')\n      return\n    }\n    if (target === 'reminder') {\n      setScheduleSection('todo')\n      changeTab('schedule')\n    }\n  }\n\n  const content = {\n    home: (`,
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
