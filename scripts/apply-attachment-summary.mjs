import fs from 'node:fs'

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search)
  if (first < 0) throw new Error(`${label}: source not found`)
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source is not unique`)
  return source.slice(0, first) + replacement + source.slice(first + search.length)
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`)
  return source.replace(pattern, replacement)
}

const todoDataPath = 'src/todo.jsx'
const syncPath = 'src/school-sync.js'
const pagePath = 'src/todo-stage5-ai.jsx'
const summaryComponentPath = 'src/reminder-summary.jsx'
const aiPath = 'src/firebase-ai.js'
const rulesPath = 'firestore.rules'
const swPath = 'public/sw.js'

let todoData = fs.readFileSync(todoDataPath, 'utf8')
let sync = fs.readFileSync(syncPath, 'utf8')
let page = fs.readFileSync(pagePath, 'utf8')
let summaryComponent = fs.readFileSync(summaryComponentPath, 'utf8')
let ai = fs.readFileSync(aiPath, 'utf8')
let rules = fs.readFileSync(rulesPath, 'utf8')
let sw = fs.readFileSync(swPath, 'utf8')

const dataSanitizers = `const SUMMARY_MAX_SECTIONS = 14\nconst SUMMARY_MAX_ITEMS = 16\nconst ATTACHMENT_MAX_BYTES = 2_500_000\nconst ATTACHMENT_MIME_TYPES = new Set([\n  'application/pdf',\n  'application/json',\n  'text/plain',\n  'text/csv',\n  'text/rtf',\n  'text/html',\n  'text/xml',\n  'image/jpeg',\n  'image/png',\n  'image/webp',\n  'image/bmp',\n  'image/heic',\n  'image/heif',\n])\n\nfunction safeSummary(value) {\n  if (!value || typeof value !== 'object') return null\n  const overview = String(value.overview || '').trim().slice(0, 2400)\n  const sections = Array.isArray(value.sections)\n    ? value.sections.slice(0, SUMMARY_MAX_SECTIONS).map((section) => ({\n        heading: String(section?.heading || '').trim().slice(0, 80),\n        items: Array.isArray(section?.items)\n          ? section.items.slice(0, SUMMARY_MAX_ITEMS).map((item) => String(item || '').trim().slice(0, 700)).filter(Boolean)\n          : [],\n      })).filter((section) => section.heading && section.items.length)\n    : []\n  if (!overview && !sections.length) return null\n  return { overview, sections }\n}\n\nfunction safeAttachment(value) {\n  if (!value || typeof value !== 'object') return null\n  const name = String(value.name || '').trim().slice(0, 120)\n  const mimeType = String(value.mimeType || '').trim().toLowerCase()\n  const size = Number(value.size || 0)\n  if (!name || !ATTACHMENT_MIME_TYPES.has(mimeType)) return null\n  if (!Number.isInteger(size) || size <= 0 || size > ATTACHMENT_MAX_BYTES) return null\n  return { name, mimeType, size }\n}\n`

todoData = replaceOnce(
  todoData,
  `const TODO_STORAGE_KEY = 'school.todos.v1'\n`,
  `const TODO_STORAGE_KEY = 'school.todos.v1'\n\n${dataSanitizers}\n`,
  'todo data sanitizers',
)

todoData = replaceRegexOnce(
  todoData,
  /function safeTodos\(value\) \{[\s\S]*?\n\}\n\nfunction loadTodos/gu,
  `function safeTodos(value) {\n  if (!Array.isArray(value)) return []\n  return value\n    .filter((todo) => todo && typeof todo === 'object' && todo.id && todo.title && todo.dueDate)\n    .map((todo) => {\n      const summary = safeSummary(todo.summary)\n      const attachment = safeAttachment(todo.attachment)\n      return {\n        id: String(todo.id),\n        type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',\n        title: String(todo.title).slice(0, 80),\n        dueDate: String(todo.dueDate),\n        dueTime: String(todo.dueTime || ''),\n        completed: Boolean(todo.completed),\n        createdAt: Number(todo.createdAt || Date.now()),\n        ...(summary ? { summary } : {}),\n        ...(attachment ? { attachment } : {}),\n      }\n    })\n}\n\nfunction loadTodos`,
  'safe local todos',
)

todoData = replaceRegexOnce(
  todoData,
  /function sharedTodoShape\(todo\) \{[\s\S]*?\n\}\n\nfunction initialPersonalState/gu,
  `function sharedTodoShape(todo) {\n  const summary = safeSummary(todo.summary)\n  const attachment = safeAttachment(todo.attachment)\n  return {\n    id: String(todo.id),\n    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',\n    title: String(todo.title || '').trim().slice(0, 80),\n    dueDate: String(todo.dueDate || ''),\n    dueTime: String(todo.dueTime || ''),\n    createdAt: Number(todo.createdAt || Date.now()),\n    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),\n    ...(summary ? { summary } : {}),\n    ...(attachment ? { attachment } : {}),\n  }\n}\n\nfunction initialPersonalState`,
  'shared todo shape',
)

todoData = replaceOnce(
  todoData,
  `    const dueTime = String(input.dueTime || '')\n\n    if (input.id) {`,
  `    const dueTime = String(input.dueTime || '')\n    const summary = safeSummary(input.summary)\n    const attachment = safeAttachment(input.attachment)\n\n    if (input.id) {`,
  'save todo extra metadata',
)

todoData = replaceOnce(
  todoData,
  `        dueTime,\n        updatedAt: Date.now(),\n      }`,
  `        dueTime,\n        updatedAt: Date.now(),\n        ...(summary ? { summary } : {}),\n        ...(attachment ? { attachment } : {}),\n      }`,
  'edit summary metadata',
)

todoData = replaceOnce(
  todoData,
  `      dueTime,\n      createdAt: now,\n      updatedAt: now,\n    }`,
  `      dueTime,\n      createdAt: now,\n      updatedAt: now,\n      ...(summary ? { summary } : {}),\n      ...(attachment ? { attachment } : {}),\n    }`,
  'create summary metadata',
)

sync = replaceOnce(
  sync,
  `const MIGRATION_VERSION = 'v1'\n`,
  `const MIGRATION_VERSION = 'v1'\n\n${dataSanitizers}\n`,
  'sync data sanitizers',
)

sync = replaceRegexOnce(
  sync,
  /function safeSharedTodo\(todo\) \{[\s\S]*?\n\}\n\nexport function listenClassTodos/gu,
  `function safeSharedTodo(todo) {\n  if (!todo || typeof todo !== 'object') return null\n  const id = String(todo.id || '')\n  const title = String(todo.title || '').trim().slice(0, 80)\n  const dueDate = String(todo.dueDate || '')\n  if (!id || !title || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return null\n  const type = ['task', 'performance', 'exam', 'material'].includes(todo.type) ? todo.type : 'task'\n  const dueTime = /^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(todo.dueTime || '')) ? String(todo.dueTime) : ''\n  const summary = safeSummary(todo.summary)\n  const attachment = safeAttachment(todo.attachment)\n  return {\n    id,\n    type,\n    title,\n    dueDate,\n    dueTime,\n    createdAt: Number(todo.createdAt || Date.now()),\n    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),\n    ...(summary ? { summary } : {}),\n    ...(attachment ? { attachment } : {}),\n  }\n}\n\nexport function listenClassTodos`,
  'cloud shared todo sanitizer',
)

ai = replaceOnce(
  ai,
  `  'image/bmp',\n])`,
  `  'image/bmp',\n  'image/heic',\n  'image/heif',\n])`,
  'HEIC client support',
)

page = replaceOnce(
  page,
  `import { parseReminderWithAI } from './firebase-ai.js'\n`,
  `import { parseReminderWithAI } from './firebase-ai.js'\nimport { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'\n`,
  'summary component import',
)

page = replaceOnce(
  page,
  `    dueDate: dateKey(now),\n    dueTime: '',\n  }`,
  `    dueDate: dateKey(now),\n    dueTime: '',\n    summary: null,\n    attachment: null,\n  }`,
  'draft metadata',
)

page = replaceRegexOnce(
  page,
  /function ReminderRow\(\{ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete \}\) \{[\s\S]*?\n\}\n\nexport function TodoPage/gu,
  `function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary }) {\n  const dateLabel = dueDateLabel(todo)\n  const meta = dueMetaLabel(todo, now)\n  const content = (\n    <>\n      <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />\n      <AnimatedText as="strong" value={todo.title} delay={45} />\n      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}\n    </>\n  )\n\n  return (\n    <article\n      className={\`todo-item ${'${completed ? \'is-completed\' : \'\'}'} ${'${deleting ? \'is-deleting\' : \'\'}'}\`.trim()}\n      data-reminder-id={todo.id}\n    >\n      <button\n        className="todo-check"\n        aria-label={\`${'${todo.title}'} ${'${completed ? \'완료 취소\' : \'완료\'}'}\`}\n        onClick={() => onToggle(todo.id)}\n      >\n        <span />\n      </button>\n      {todo.summary ? (\n        <button\n          className="todo-item-main has-summary"\n          type="button"\n          aria-label={\`${'${todo.title}'} 요약 보기\`}\n          onClick={() => onOpenSummary(todo)}\n        >\n          {content}\n        </button>\n      ) : (\n        <div className="todo-item-main">{content}</div>\n      )}\n      <div className="todo-row-actions">\n        <span className="todo-date-text">{dateLabel}</span>\n        {completed ? (\n          <button\n            className="todo-permanent-delete"\n            type="button"\n            aria-label={\`${'${todo.title}'} 영구 삭제\`}\n            onClick={() => onDelete(todo.id)}\n          >\n            삭제\n          </button>\n        ) : (\n          <button\n            className="todo-edit-button"\n            type="button"\n            aria-label={\`${'${todo.title}'} 수정\`}\n            onClick={() => onEdit(todo)}\n          >\n            수정\n          </button>\n        )}\n      </div>\n    </article>\n  )\n}\n\nexport function TodoPage`,
  'summary-aware reminder row',
)

page = replaceOnce(
  page,
  `  const [aiError, setAiError] = useState(null)\n`,
  `  const [aiError, setAiError] = useState(null)\n  const [attachmentFile, setAttachmentFile] = useState(null)\n  const [summaryTodo, setSummaryTodo] = useState(null)\n`,
  'attachment and summary state',
)

page = replaceOnce(
  page,
  `  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])\n  const naturalResult = aiResult || localNaturalResult\n  const aiAdjusted = Boolean(aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))\n`,
  `  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])\n  const naturalResult = attachmentFile ? aiResult : (aiResult || localNaturalResult)\n  const aiAdjusted = Boolean(!attachmentFile && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))\n`,
  'attachment-aware natural result',
)

page = replaceRegexOnce(
  page,
  /  useEffect\(\(\) => \{\n    const text = naturalText\.trim\(\)[\s\S]*?\n  \}, \[naturalText, sheetOpen, sheetMode\]\)\n/gu,
  `  useEffect(() => {\n    const text = naturalText.trim()\n    const hasAttachment = Boolean(attachmentFile)\n    const requestId = aiRequestRef.current + 1\n    aiRequestRef.current = requestId\n    setAiResult(null)\n    setAiError(null)\n\n    if (!sheetOpen || sheetMode !== 'natural' || (!hasAttachment && text.length < 2)) {\n      setAiState('idle')\n      return undefined\n    }\n\n    setAiState('waiting')\n    const timer = window.setTimeout(async () => {\n      if (aiRequestRef.current !== requestId) return\n      setAiState('loading')\n\n      try {\n        const parsed = await parseReminderWithAI(text, new Date(), attachmentFile)\n        if (aiRequestRef.current !== requestId) return\n        if (parsed) setAiResult(parsed)\n        setAiError(null)\n        setAiState(parsed ? 'ready' : 'error')\n      } catch (error) {\n        if (aiRequestRef.current !== requestId) return\n        console.error('Reminder AI failed:', error)\n        setAiError({\n          name: error?.name || null,\n          code: error?.code || null,\n          message: error?.message || null,\n          status: error?.status || null,\n          customData: error?.customData ? JSON.stringify(error.customData) : null,\n        })\n        setAiState('error')\n      }\n    }, hasAttachment ? 420 : 650)\n\n    return () => window.clearTimeout(timer)\n  }, [naturalText, attachmentFile, sheetOpen, sheetMode])\n`,
  'attachment AI effect',
)

page = replaceOnce(
  page,
  `  function openCreate() {\n    setNaturalText('')\n    setDraft(emptyDraft(now))\n    setSheetMode('natural')\n    resetAI()\n    setSheetOpen(true)\n  }`,
  `  function openCreate() {\n    setNaturalText('')\n    setAttachmentFile(null)\n    setSummaryTodo(null)\n    setDraft(emptyDraft(now))\n    setSheetMode('natural')\n    resetAI()\n    setSheetOpen(true)\n  }`,
  'open create reset',
)

page = replaceOnce(
  page,
  `  function openEdit(todo) {\n    setNaturalText('')\n    setDraft({\n      id: todo.id,\n      type: todo.type,\n      title: todo.title,\n      dueDate: todo.dueDate,\n      dueTime: todo.dueTime || '',\n    })\n    setSheetMode('manual')\n    resetAI()\n    setSheetOpen(true)\n  }`,
  `  function openEdit(todo) {\n    setNaturalText('')\n    setAttachmentFile(null)\n    setSummaryTodo(null)\n    setDraft({\n      id: todo.id,\n      type: todo.type,\n      title: todo.title,\n      dueDate: todo.dueDate,\n      dueTime: todo.dueTime || '',\n      summary: todo.summary || null,\n      attachment: todo.attachment || null,\n    })\n    setSheetMode('manual')\n    resetAI()\n    setSheetOpen(true)\n  }`,
  'preserve summary while editing',
)

page = replaceOnce(
  page,
  `  function syncPickerDisplays() {`,
  `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    resetAI()\n  }\n\n  function syncPickerDisplays() {`,
  'attachment change handler',
)

page = replaceOnce(
  page,
  `      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n    } : emptyDraft(now))`,
  `      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,\n    } : emptyDraft(now))`,
  'manual switch metadata',
)

page = replaceOnce(
  page,
  `      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n    })`,
  `      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,\n    })`,
  'natural submit metadata',
)

page = replaceOnce(
  page,
  `  const saveDisabled = sheetMode === 'natural'\n    ? !naturalResult?.title\n    : !draft.title.trim() || !draft.dueDate\n`,
  `  const saveDisabled = sheetMode === 'natural'\n    ? (attachmentFile ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)\n    : !draft.title.trim() || !draft.dueDate\n`,
  'attachment save guard',
)

page = replaceOnce(
  page,
  `              </label>\n\n              {naturalResult ? (`,
  `              </label>\n\n              <AttachmentPicker\n                file={attachmentFile}\n                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFile && aiState === 'error' ? (aiError?.message || '첨부 분석에 실패했어. 다시 시도해줘.') : ''}\n                onChange={changeAttachment}\n              />\n\n              {naturalResult ? (`,
  'attachment picker UI',
)

page = replaceOnce(
  page,
  `                  ) : aiState === 'ready' ? (\n                    <small className="reminder-ai-status is-ready">{aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>\n                  ) : aiState === 'error' ? (\n                    <small className="reminder-ai-status">AI 연결이 안 돼서 기기 분석 결과를 사용해.</small>`,
  `                  ) : aiState === 'ready' ? (\n                    <small className="reminder-ai-status is-ready">{attachmentFile ? '첨부 내용 분석과 요약 완료' : aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>\n                  ) : aiState === 'error' ? (\n                    <small className="reminder-ai-status">{attachmentFile ? '첨부를 분석하지 못했어.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}</small>`,
  'attachment AI status',
)

page = replaceOnce(
  page,
  `              ) : (\n                <div className="reminder-natural-hint">`,
  `              ) : attachmentFile ? null : (\n                <div className="reminder-natural-hint">`,
  'hide hints during file analysis',
)

page = page.replaceAll(
  `                onDelete={animatePermanentDelete}\n                key={todo.id}`,
  `                onDelete={animatePermanentDelete}\n                onOpenSummary={setSummaryTodo}\n                key={todo.id}`,
)
if ((page.match(/onOpenSummary=\{setSummaryTodo\}/g) || []).length !== 2) {
  throw new Error('summary row handlers: expected two reminder row handlers')
}

page = replaceOnce(
  page,
  `      {sheetOpen ? (`,
  `      <SummarySheet todo={summaryTodo} onClose={() => setSummaryTodo(null)} />\n\n      {sheetOpen ? (`,
  'summary sheet render',
)

summaryComponent = replaceOnce(
  summaryComponent,
  `import React, { useRef, useState } from 'react'`,
  `import React, { useEffect, useRef, useState } from 'react'`,
  'summary useEffect import',
)

summaryComponent = replaceOnce(
  summaryComponent,
  `  const dragRef = useRef(null)\n\n  if (!todo?.summary) return null`,
  `  const dragRef = useRef(null)\n\n  useEffect(() => {\n    setExpanded(false)\n    setDragY(0)\n    dragRef.current = null\n  }, [todo?.id])\n\n  if (!todo?.summary) return null`,
  'summary sheet state reset',
)

rules = replaceOnce(
  rules,
  `    function validReminder(todoId) {`,
  `    function validReminderSummary() {\n      return !request.resource.data.keys().hasAny(['summary'])\n        || (request.resource.data.summary is map\n          && request.resource.data.summary.keys().hasOnly(['overview', 'sections'])\n          && request.resource.data.summary.keys().hasAll(['overview', 'sections'])\n          && request.resource.data.summary.overview is string\n          && request.resource.data.summary.overview.size() <= 2400\n          && request.resource.data.summary.sections is list\n          && request.resource.data.summary.sections.size() <= 14);\n    }\n\n    function validReminderAttachment() {\n      return !request.resource.data.keys().hasAny(['attachment'])\n        || (request.resource.data.attachment is map\n          && request.resource.data.attachment.keys().hasOnly(['name', 'mimeType', 'size'])\n          && request.resource.data.attachment.keys().hasAll(['name', 'mimeType', 'size'])\n          && request.resource.data.attachment.name is string\n          && request.resource.data.attachment.name.size() > 0\n          && request.resource.data.attachment.name.size() <= 120\n          && request.resource.data.attachment.mimeType in [\n            'application/pdf', 'application/json', 'text/plain', 'text/csv', 'text/rtf',\n            'text/html', 'text/xml', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp',\n            'image/heic', 'image/heif'\n          ]\n          && request.resource.data.attachment.size is int\n          && request.resource.data.attachment.size > 0\n          && request.resource.data.attachment.size <= 2500000);\n    }\n\n    function validReminder(todoId) {`,
  'summary rule helpers',
)

rules = replaceOnce(
  rules,
  `          'id', 'type', 'title', 'dueDate', 'dueTime', 'createdAt', 'updatedAt'\n        ])`,
  `          'id', 'type', 'title', 'dueDate', 'dueTime', 'createdAt', 'updatedAt',\n          'summary', 'attachment'\n        ])`,
  'reminder allowed keys',
)

rules = replaceOnce(
  rules,
  `        && request.resource.data.createdAt is int\n        && request.resource.data.updatedAt is int;`,
  `        && request.resource.data.createdAt is int\n        && request.resource.data.updatedAt is int\n        && validReminderSummary()\n        && validReminderAttachment();`,
  'reminder summary rule checks',
)

sw = replaceOnce(sw, "const CACHE_NAME = 'school-shell-v66'", "const CACHE_NAME = 'school-shell-v67'", 'service worker cache')

fs.writeFileSync(todoDataPath, todoData)
fs.writeFileSync(syncPath, sync)
fs.writeFileSync(pagePath, page)
fs.writeFileSync(summaryComponentPath, summaryComponent)
fs.writeFileSync(aiPath, ai)
fs.writeFileSync(rulesPath, rules)
fs.writeFileSync(swPath, sw)

console.log('Attachment summary migration applied with all source guards satisfied.')
