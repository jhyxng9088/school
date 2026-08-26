from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, label):
    assert old in text, f'{label} guard failed'
    return text.replace(old, new, 1)


# 1) Reminder cache: restore the last personal completed/hidden state immediately.
path = 'src/todo.jsx'
text = read(path)
old = """const SHARED_TODOS_CACHE_VERSION = 'v1'\n\nfunction sharedTodosCacheKey(profile) {\n"""
new = """const SHARED_TODOS_CACHE_VERSION = 'v1'\nconst PERSONAL_TODO_STATE_CACHE_VERSION = 'v1'\n\nfunction sharedTodosCacheKey(profile) {\n"""
text = replace_once(text, old, new, 'todo cache version')

anchor = """function writeSharedTodosCache(profile, todos) {\n  const key = sharedTodosCacheKey(profile)\n  if (!key) return\n  try {\n    localStorage.setItem(key, JSON.stringify((todos || []).map(sharedTodoShape)))\n  } catch {\n    // Cache only accelerates first paint. Firestore remains authoritative.\n  }\n}\n\nexport function useTodos(profile) {\n"""
insert = """function writeSharedTodosCache(profile, todos) {\n  const key = sharedTodosCacheKey(profile)\n  if (!key) return\n  try {\n    localStorage.setItem(key, JSON.stringify((todos || []).map(sharedTodoShape)))\n  } catch {\n    // Cache only accelerates first paint. Firestore remains authoritative.\n  }\n}\n\nfunction personalTodoStateCacheKey(profile) {\n  const studentKey = studentKeyFor(profile)\n  return studentKey ? `school.personalTodoState.${PERSONAL_TODO_STATE_CACHE_VERSION}.${studentKey}` : ''\n}\n\nfunction normalizePersonalTodoState(value) {\n  if (!value || typeof value !== 'object') return {}\n  const next = {}\n  Object.entries(value).forEach(([id, entry]) => {\n    if (!id || !entry || typeof entry !== 'object') return\n    next[id] = {\n      completed: Boolean(entry.completed),\n      hidden: Boolean(entry.hidden),\n      updatedAt: Number(entry.updatedAt || 0),\n    }\n  })\n  return next\n}\n\nfunction readPersonalTodoStateCache(profile) {\n  const key = personalTodoStateCacheKey(profile)\n  if (!key) return {}\n  try {\n    return normalizePersonalTodoState(JSON.parse(localStorage.getItem(key) || '{}'))\n  } catch {\n    return {}\n  }\n}\n\nfunction writePersonalTodoStateCache(profile, state) {\n  const key = personalTodoStateCacheKey(profile)\n  if (!key) return\n  try {\n    localStorage.setItem(key, JSON.stringify(normalizePersonalTodoState(state)))\n  } catch {\n    // Firestore remains authoritative; this cache only prevents stale first paint.\n  }\n}\n\nexport function useTodos(profile) {\n"""
text = replace_once(text, anchor, insert, 'todo personal cache helpers')
text = replace_once(
    text,
    "const [personalState, setPersonalState] = useState({})",
    "const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))",
    'todo personal initial state',
)
text = replace_once(
    text,
    """    setSharedTodos(readSharedTodosCache(profile))\n    setPersonalState({})\n""",
    """    setSharedTodos(readSharedTodosCache(profile))\n    setPersonalState(readPersonalTodoStateCache(profile))\n""",
    'todo signature cache restore',
)
text = replace_once(
    text,
    """      (remoteState) => {\n        if (disposed) return\n        setPersonalState(remoteState)\n      },\n""",
    """      (remoteState) => {\n        if (disposed) return\n        const next = normalizePersonalTodoState(remoteState)\n        writePersonalTodoStateCache(profile, next)\n        setPersonalState(next)\n      },\n""",
    'todo personal snapshot cache',
)
old = """  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {\n    setPersonalState((current) => ({ ...current, [id]: nextEntry }))\n    writeStudentTodoState(profile, id, nextEntry).catch((error) => {\n      console.error('Personal reminder state save failed:', error)\n      setPersonalState((current) => {\n        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current\n        const next = { ...current }\n        if (previousEntry) next[id] = previousEntry\n        else delete next[id]\n        return next\n      })\n    })\n  }\n"""
new = """  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {\n    setPersonalState((current) => {\n      const next = { ...current, [id]: nextEntry }\n      writePersonalTodoStateCache(profile, next)\n      return next\n    })\n    writeStudentTodoState(profile, id, nextEntry).catch((error) => {\n      console.error('Personal reminder state save failed:', error)\n      setPersonalState((current) => {\n        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current\n        const next = { ...current }\n        if (previousEntry) next[id] = previousEntry\n        else delete next[id]\n        writePersonalTodoStateCache(profile, next)\n        return next\n      })\n    })\n  }\n"""
text = replace_once(text, old, new, 'todo optimistic personal cache')
write(path, text)


# 2) Reminder FLIP: cancel stale animations, avoid long cross-section jumps, never retain fill state.
path = 'src/todo-stage5-ai.jsx'
text = read(path)
old = """    const nodes = [...root.querySelectorAll('[data-reminder-id]')]\n    const currentRects = new Map()\n    nodes.forEach((node) => currentRects.set(node.dataset.reminderId, node.getBoundingClientRect()))\n"""
new = """    const nodes = [...root.querySelectorAll('[data-reminder-id]')]\n    nodes.forEach((node) => node.getAnimations().forEach((animation) => animation.cancel()))\n    const currentRects = new Map()\n    nodes.forEach((node) => currentRects.set(node.dataset.reminderId, node.getBoundingClientRect()))\n"""
text = replace_once(text, old, new, 'reminder cancel stale animations')
old = """          if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {\n            node.animate(\n              [\n                { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.9 },\n                { transform: 'translate3d(0, 0, 0)', opacity: 1 },\n              ],\n              {\n                duration: 720,\n                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',\n                fill: 'both',\n              },\n            )\n          }\n"""
new = """          if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {\n            const crossesSections = Math.abs(deltaY) > 120\n            node.animate(\n              crossesSections\n                ? [\n                    { transform: 'translate3d(0, 7px, 0) scale(0.995)', opacity: 0.32 },\n                    { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },\n                  ]\n                : [\n                    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.92 },\n                    { transform: 'translate3d(0, 0, 0)', opacity: 1 },\n                  ],\n              {\n                duration: crossesSections ? 520 : 680,\n                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',\n                fill: 'none',\n              },\n            )\n          }\n"""
text = replace_once(text, old, new, 'reminder large movement animation')
text = text.replace("fill: 'both',", "fill: 'none',", 1)
write(path, text)


# 3) Academic deletion: animate row out, then let siblings FLIP into place.
path = 'src/academic-shared.jsx'
text = read(path)
text = replace_once(
    text,
    "import { useEffect, useMemo, useRef, useState } from 'react'",
    "import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'",
    'academic layout effect import',
)
old = """  const [saving, setSaving] = useState(false)\n  const [error, setError] = useState('')\n  const closeTimerRef = useRef(null)\n"""
new = """  const [saving, setSaving] = useState(false)\n  const [error, setError] = useState('')\n  const [deletingId, setDeletingId] = useState('')\n  const closeTimerRef = useRef(null)\n  const pageRef = useRef(null)\n  const academicRectsRef = useRef(new Map())\n  const academicMotionReadyRef = useRef(false)\n"""
text = replace_once(text, old, new, 'academic animation state')
old = """  const exam = upcoming.find(isImportantExam) || null\n\n  useEffect(() => () => {\n"""
new = """  const exam = upcoming.find(isImportantExam) || null\n  const upcomingSignature = upcoming.map((group) => group.id).join('|')\n\n  useLayoutEffect(() => {\n    const root = pageRef.current\n    if (!root) return\n    const nodes = [...root.querySelectorAll('[data-academic-id]')]\n    nodes.forEach((node) => node.getAnimations().forEach((animation) => animation.cancel()))\n    const currentRects = new Map()\n    nodes.forEach((node) => currentRects.set(node.dataset.academicId, node.getBoundingClientRect()))\n\n    if (!academicMotionReadyRef.current) {\n      academicRectsRef.current = currentRects\n      academicMotionReadyRef.current = true\n      return\n    }\n\n    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {\n      nodes.forEach((node) => {\n        const previous = academicRectsRef.current.get(node.dataset.academicId)\n        const current = currentRects.get(node.dataset.academicId)\n        if (!previous || !current) return\n        const deltaY = previous.top - current.top\n        if (Math.abs(deltaY) < 0.5) return\n        node.animate(\n          [\n            { transform: `translate3d(0, ${deltaY}px, 0)`, opacity: 0.94 },\n            { transform: 'translate3d(0, 0, 0)', opacity: 1 },\n          ],\n          { duration: 560, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'none' },\n        )\n      })\n    }\n    academicRectsRef.current = currentRects\n  }, [upcomingSignature])\n\n  useEffect(() => () => {\n"""
text = replace_once(text, old, new, 'academic FLIP effect')
old = """  async function remove() {\n    if (!draft.id || saving) return\n    setSaving(true)\n    setError('')\n    try {\n      await academicData.deleteEvent(draft.id)\n      closeAfterSave()\n    } catch (deleteError) {\n      setError(academicErrorMessage(deleteError, '학사일정을 삭제하지 못했어.'))\n    } finally {\n      setSaving(false)\n    }\n  }\n"""
new = """  async function remove() {\n    if (!draft.id || saving) return\n    const targetId = draft.id\n    setSaving(true)\n    setError('')\n    setDeletingId(targetId)\n    try {\n      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {\n        await new Promise((resolve) => window.setTimeout(resolve, 260))\n      }\n      await academicData.deleteEvent(targetId)\n      closeAfterSave()\n    } catch (deleteError) {\n      setDeletingId('')\n      setError(academicErrorMessage(deleteError, '학사일정을 삭제하지 못했어.'))\n    } finally {\n      setSaving(false)\n    }\n  }\n"""
text = replace_once(text, old, new, 'academic delete staging')
text = replace_once(
    text,
    '<section className="stage3-page academic-page shared-academic-page">',
    '<section ref={pageRef} className="stage3-page academic-page shared-academic-page">',
    'academic page ref',
)
old = """          <article className={`academic-list-item ${isImportantExam(group) ? 'is-important' : ''} ${group.source === 'custom' ? 'is-custom' : ''}`} key={group.id}>\n"""
new = """          <article\n            className={`academic-list-item ${isImportantExam(group) ? 'is-important' : ''} ${group.source === 'custom' ? 'is-custom' : ''} ${deletingId === group.id ? 'is-deleting' : ''}`.trim()}\n            data-academic-id={group.id}\n            key={group.id}\n          >\n"""
text = replace_once(text, old, new, 'academic item deleting class')
write(path, text)


# 4) Main nav: browser-stable CSS indicator for phones/Samsung; classify Samsung; page-specific compositor fallback.
path = 'src/main.jsx'
text = read(path)
old = """const MOBILE_BROWSER_COMPAT = /iPhone|iPod|Android|SamsungBrowser/i.test(navigator.userAgent)\nif (MOBILE_BROWSER_COMPAT) document.documentElement.classList.add('school-mobile-compat')\n"""
new = """const MOBILE_BROWSER_COMPAT = /iPhone|iPod|Android|SamsungBrowser/i.test(navigator.userAgent)\nconst SAMSUNG_BROWSER = /SamsungBrowser/i.test(navigator.userAgent)\nif (MOBILE_BROWSER_COMPAT) document.documentElement.classList.add('school-mobile-compat')\nif (SAMSUNG_BROWSER) document.documentElement.classList.add('school-samsung')\n"""
text = replace_once(text, old, new, 'browser classes')
old = """    const compatibilityTransition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), width 420ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 420ms cubic-bezier(0.16, 1, 0.3, 1)'\n\n    function paint() {\n"""
new = """    const compatibilityTransition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), width 420ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 420ms cubic-bezier(0.16, 1, 0.3, 1)'\n\n    if (compatibilityMotion) {\n      stopInlineIndicatorStyles(indicator)\n      return undefined\n    }\n\n    function paint() {\n"""
# Insert helper before hook and avoid using function defined later.
helper_anchor = """function useNavSpring(activeIndex) {\n"""
helper = """function stopInlineIndicatorStyles(indicator) {\n  indicator.style.width = ''\n  indicator.style.transform = ''\n  indicator.style.borderRadius = ''\n  indicator.style.transition = ''\n  indicator.style.removeProperty('will-change')\n}\n\nfunction useNavSpring(activeIndex) {\n"""
text = replace_once(text, helper_anchor, helper, 'nav compatibility helper')
text = replace_once(text, old, new, 'nav compatibility early exit')
# Remove now-unreachable compatibility branches to keep logic simple and avoid accidental inline writes later.
old = """    if (compatibilityMotion) {\n      indicator.style.transition = reduceMotion || !wasInitialized ? 'none' : compatibilityTransition\n      physics.x = physics.targetX\n      physics.velocity = 0\n      physics.lastTime = 0\n      paint()\n      if (!reduceMotion && !wasInitialized) {\n        requestAnimationFrame(() => {\n          if (indicator.isConnected) indicator.style.transition = compatibilityTransition\n        })\n      }\n    } else if (!reduceMotion && Math.abs(physics.x - physics.targetX) > 0.01) {\n"""
new = """    if (!reduceMotion && Math.abs(physics.x - physics.targetX) > 0.01) {\n"""
text = replace_once(text, old, new, 'nav spring mobile branch cleanup')
text = text.replace("      if (compatibilityMotion) indicator.style.transition = 'none'\n", "", 1)
text = text.replace("""      if (compatibilityMotion && !reduceMotion) {\n        requestAnimationFrame(() => {\n          if (indicator.isConnected) indicator.style.transition = compatibilityTransition\n        })\n      }\n""", "", 1)
text = replace_once(
    text,
    'className="app-content"\n        key={activeTab}',
    'className={`app-content tab-${activeTab}`}\n        key={activeTab}',
    'app content tab class',
)
text = replace_once(
    text,
    '<nav ref={navRef} className="bottom-nav" aria-label="주요 메뉴">',
    '<nav ref={navRef} className="bottom-nav" style={{ \'--active-index\': activeIndex }} aria-label="주요 메뉴">',
    'nav active index style',
)
write(path, text)


# 5) Stable bottom nav compositor + mobile CSS-only indicator + Samsung fallback.
path = 'src/styles.css'
text = read(path)
append = r'''

/* Cross-browser nav compositor stability. Mobile uses a deterministic CSS indicator
   instead of layout-measuring transforms, which avoids Samsung/iOS fixed-layer glitches. */
.bottom-nav {
  transform: translate3d(-50%, 0, 0);
  -webkit-transform: translate3d(-50%, 0, 0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
  contain: paint;
}

.nav-indicator {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

html.school-mobile-compat .nav-indicator {
  left: var(--nav-padding);
  width: calc((100% - (var(--nav-padding) * 2)) / 5);
  transform: translate3d(calc(var(--active-index, 0) * 100%), 0, 0) !important;
  border-radius: 19px !important;
  transition: transform 440ms cubic-bezier(0.16, 1, 0.3, 1) !important;
  will-change: transform;
}

html.school-samsung .bottom-nav {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@keyframes school-mobile-opacity-in {
  from { opacity: 0.42; }
  to { opacity: 1; }
}

/* Samsung's compositor flickers when a transformed page and a fixed blurred nav
   are animated at once. Keep the page transition, but make it opacity-only there. */
html.school-samsung .app-content {
  animation: school-mobile-opacity-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform: none !important;
}

/* On iPhone the same compositor conflict was isolated to the academic page. */
html.school-mobile-compat:not(.school-samsung) .app-content.tab-academic {
  animation: school-mobile-opacity-in 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform: none !important;
}
'''
assert 'Cross-browser nav compositor stability' not in text
text += append
write(path, text)


# 6) Samsung: use real inline SVG icons instead of CSS masks for meal/academic.
path = 'src/stage3.css'
text = read(path)
append = r'''

/* Samsung Internet can render currentColor SVG masks as solid black. Use the
   actual React SVG icons on Samsung while keeping the existing icon design elsewhere. */
html.school-samsung .bottom-nav .nav-button:nth-of-type(4) svg,
html.school-samsung .bottom-nav .nav-button:nth-of-type(5) svg {
  display: block;
}

html.school-samsung .bottom-nav .nav-button:nth-of-type(4)::before,
html.school-samsung .bottom-nav .nav-button:nth-of-type(5)::before {
  display: none;
}
'''
assert 'Samsung Internet can render currentColor SVG masks' not in text
text += append
write(path, text)


# 7) Unified sheet geometry/timing: reminder.
path = 'public/reminder-sheet.css'
text = read(path)
append = r'''

/* Unified School sheet geometry: Reminder / Timetable / Academic share this shape. */
body .todo-sheet.reminder-sheet-managed {
  bottom: 0;
  width: min(calc(100% - 16px), 660px);
  max-height: min(88dvh, 760px);
  padding: 8px 18px max(20px, calc(14px + env(safe-area-inset-bottom)));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 28px 28px 0 0;
  background: var(--surface);
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);
  transition:
    transform 560ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

body .todo-sheet.reminder-sheet-managed .change-editor-head {
  position: sticky;
  top: 0;
  z-index: 5;
  min-height: 0;
  margin: 0 0 8px;
  padding: 26px 48px 18px 2px;
  background: var(--surface);
}

body .todo-sheet.reminder-sheet-managed.is-closing {
  transition:
    transform 320ms cubic-bezier(0.4, 0, 1, 1),
    opacity 220ms cubic-bezier(0.4, 0, 1, 1);
}
'''
assert 'Unified School sheet geometry' not in text
text += append
write(path, text)


# 8) Unified sheet geometry: timetable.
path = 'public/school-sheet.css'
text = read(path)
append = r'''

/* Unified School sheet geometry: bottom-flush on phones, tablets and tall screens. */
body .timetable-page .change-editor {
  bottom: 0;
  width: min(calc(100% - 16px), 660px);
  max-height: min(88dvh, 760px);
  padding: 8px 18px max(20px, calc(14px + env(safe-area-inset-bottom)));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 28px 28px 0 0;
  background: var(--surface);
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

body .timetable-page .change-editor .change-editor-head {
  position: sticky;
  top: 0;
  z-index: 5;
  min-height: 0;
  margin: 0 0 8px;
  padding: 26px 48px 18px 2px;
  background: var(--surface);
}

body .timetable-page .change-editor .change-editor-head::before {
  top: 7px;
}
'''
assert 'bottom-flush on phones, tablets and tall screens' not in text
text += append
write(path, text)


# 9) Academic delete motion + unified modal geometry and timing.
path = 'src/academic-shared.css'
text = read(path)
append = r'''

@keyframes academic-item-delete-out {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    opacity: 0;
    transform: translate3d(0, -6px, 0) scale(0.996);
  }
}

.academic-list-item.is-deleting {
  pointer-events: none;
  animation: academic-item-delete-out 260ms cubic-bezier(0.4, 0, 1, 1) both !important;
}

/* Unified School sheet geometry: same shape, safe-area behavior and motion as Reminder. */
.academic-sheet-backdrop {
  animation: academic-backdrop-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.academic-sheet-backdrop.is-closing {
  animation: academic-backdrop-out 320ms cubic-bezier(0.4, 0, 1, 1) both;
}

body .academic-editor {
  bottom: 0;
  width: min(calc(100% - 16px), 660px);
  max-height: min(88dvh, 760px);
  padding: 8px 18px max(20px, calc(14px + env(safe-area-inset-bottom)));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 28px 28px 0 0;
  background: var(--surface);
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);
  animation: academic-sheet-in 560ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
}

body .academic-editor.is-closing {
  animation: academic-sheet-out 320ms cubic-bezier(0.4, 0, 1, 1) both !important;
}

.academic-editor-head {
  position: sticky;
  top: 0;
  z-index: 5;
  min-height: 0;
  margin: 0 0 8px;
  padding: 26px 48px 18px 2px;
  background: var(--surface);
}

body .academic-editor::before {
  width: 38px;
  height: 5px;
  margin: 0 auto;
  transform: translateY(-1px);
}

@media (min-width: 700px) {
  body .academic-editor {
    bottom: 0;
    border-radius: 28px 28px 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .academic-list-item.is-deleting {
    animation: none !important;
  }
}
'''
assert 'academic-item-delete-out' not in text
text += append
write(path, text)


# 10) Match academic React close timeout to the unified 320ms exit.
path = 'src/academic-shared.jsx'
text = read(path)
text = replace_once(text, 'const SHEET_CLOSE_MS = 300', 'const SHEET_CLOSE_MS = 320', 'academic close duration')
write(path, text)

print('UI consistency hotfix applied')
