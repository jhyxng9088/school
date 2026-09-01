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
    'function Home({ profile, name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI }) {',
    'home profile prop',
  )

  next = replaceRequired(
    next,
    '        <CurrentClassPreview schoolState={schoolState} now={now} />\n        <TodoHomePreview todos={todoData.todos} categories={todoData.categories} now={now} />',
    '        <CurrentClassPreview schoolState={schoolState} now={now} />\n        <PreviewHomeSignals profile={profile} presence={presence} todos={todoData.todos} />\n        <TodoHomePreview todos={todoData.todos} categories={todoData.categories} now={now} />',
    'home overview placement',
  )

  next = replaceRequired(
    next,
    '      <Home\n        name={name}\n        now={now}',
    '      <Home\n        profile={profile}\n        name={name}\n        now={now}',
    'home profile wiring',
  )

  return next
}
