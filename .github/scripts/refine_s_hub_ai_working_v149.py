from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    write(path, text.replace(old, new, 1))

sheet = 'src/s-hub-ai-sheet.jsx'
css = 'src/s-hub-ai.css'

replace_once(sheet, "const NOTICE_HINTS = [\n  '공지에 대해 덧붙일 설명이 있으면 적어줘.',\n  '예: 이건 수행평가 공지야.',\n  '예: 마감일과 준비물만 찾아줘.',\n  '예: 시간표 변경도 같이 확인해줘.',\n]\n", "const NOTICE_HINTS = [\n  '공지에 대해 덧붙일 설명이 있으면 적어줘.',\n  '예: 이건 수행평가 공지야.',\n  '예: 마감일과 준비물만 찾아줘.',\n  '예: 시간표 변경도 같이 확인해줘.',\n]\n\nconst WORKING_MESSAGES = {\n  image: ['사진을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],\n  file: ['파일을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],\n  mixed: ['사진과 파일을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],\n  question: ['S-Hub 정보를 확인하는 중…', '관련 일정을 찾는 중…', '답변을 정리하는 중…'],\n  conflict: ['기존 일정과 겹치는지 확인하는 중…', '추가할 위치를 확인하는 중…'],\n}\n\nfunction noticeWorkingMode(files) {\n  const hasImage = files.some((file) => String(file?.type || '').startsWith('image/'))\n  const hasOther = files.some((file) => !String(file?.type || '').startsWith('image/'))\n  if (hasImage && hasOther) return 'mixed'\n  return hasImage ? 'image' : 'file'\n}\n")

replace_once(sheet, "  const [hintIndex, setHintIndex] = useState(0)\n  const [hintFading, setHintFading] = useState(false)\n", "  const [hintIndex, setHintIndex] = useState(0)\n  const [hintFading, setHintFading] = useState(false)\n  const [workingMode, setWorkingMode] = useState('question')\n  const [workingMessageIndex, setWorkingMessageIndex] = useState(0)\n  const [workingMessageFading, setWorkingMessageFading] = useState(false)\n")

replace_once(sheet, "    setHintIndex(0)\n    setHintFading(false)\n  }, [open])\n", "    setHintIndex(0)\n    setHintFading(false)\n    setWorkingMode('question')\n    setWorkingMessageIndex(0)\n    setWorkingMessageFading(false)\n  }, [open])\n")

needle = "  }, [open, input, files.length])\n\n  const selectedItems = useMemo"
insert = "  }, [open, input, files.length])\n\n  useEffect(() => {\n    if (!working) {\n      setWorkingMessageFading(false)\n      return undefined\n    }\n\n    const pool = WORKING_MESSAGES[workingMode] || WORKING_MESSAGES.question\n    let swapTimer = 0\n    let fadeTimer = 0\n\n    const scheduleSwap = () => {\n      const delay = 1550 + Math.round(Math.random() * 850)\n      swapTimer = window.setTimeout(() => {\n        setWorkingMessageFading(true)\n        fadeTimer = window.setTimeout(() => {\n          setWorkingMessageIndex((current) => (current + 1) % pool.length)\n          setWorkingMessageFading(false)\n          scheduleSwap()\n        }, 180)\n      }, delay)\n    }\n\n    scheduleSwap()\n    return () => {\n      window.clearTimeout(swapTimer)\n      window.clearTimeout(fadeTimer)\n    }\n  }, [working, workingMode])\n\n  const selectedItems = useMemo"
replace_once(sheet, needle, insert)

replace_once(sheet, "  const hintPool = files.length ? NOTICE_HINTS : QUESTION_HINTS\n  const rotatingHint = hintPool[hintIndex % hintPool.length]\n", "  const hintPool = files.length ? NOTICE_HINTS : QUESTION_HINTS\n  const rotatingHint = hintPool[hintIndex % hintPool.length]\n  const workingPool = WORKING_MESSAGES[workingMode] || WORKING_MESSAGES.question\n  const workingMessage = workingPool[workingMessageIndex % workingPool.length]\n")

replace_once(sheet, "  function cancelAIRequest() {\n    requestSequenceRef.current += 1\n    requestControllerRef.current?.abort()\n    requestControllerRef.current = null\n    setWorking(false)\n  }\n", "  function cancelAIRequest() {\n    requestSequenceRef.current += 1\n    requestControllerRef.current?.abort()\n    requestControllerRef.current = null\n    setWorking(false)\n    setWorkingMessageFading(false)\n  }\n\n  function showWorkingMode(mode) {\n    setWorkingMode(mode)\n    setWorkingMessageIndex(0)\n    setWorkingMessageFading(false)\n  }\n")

replace_once(sheet, "    const { controller, requestId } = beginAIRequest()\n    setWorking(true)\n    setError('')\n    setEditingId('')\n    try {\n      const result = await analyzeSchoolNotice", "    const { controller, requestId } = beginAIRequest()\n    showWorkingMode(noticeWorkingMode(files))\n    setWorking(true)\n    setError('')\n    setEditingId('')\n    try {\n      const result = await analyzeSchoolNotice")

replace_once(sheet, "      const items = result.items\n      const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })\n", "      const items = result.items\n      showWorkingMode('conflict')\n      const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })\n")

replace_once(sheet, "    const { controller, requestId } = beginAIRequest()\n    setWorking(true)\n    setError('')\n    setEditingId('')\n    try {\n      const result = await askSchoolHub", "    const { controller, requestId } = beginAIRequest()\n    showWorkingMode('question')\n    setWorking(true)\n    setError('')\n    setEditingId('')\n    try {\n      const result = await askSchoolHub")

replace_once(sheet, "        {working ? (\n          <div className=\"s-hub-ai-thinking-stage\" role=\"status\" aria-label=\"S-Hub AI가 생각 중\">\n            <SHubAIOrb size={30} active />\n          </div>\n        ) : null}\n\n        {state.mode === 'answer' ? (", "        {working ? (\n          <div className=\"s-hub-ai-thinking-stage\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\">\n            <SHubAIOrb size={38} active />\n            <p className={`s-hub-ai-thinking-copy ${workingMessageFading ? 'is-fading' : ''}`.trim()}>{workingMessage}</p>\n          </div>\n        ) : null}\n\n        {!working && state.mode === 'answer' ? (")

replace_once(sheet, "        {state.mode === 'compose' || state.mode === 'answer' ? (", "        {!working && (state.mode === 'compose' || state.mode === 'answer') ? (")

replace_once(css, ".s-hub-ai-thinking-stage {\n  min-height: 32px;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  padding: 0 2px;\n  margin: -8px 0 -2px;\n  color: var(--text-secondary);\n  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;\n}\n", ".s-hub-ai-thinking-stage {\n  min-height: 118px;\n  display: grid;\n  place-items: center;\n  align-content: center;\n  gap: 11px;\n  padding: 13px 0 9px;\n  margin: -3px 0 0;\n  color: var(--text-secondary);\n  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;\n}\n\n.s-hub-ai-thinking-copy {\n  min-height: 19px;\n  margin: 0;\n  color: var(--text-secondary);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 1.45;\n  letter-spacing: -0.018em;\n  text-align: center;\n  opacity: 1;\n  transform: translate3d(0, 0, 0);\n  transition: opacity 180ms var(--motion-soft), transform 180ms var(--motion-soft);\n}\n\n.s-hub-ai-thinking-copy.is-fading {\n  opacity: 0;\n  transform: translate3d(0, 2px, 0);\n}\n")

# Advance service worker cache and its two existing regression guards.
replace_once('public/sw.js', "school-shell-v148", "school-shell-v149")
for path in ['tests/s-hub-ai-auth.test.js', 'tests/s-hub-ai-server-route.test.js']:
    replace_once(path, "school-shell-v148", "school-shell-v149")

# Keep the existing orb identity regression aligned with the compact working-stage size.
replace_once('tests/reminder-original-scroll-ai-orb.test.js', "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{30\\} active/)", "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{38\\} active/)")

working_test = """import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\n\nconst read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')\n\ntest('S-Hub AI replaces the compose UI with a compact live working stage', () => {\n  const sheet = read('src/s-hub-ai-sheet.jsx')\n  const css = read('src/s-hub-ai.css')\n\n  assert.match(sheet, /!working && \\(state\\.mode === 'compose' \\|\\| state\\.mode === 'answer'\\)/)\n  assert.match(sheet, /!working && state\\.mode === 'answer'/)\n  assert.match(sheet, /<SHubAIOrb size=\\{38\\} active/)\n  assert.match(sheet, /aria-live=\\"polite\\"/)\n  assert.match(css, /\\.s-hub-ai-thinking-stage\\s*\\{[\\s\\S]*?min-height:\\s*118px;/)\n})\n\ntest('working copy reflects attachment type and real conflict-review stage', () => {\n  const sheet = read('src/s-hub-ai-sheet.jsx')\n\n  assert.match(sheet, /사진을 분석하는 중…/)\n  assert.match(sheet, /파일을 분석하는 중…/)\n  assert.match(sheet, /사진과 파일을 분석하는 중…/)\n  assert.match(sheet, /학교 일정을 찾는 중…/)\n  assert.match(sheet, /날짜와 내용을 확인하는 중…/)\n  assert.match(sheet, /showWorkingMode\\('conflict'\\)[\\s\\S]*?reviewSchoolImportConflicts/)\n  assert.match(sheet, /기존 일정과 겹치는지 확인하는 중…/)\n})\n\ntest('working copy changes softly at a non-rigid cadence and remains cancellable', () => {\n  const sheet = read('src/s-hub-ai-sheet.jsx')\n  const css = read('src/s-hub-ai.css')\n\n  assert.match(sheet, /1550 \\+ Math\\.round\\(Math\\.random\\(\\) \\* 850\\)/)\n  assert.match(sheet, /setWorkingMessageFading\\(true\\)/)\n  assert.match(sheet, /requestControllerRef\\.current\\?\\.abort\\(\\)/)\n  assert.match(css, /transition: opacity 180ms[\\s\\S]*?transform 180ms/)\n})\n"""
path = ROOT / 'tests/s-hub-ai-working-stage.test.js'
if path.exists():
    raise SystemExit('tests/s-hub-ai-working-stage.test.js already exists')
path.write_text(working_test)

print('S-Hub AI working-stage refinement applied')
