from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one exact match, found {count}: {old[:120]!r}')
    write(path, content.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    content = read(path)
    next_content, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: expected one regex match, found {count}: {pattern!r}')
    write(path, next_content)


# 1) Bottom sheet: while the sheet is visibly closing, its backdrop must keep
# intercepting taps so touches cannot leak through to the page/nav behind it.
replace_once(
    'src/unified-sheet.css',
    '''.unified-sheet-backdrop.is-closing {\n  opacity: 0;\n  pointer-events: none;\n  transition-duration: 320ms;\n''',
    '''.unified-sheet-backdrop.is-closing {\n  opacity: 0;\n  pointer-events: auto;\n  transition-duration: 320ms;\n''',
)

# 2) Bottom navigation: one source of truth for five tabs and immediate mobile intent.
replace_once(
    'src/styles.css',
    '''.bottom-nav {\n  --nav-padding: 5px;\n''',
    '''.bottom-nav {\n  --nav-padding: 5px;\n  --nav-count: 5;\n''',
)
replace_once(
    'src/styles.css',
    '  grid-template-columns: repeat(4, minmax(0, 1fr));\n',
    '  grid-template-columns: repeat(var(--nav-count, 5), minmax(0, 1fr));\n',
)
replace_once(
    'src/styles.css',
    '''  cursor: pointer;\n  transition: color 440ms var(--motion-soft), transform 280ms var(--motion-ease);\n''',
    '''  cursor: pointer;\n  touch-action: manipulation;\n  transition: color 440ms var(--motion-soft), transform 280ms var(--motion-ease);\n''',
)
replace_once(
    'src/styles.css',
    '  width: calc((100% - var(--nav-padding) - var(--nav-padding)) / 5);\n',
    '  width: calc((100% - var(--nav-padding) - var(--nav-padding)) / var(--nav-count, 5));\n',
)

replace_once(
    'src/main.jsx',
    "  { id: 'todo', label: '투두' },\n",
    "  { id: 'todo', label: '리마인더' },\n",
)
replace_once(
    'src/main.jsx',
    '''  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)\n  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n''',
    '''  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)\n  const activeTabRef = useRef(activeTab)\n  const activeIndexRef = useRef(activeIndex)\n  activeTabRef.current = activeTab\n  activeIndexRef.current = activeIndex\n  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n''',
)
replace_once(
    'src/main.jsx',
    '''  function changeTab(nextTab) {\n    if (nextTab === activeTab) return\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    setContentDirection(nextIndex > activeIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }\n''',
    '''  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) return\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    if (nextIndex < 0) return\n    const previousIndex = activeIndexRef.current\n    activeTabRef.current = nextTab\n    activeIndexRef.current = nextIndex\n    setContentDirection(nextIndex > previousIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }\n''',
)
replace_once(
    'src/main.jsx',
    '''      <nav ref={navRef} className="bottom-nav" style={{ '--indicator-x': `${activeIndex * 100}%` }} aria-label="주요 메뉴">\n''',
    '''      <nav\n        ref={navRef}\n        className="bottom-nav"\n        style={{ '--indicator-x': `${activeIndex * 100}%`, '--nav-count': tabs.length }}\n        aria-label="주요 메뉴"\n      >\n''',
)
replace_once(
    'src/main.jsx',
    '''            key={tab.id}\n            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}\n            onClick={() => changeTab(tab.id)}\n''',
    '''            key={tab.id}\n            type="button"\n            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}\n            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}\n''',
)
# Remove two dead locals from the desktop-only spring implementation.
replace_once(
    'src/main.jsx',
    "    const compatibilityTransition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), width 420ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 420ms cubic-bezier(0.16, 1, 0.3, 1)'\n\n",
    '',
)
replace_once(
    'src/main.jsx',
    '''    const wasInitialized = physics.initialized\n    measure(!physics.initialized)\n''',
    '''    measure(!physics.initialized)\n''',
)

# 3) Reminder personal state: make rapid toggles deterministic even before React
# finishes the next render, and keep updatedAt strictly monotonic.
replace_once(
    'src/todo.jsx',
    '''  const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))\n  const [bootTodos, setBootTodos] = useState(() => readVisibleTodosCache(profile) ?? mergeSharedTodos(readSharedTodosCache(profile), readPersonalTodoStateCache(profile)))\n''',
    '''  const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))\n  const personalStateRef = useRef(personalState)\n  const [bootTodos, setBootTodos] = useState(() => readVisibleTodosCache(profile) ?? mergeSharedTodos(readSharedTodosCache(profile), readPersonalTodoStateCache(profile)))\n''',
)
replace_once(
    'src/todo.jsx',
    '''      sharedTodosRef.current = []\n      setSharedTodos([])\n      setPersonalState({})\n      return undefined\n''',
    '''      sharedTodosRef.current = []\n      personalStateRef.current = {}\n      setSharedTodos([])\n      setPersonalState({})\n      return undefined\n''',
)
replace_once(
    'src/todo.jsx',
    '''    sharedTodosRef.current = cachedShared\n    setSharedTodos(cachedShared)\n    setPersonalState(cachedPersonal)\n''',
    '''    sharedTodosRef.current = cachedShared\n    personalStateRef.current = cachedPersonal\n    setSharedTodos(cachedShared)\n    setPersonalState(cachedPersonal)\n''',
)
replace_once(
    'src/todo.jsx',
    '''      sharedTodosRef.current = nextShared\n      setSharedTodos(nextShared)\n      setPersonalState(nextPersonal)\n''',
    '''      sharedTodosRef.current = nextShared\n      personalStateRef.current = nextPersonal\n      setSharedTodos(nextShared)\n      setPersonalState(nextPersonal)\n''',
)
replace_once(
    'src/todo.jsx',
    '''        remotePersonalRef.current = next\n        if (firstRemoteReadyRef.current) setPersonalState(next)\n        else commitFirstRemotePair()\n''',
    '''        remotePersonalRef.current = next\n        personalStateRef.current = next\n        if (firstRemoteReadyRef.current) setPersonalState(next)\n        else commitFirstRemotePair()\n''',
)
old_personal_block = '''  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {\n    setPersonalState((current) => {\n      const next = { ...current, [id]: nextEntry }\n      writePersonalTodoStateCache(profile, next)\n      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(sharedTodos, next))\n      writeVisibleTodosCache(profile, nextVisible)\n      if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)\n      return next\n    })\n    writeStudentTodoState(profile, id, nextEntry).catch((error) => {\n      console.error('Personal reminder state save failed:', error)\n      setPersonalState((current) => {\n        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current\n        const next = { ...current }\n        if (previousEntry) next[id] = previousEntry\n        else delete next[id]\n        writePersonalTodoStateCache(profile, next)\n        const nextVisible = mergeSharedTodos(sharedTodos, next)\n        writeVisibleTodosCache(profile, nextVisible)\n        if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)\n        return next\n      })\n    })\n  }\n\n  function toggleTodo(id) {\n    const target = todos.find((todo) => todo.id === id)\n    if (!target) return\n    const previousEntry = personalState[id] || null\n    const nextEntry = {\n      completed: !target.completed,\n      hidden: false,\n      updatedAt: Date.now(),\n    }\n    updatePersonalStateOnServer(id, nextEntry, previousEntry)\n  }\n\n  function removeTodo(id) {\n    const previousEntry = personalState[id] || null\n    const nextEntry = {\n      completed: Boolean(previousEntry?.completed),\n      hidden: true,\n      updatedAt: Date.now(),\n    }\n    updatePersonalStateOnServer(id, nextEntry, previousEntry)\n  }\n'''
new_personal_block = '''  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {\n    personalStateRef.current = { ...personalStateRef.current, [id]: nextEntry }\n    setPersonalState((current) => {\n      const next = { ...current, [id]: nextEntry }\n      writePersonalTodoStateCache(profile, next)\n      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(sharedTodosRef.current, next))\n      writeVisibleTodosCache(profile, nextVisible)\n      if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)\n      return next\n    })\n    writeStudentTodoState(profile, id, nextEntry).catch((error) => {\n      console.error('Personal reminder state save failed:', error)\n      setPersonalState((current) => {\n        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current\n        const next = { ...current }\n        if (previousEntry) next[id] = previousEntry\n        else delete next[id]\n        personalStateRef.current = next\n        writePersonalTodoStateCache(profile, next)\n        const nextVisible = mergeSharedTodos(sharedTodosRef.current, next)\n        writeVisibleTodosCache(profile, nextVisible)\n        if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)\n        return next\n      })\n    })\n  }\n\n  function nextPersonalUpdatedAt(previousEntry) {\n    return Math.max(Date.now(), Number(previousEntry?.updatedAt || 0) + 1)\n  }\n\n  function toggleTodo(id) {\n    const target = sharedTodosRef.current.find((todo) => todo.id === id)\n    if (!target) return\n    const previousEntry = personalStateRef.current[id] || null\n    const nextEntry = {\n      completed: !Boolean(previousEntry?.completed),\n      hidden: false,\n      updatedAt: nextPersonalUpdatedAt(previousEntry),\n    }\n    updatePersonalStateOnServer(id, nextEntry, previousEntry)\n  }\n\n  function removeTodo(id) {\n    const previousEntry = personalStateRef.current[id] || null\n    const nextEntry = {\n      completed: Boolean(previousEntry?.completed),\n      hidden: true,\n      updatedAt: nextPersonalUpdatedAt(previousEntry),\n    }\n    updatePersonalStateOnServer(id, nextEntry, previousEntry)\n  }\n'''
replace_once('src/todo.jsx', old_personal_block, new_personal_block)

# 4) Reminder row motion: preserve the first exit animation, but never throw away
# a second completion/cancel tap or a delete tap that arrives during the settle.
replace_once(
    'src/todo-stage5-ai.jsx',
    '  const rowMotionRef = useRef(new Set())\n',
    '  const rowMotionRef = useRef(new Map())\n',
)
old_row_motion = '''  function beginRowExit(id, action) {\n    if (!id || rowMotionRef.current.has(id)) return\n    rowMotionRef.current.add(id)\n    setRowMotion((current) => ({ ...current, [id]: 'leaving' }))\n\n    window.setTimeout(() => {\n      if (action === 'toggle') toggleTodo(id)\n      else removeTodo(id)\n\n      if (action === 'toggle') {\n        setRowMotion((current) => ({ ...current, [id]: 'entering' }))\n        window.setTimeout(() => {\n          rowMotionRef.current.delete(id)\n          setRowMotion((current) => {\n            const next = { ...current }\n            delete next[id]\n            return next\n          })\n        }, 420)\n      } else {\n        rowMotionRef.current.delete(id)\n        setRowMotion((current) => {\n          const next = { ...current }\n          delete next[id]\n          return next\n        })\n      }\n    }, 280)\n  }\n'''
new_row_motion = '''  function beginRowExit(id, action) {\n    if (!id) return\n    const existing = rowMotionRef.current.get(id)\n    if (existing) {\n      if (action === 'toggle' && existing.action === 'toggle') {\n        if (existing.executed) toggleTodo(id)\n        else existing.queuedToggle = !existing.queuedToggle\n      } else if (action === 'delete' && existing.executed) {\n        removeTodo(id)\n        rowMotionRef.current.delete(id)\n        setRowMotion((current) => {\n          const next = { ...current }\n          delete next[id]\n          return next\n        })\n      }\n      return\n    }\n\n    const motionState = { action, executed: false, queuedToggle: false }\n    rowMotionRef.current.set(id, motionState)\n    setRowMotion((current) => ({ ...current, [id]: 'leaving' }))\n\n    window.setTimeout(() => {\n      motionState.executed = true\n      if (action === 'toggle') {\n        toggleTodo(id)\n        if (motionState.queuedToggle) toggleTodo(id)\n      } else {\n        removeTodo(id)\n      }\n\n      if (action === 'toggle') {\n        setRowMotion((current) => ({ ...current, [id]: 'entering' }))\n        window.setTimeout(() => {\n          rowMotionRef.current.delete(id)\n          setRowMotion((current) => {\n            const next = { ...current }\n            delete next[id]\n            return next\n          })\n        }, 420)\n      } else {\n        rowMotionRef.current.delete(id)\n        setRowMotion((current) => {\n          const next = { ...current }\n          delete next[id]\n          return next\n        })\n      }\n    }, 280)\n  }\n'''
replace_once('src/todo-stage5-ai.jsx', old_row_motion, new_row_motion)
replace_once(
    'src/todo-stage5.css',
    '''.todo-stage5 .todo-item.is-state-leaving {\n  pointer-events: none;\n  overflow: hidden;\n  animation: reminder-row-collapse 280ms cubic-bezier(0.4, 0, 1, 1) both !important;\n}\n''',
    '''.todo-stage5 .todo-item.is-state-leaving {\n  pointer-events: none;\n  overflow: hidden;\n  animation: reminder-row-collapse 280ms cubic-bezier(0.4, 0, 1, 1) both !important;\n}\n\n.todo-stage5 .todo-item.is-state-leaving .todo-check {\n  pointer-events: auto;\n  touch-action: manipulation;\n}\n''',
)

# 5) Saving: keep the modal mounted and protected until the server confirms the
# write. This prevents a fast tab switch from discarding a failed draft/error.
replace_once(
    'src/todo-stage5-ai.jsx',
    '''    })\n    setSheetOpen(false)\n\n    try {\n      const savedId = await savePromise\n      if (!savedId) {\n        setSheetOpen(true)\n        return\n      }\n      pendingCreateIdRef.current = ''\n      if (files.length) void finishReminderEnrichment(savedId, text, files, summaryPromise)\n''',
    '''    })\n\n    try {\n      const savedId = await savePromise\n      if (!savedId) return\n      pendingCreateIdRef.current = ''\n      setSheetOpen(false)\n      if (files.length) void finishReminderEnrichment(savedId, text, files, summaryPromise)\n''',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''      console.error('Shared reminder save failed:', error)\n      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')\n      setSheetOpen(true)\n    } finally {\n''',
    '''      console.error('Shared reminder save failed:', error)\n      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')\n    } finally {\n''',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''    const savePromise = saveTodo(createId ? { ...draftToSave, createId } : draftToSave)\n    setSheetOpen(false)\n\n    try {\n      const savedId = await savePromise\n      if (!savedId) {\n        setSheetOpen(true)\n        return\n      }\n      pendingCreateIdRef.current = ''\n      if (createId && files.length) {\n''',
    '''    const savePromise = saveTodo(createId ? { ...draftToSave, createId } : draftToSave)\n\n    try {\n      const savedId = await savePromise\n      if (!savedId) return\n      pendingCreateIdRef.current = ''\n      setSheetOpen(false)\n      if (createId && files.length) {\n''',
)
# The manual-save catch is the second identical catch block; after the natural
# replacement above, exactly one setSheetOpen(true) in that message path remains.
regex_once(
    'src/todo-stage5-ai.jsx',
    r"(async function submitManual\(\)[\s\S]*?console\.error\('Shared reminder save failed:', error\)\n\s*setServerSaveError\('서버에 저장하지 못했어\. 인터넷 연결을 확인하고 다시 눌러줘\.'\)\n)\s*setSheetOpen\(true\)\n",
    r"\1",
)

# 6) Native date/time hit targets: keep the native control fully hit-testable.
# The display text stays custom, but the input is no longer an opacity:0 layer.
replace_once(
    'src/todo.css',
    '''  background: transparent;\n  color: transparent;\n  -webkit-text-fill-color: transparent;\n  caret-color: transparent;\n  opacity: 0;\n  font: inherit;\n''',
    '''  background: transparent;\n  color: transparent;\n  -webkit-text-fill-color: transparent;\n  caret-color: transparent;\n  opacity: 1;\n  pointer-events: auto;\n  touch-action: manipulation;\n  cursor: pointer;\n  font: inherit;\n''',
)
insert_after = '''.todo-sheet .todo-control-shell > input[type="date"]:focus,\n.todo-sheet .todo-control-shell > input[type="time"]:focus {\n  border: 0;\n  outline: 0;\n}\n'''
replacement = insert_after + '''\n.todo-sheet .todo-control-shell > input[type="date"]::-webkit-calendar-picker-indicator,\n.todo-sheet .todo-control-shell > input[type="time"]::-webkit-calendar-picker-indicator {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  padding: 0;\n  opacity: 0;\n  cursor: pointer;\n}\n'''
replace_once('src/todo.css', insert_after, replacement)

replace_once(
    'src/academic-shared.css',
    '''  padding: 0 !important;\n  border: 0 !important;\n  opacity: 0;\n  appearance: none;\n  -webkit-appearance: none;\n  cursor: pointer;\n}\n''',
    '''  padding: 0 !important;\n  border: 0 !important;\n  background: transparent;\n  color: transparent;\n  -webkit-text-fill-color: transparent;\n  opacity: 1;\n  pointer-events: auto;\n  touch-action: manipulation;\n  cursor: pointer;\n}\n\n.academic-date-control > input[type="date"]::-webkit-calendar-picker-indicator {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  padding: 0;\n  opacity: 0;\n  cursor: pointer;\n}\n''',
)

# 7) The home-card navigation enhancer remains for behavior compatibility, but
# coalesces DOM mutations into one frame and no longer rewrites React labels.
write('public/school-home-nav.js', '''(() => {\n  const TARGETS = [\n    { navIndex: 2, label: '시간표 열기' },\n    { navIndex: 1, label: '리마인더 열기' },\n    { navIndex: 2, label: '시간표 열기' },\n    { navIndex: 4, label: '학사일정 열기' },\n    { navIndex: 3, label: '급식 열기' },\n  ]\n  let frame = 0\n\n  function activateNav(index) {\n    const buttons = document.querySelectorAll('.bottom-nav .nav-button')\n    buttons[index]?.click()\n  }\n\n  function enhanceHome() {\n    const items = document.querySelectorAll('.home-stack > *')\n    if (!items.length) return\n\n    TARGETS.forEach((target, index) => {\n      const item = items[index]\n      if (!item || item.dataset.homeNavReady === 'true') return\n\n      item.dataset.homeNavReady = 'true'\n      item.setAttribute('role', 'button')\n      item.setAttribute('tabindex', '0')\n      item.setAttribute('aria-label', target.label)\n      item.style.cursor = 'pointer'\n      item.style.touchAction = 'manipulation'\n\n      item.addEventListener('click', () => activateNav(target.navIndex))\n      item.addEventListener('keydown', (event) => {\n        if (event.key !== 'Enter' && event.key !== ' ') return\n        event.preventDefault()\n        activateNav(target.navIndex)\n      })\n    })\n  }\n\n  function scheduleEnhance() {\n    if (frame) return\n    frame = window.requestAnimationFrame(() => {\n      frame = 0\n      enhanceHome()\n    })\n  }\n\n  const observer = new MutationObserver(scheduleEnhance)\n  observer.observe(document.documentElement, { childList: true, subtree: true })\n  window.addEventListener('pagehide', () => {\n    observer.disconnect()\n    if (frame) window.cancelAnimationFrame(frame)\n  }, { once: true })\n  scheduleEnhance()\n})()\n''')

# 8) Remove truly unused/overridden legacy runtime files and old patch machinery.
replace_once(
    'index.html',
    '    <link rel="stylesheet" href="./samsung-apple-nav-icons.css" />\n',
    '',
)
replace_once(
    'public/sw.js',
    "const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-android.svg', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './first-run-notice.css', './samsung-apple-nav-icons.css', './samsung-nav-icon-fixes.css', './samsung-nav-meal.svg', './samsung-nav-academic.svg', './school-timetable-motion.js', './school-home-nav.js', './first-run-notice.js', './notification-routing.js']\n",
    "const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-android.svg', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './first-run-notice.css', './samsung-nav-icon-fixes.css', './school-timetable-motion.js', './school-home-nav.js', './school-home-live.js', './first-run-notice.js', './notification-routing.js']\n",
)

for relative in [
    'public/reminder-sheet.css',
    'public/reminder-sheet.js',
    'public/school-sheet.css',
    'public/school-sheet.js',
    'public/icon-v117.svg',
    'public/samsung-apple-nav-icons.css',
    'public/samsung-nav-meal.svg',
    'public/samsung-nav-academic.svg',
    'src/unread-indicators.js',
]:
    target = ROOT / relative
    if not target.exists():
        raise SystemExit(f'Expected legacy file is already missing: {relative}')
    target.unlink()

# 9) One permanent deploy workflow: test frontend + reminder backend before Pages.
write('.github/workflows/deploy.yml', '''# GitHub Pages deployment and regression gate\nname: Deploy School PWA\n\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: pages\n  cancel-in-progress: true\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n\n      - name: Setup Node\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22\n\n      - name: Install app dependencies\n        run: npm ci\n\n      - name: Test app\n        run: npm test\n\n      - name: Build app\n        run: npm run build\n\n      - name: Install reminder backend dependencies\n        working-directory: push-backend-v2\n        run: npm ci\n\n      - name: Test reminder backend\n        working-directory: push-backend-v2\n        run: npm test\n\n      - name: Configure Pages\n        uses: actions/configure-pages@v5\n\n      - name: Upload artifact\n        uses: actions/upload-pages-artifact@v3\n        with:\n          path: ./dist\n\n  deploy:\n    environment:\n      name: github-pages\n      url: ${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    needs: build\n    steps:\n      - name: Deploy to GitHub Pages\n        id: deployment\n        uses: actions/deploy-pages@v4\n''')

# 10) Repository-level regression guards for the pieces that previously drifted.
write('tests/repository-structure.test.js', '''import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { existsSync, readdirSync, readFileSync } from 'node:fs'\nimport { resolve } from 'node:path'\n\nconst root = process.cwd()\nconst text = (path) => readFileSync(resolve(root, path), 'utf8')\n\ntest('only the permanent deployment workflow remains', () => {\n  const workflows = readdirSync(resolve(root, '.github/workflows')).filter((name) => /\\.ya?ml$/.test(name)).sort()\n  assert.deepEqual(workflows, ['deploy.yml'])\n  assert.equal(existsSync(resolve(root, '.github/scripts')), false)\n})\n\ntest('bottom navigation uses one five-tab count and mobile touch intent', () => {\n  const styles = text('src/styles.css')\n  const main = text('src/main.jsx')\n  assert.match(styles, /--nav-count:\\s*5;/)\n  assert.match(styles, /grid-template-columns:\\s*repeat\\(var\\(--nav-count, 5\\)/)\n  assert.doesNotMatch(styles, /\\.bottom-nav[\\s\\S]{0,700}grid-template-columns:\\s*repeat\\(4,/)\n  assert.match(main, /'--nav-count': tabs\\.length/)\n  assert.match(main, /onPointerDown=/)\n})\n\ntest('closing sheets still intercept taps', () => {\n  const css = text('src/unified-sheet.css')\n  assert.match(css, /\\.unified-sheet-backdrop\\.is-closing\\s*\\{[\\s\\S]*?pointer-events:\\s*auto;/)\n})\n\ntest('native date and time controls remain hit-testable', () => {\n  const todo = text('src/todo.css')\n  const academic = text('src/academic-shared.css')\n  assert.match(todo, /todo-control-shell[\\s\\S]*?touch-action:\\s*manipulation;/)\n  assert.match(academic, /academic-date-control > input\\[type="date"\\][\\s\\S]*?touch-action:\\s*manipulation;/)\n})\n\ntest('service-worker app shell only references files that exist', () => {\n  const sw = text('public/sw.js')\n  const match = sw.match(/const APP_SHELL = \\[(.*?)\\]/s)\n  assert.ok(match)\n  const paths = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])\n  for (const path of paths) {\n    if (path === './') {\n      assert.ok(existsSync(resolve(root, 'index.html')))\n      continue\n    }\n    assert.ok(existsSync(resolve(root, 'public', path.replace(/^\\.\\//, ''))), `Missing cached file: ${path}`)\n  }\n})\n\ntest('retired duplicate runtime files stay removed', () => {\n  for (const path of [\n    'public/reminder-sheet.css',\n    'public/reminder-sheet.js',\n    'public/school-sheet.css',\n    'public/school-sheet.js',\n    'public/icon-v117.svg',\n    'public/samsung-apple-nav-icons.css',\n    'src/unread-indicators.js',\n  ]) assert.equal(existsSync(resolve(root, path)), false, path)\n})\n''')

# 11) README now describes the live architecture instead of old stage assumptions.
write('README.md', '''# S-Hub\n\n우리 반에서 사용하는 React + Vite 기반 학교생활 PWA. iPhone을 우선으로 하고 Samsung Internet/Android와 iPad까지 같은 코드베이스에서 대응한다.\n\n## 현재 핵심 기능\n\n- 5탭 하단 내비게이션: 홈 · 리마인더 · 시간표 · 급식 · 학사일정\n- 반 공유 데이터: 시간표, 리마인더 원본, 학사일정, 변경 활동\n- 개인 데이터: 리마인더 완료/숨김 상태와 읽음 상태\n- 리마인더 자연어/첨부 AI 분석\n- NEIS 급식·학사 데이터\n- Web Push 및 예약 리마인더 알림\n- GitHub Pages PWA + Firebase/Firestore + Vercel 알림 백엔드\n\n## 리마인더 상태 규칙\n\n- `completed=true, hidden=false`: 이 학생은 완료했지만 리마인더 구독은 유지한다. 친구가 수정하면 수정 내용, unread 점, 수정 푸시를 다시 받을 수 있다.\n- `hidden=true`: 이 학생에게서는 완전히 숨긴 상태다. 친구가 수정해도 목록, unread 점, 수정 푸시가 다시 나타나면 안 된다.\n- 시간이 있는 리마인더는 해당 KST 시각에, 시간이 없는 리마인더는 해당 날짜 23:59:59 KST에 만료한다.\n\n## 코드 지도\n\n### 앱\n\n- `src/main.jsx`: 앱 셸, 온보딩, 5탭 내비게이션, 홈/시간표 진입점\n- `src/todo.js`: 리마인더 공개 API 조합. 활성 리마인더의 반 전체 삭제와 완료 항목의 개인 삭제를 구분한다.\n- `src/todo.jsx`: 공유 리마인더 + 학생 개인 상태 동기화와 만료 처리\n- `src/todo-stage5-ai.jsx`: 리마인더 화면, 입력/편집, AI 추가 UI\n- `src/reminder-lifecycle.js`: 리마인더 만료/개인 표시 여부의 단일 규칙\n- `src/school-sync.js`: Firebase 인증 및 공유/개인 데이터 접근\n- `src/class-activity.js`: 반 활동/수정자 기록\n- `src/unread-indicators-v2.js`: 탭/리마인더 unread 점\n- `src/push-client.js`: Push 구독과 활동 알림 dispatch\n- `src/unified-sheet.jsx`: 공통 bottom sheet 동작\n\n### 스타일\n\n- `src/styles.css`: 앱 셸과 하단 내비게이션\n- `src/motion.css`: 공통 모션\n- `src/todo.css`, `src/todo-stage5.css`: 리마인더\n- `src/timetable.css`: 시간표\n- `src/stage3.css`: 급식/학교 데이터 UI\n- `src/academic-shared.css`: 학사일정\n- `src/unified-sheet.css`: 공통 bottom sheet\n- `public/*.css`: 앱 위에 얹는 소수의 기기/모션 보정만 둔다. 사용하지 않는 옛 패치 스타일은 보관하지 않는다.\n\n### 백엔드\n\n- `push-backend-v2/`: 예약 리마인더와 리마인더 활동 Push 백엔드\n- `firestore.rules`: Firestore 규칙 원본\n- `public/sw.js`: PWA 캐시와 Push 표시/알림 탭 라우팅\n\n## 수정 원칙\n\n1. 현재 `main`의 동작을 기준으로 필요한 범위만 수정한다.\n2. 공유 상태와 개인 상태를 섞지 않는다.\n3. 하단 탭 수는 React의 `tabs.length`와 CSS `--nav-count`를 통해 한 경로로 유지한다.\n4. bottom sheet가 닫히는 동안 뒤 화면으로 터치가 관통하면 안 된다.\n5. 모바일 native date/time input은 실제 hit target을 유지한다.\n6. 일회성 패치 스크립트/워크플로는 작업이 끝난 뒤 저장소에 남기지 않는다.\n7. 배포 전에 프론트 테스트, 프로덕션 빌드, 알림 백엔드 테스트를 모두 통과해야 한다.\n\n## 검증\n\n```bash\nnpm ci\nnpm test\nnpm run build\n\ncd push-backend-v2\nnpm ci\nnpm test\n```\n\n`main`에 push되면 `.github/workflows/deploy.yml`이 같은 검증을 다시 수행한 뒤 GitHub Pages에 배포한다.\n''')

# Delete every historical one-off patch workflow/script, including this temporary
# guarded runner, leaving only deploy.yml. This happens after the script has loaded,
# so deleting this file does not interrupt the current process on Linux.
workflows_dir = ROOT / '.github/workflows'
for path in list(workflows_dir.glob('*.yml')) + list(workflows_dir.glob('*.yaml')):
    if path.name != 'deploy.yml':
        path.unlink()

scripts_dir = ROOT / '.github/scripts'
for path in list(scripts_dir.glob('*')):
    if path.is_file():
        path.unlink()
if scripts_dir.exists() and not any(scripts_dir.iterdir()):
    scripts_dir.rmdir()
