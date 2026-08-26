import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}

{
  const path = 'src/todo-stage5-ai.jsx'
  let text = fs.readFileSync(path, 'utf8')

  text = replaceOnce(
    text,
    `  const [originalSaving, setOriginalSaving] = useState(false)\n  const [originalSaveError, setOriginalSaveError] = useState('')\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    `  const [originalSaving, setOriginalSaving] = useState(false)\n  const [originalSaveError, setOriginalSaveError] = useState('')\n  const [serverSaving, setServerSaving] = useState(false)\n  const [serverSaveError, setServerSaveError] = useState('')\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    'server save state',
  )

  text = replaceOnce(
    text,
    `  const aiRequestRef = useRef(0)`,
    `  const aiRequestRef = useRef(0)\n  const pendingCreateIdRef = useRef('')`,
    'pending attachment reminder id',
  )

  text = replaceOnce(
    text,
    `    setOriginalSaving(false)\n    setOriginalSaveError('')\n    setSummaryTodo(null)`,
    `    setOriginalSaving(false)\n    setOriginalSaveError('')\n    setServerSaving(false)\n    setServerSaveError('')\n    pendingCreateIdRef.current = ''\n    setSummaryTodo(null)`,
    'reset create server state',
  )

  text = replaceOnce(
    text,
    `    setAttachmentFile(null)\n    setSummaryTodo(null)\n    setDraft({`,
    `    setAttachmentFile(null)\n    setServerSaving(false)\n    setServerSaveError('')\n    pendingCreateIdRef.current = ''\n    setSummaryTodo(null)\n    setDraft({`,
    'reset edit server state',
  )

  text = replaceOnce(
    text,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    setOriginalSaveError('')\n    resetAI()\n  }`,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    setOriginalSaveError('')\n    setServerSaveError('')\n    pendingCreateIdRef.current = ''\n    resetAI()\n  }`,
    'attachment change resets pending save',
  )

  text = replaceOnce(
    text,
    `  async function submitNatural() {\n    if (!naturalResult?.title || !naturalResult?.dueDate || originalSaving) return\n    const createId = attachmentFile ? createTodoId() : ''`,
    `  async function submitNatural() {\n    if (!naturalResult?.title || !naturalResult?.dueDate || originalSaving || serverSaving) return\n    const createId = attachmentFile ? (pendingCreateIdRef.current || createTodoId()) : ''\n    if (createId) pendingCreateIdRef.current = createId`,
    'natural save guard and stable id',
  )

  text = replaceOnce(
    text,
    `    const savedId = saveTodo({\n      id: '',\n      createId,\n      type: naturalResult.type,\n      title: naturalResult.title,\n      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,\n    })\n    if (savedId) {\n      resetAI()\n      setSheetOpen(false)\n    }\n  }\n\n  function submitManual() {\n    const savedId = saveTodo(draft)\n    if (savedId) setSheetOpen(false)\n  }`,
    `    setServerSaving(true)\n    setServerSaveError('')\n    try {\n      const savedId = await saveTodo({\n        id: '',\n        createId,\n        type: naturalResult.type,\n        title: naturalResult.title,\n        dueDate: naturalResult.dueDate,\n        dueTime: naturalResult.dueTime || '',\n        summary: naturalResult.summary || null,\n        attachment: naturalResult.attachment || null,\n      })\n      if (!savedId) return\n      pendingCreateIdRef.current = ''\n      resetAI()\n      setSheetOpen(false)\n    } catch (error) {\n      console.error('Shared reminder save failed:', error)\n      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')\n    } finally {\n      setServerSaving(false)\n    }\n  }\n\n  async function submitManual() {\n    if (serverSaving) return\n    setServerSaving(true)\n    setServerSaveError('')\n    try {\n      const savedId = await saveTodo(draft)\n      if (savedId) setSheetOpen(false)\n    } catch (error) {\n      console.error('Shared reminder save failed:', error)\n      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')\n    } finally {\n      setServerSaving(false)\n    }\n  }`,
    'await active reminder UI saves',
  )

  text = replaceOnce(
    text,
    `  const saveDisabled = originalSaving || (sheetMode === 'natural'`,
    `  const saveDisabled = originalSaving || serverSaving || (sheetMode === 'natural'`,
    'disable during server save',
  )

  text = replaceOnce(
    text,
    `            <div className="change-submit-row">`,
    `            {serverSaveError ? <p className="change-warning">{serverSaveError}</p> : null}\n\n            <div className="change-submit-row">`,
    'server save error message',
  )

  text = replaceOnce(
    text,
    `                {originalSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}`,
    `                {originalSaving || serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}`,
    'server save button label',
  )

  fs.writeFileSync(path, text)
}

{
  const path = 'public/sw.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "const CACHE_NAME = 'school-shell-v94'", "const CACHE_NAME = 'school-shell-v95'", 'service worker refresh')
  fs.writeFileSync(path, text)
}

const todo = fs.readFileSync('src/todo-stage5-ai.jsx', 'utf8')
if ((todo.match(/const savedId = await saveTodo/g) || []).length !== 2) throw new Error('Expected both reminder save paths to await server')
if (!todo.includes('serverSaving') || !todo.includes('serverSaveError')) throw new Error('Missing reminder server save UI state')
if (!fs.readFileSync('public/sw.js', 'utf8').includes('school-shell-v95')) throw new Error('Service worker cache version was not updated')
