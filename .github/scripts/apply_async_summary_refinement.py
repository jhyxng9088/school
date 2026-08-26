from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 marker, found {count}')
    return text.replace(old, new, 1)


# 1) AI client: expose a faster title-first request.
p = 'src/firebase-ai.js'
t = read(p)
marker = 'export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {'
if marker not in t:
    raise SystemExit('AI export marker missing')
title_fn = """export async function parseReminderTitleWithAI(input, now = new Date(), attachmentInput = null) {
  const text = String(input || '').trim().slice(0, 140)
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  const meaningfulText = text.replace(/\\s+/g, '').length >= 4
  let parsed = null
  if (meaningfulText || !files.length) {
    parsed = await parseReminderWithAISingle(text, now, null)
  } else {
    parsed = await parseReminderWithAISingle(text, now, files[0])
  }
  if (!parsed) return null
  return {
    type: parsed.type,
    title: parsed.title,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime || '',
    assumedDate: Boolean(parsed.assumedDate),
    source: 'ai',
  }
}

"""
t = t.replace(marker, title_fn + marker, 1)
write(p, t)

# 2) Summary helpers: server-safe pending marker and hidden internal sections.
p = 'src/reminder-summary.jsx'
t = read(p)
t = replace_once(
    t,
    "export const REMINDER_ATTACHMENT_MANIFEST_HEADING = '\\u2063school-attachments\\u2063'",
    "export const REMINDER_ATTACHMENT_MANIFEST_HEADING = '\\u2063school-attachments\\u2063'\nexport const REMINDER_SUMMARY_PENDING_HEADING = '\\u2063school-summary-pending\\u2063'",
    'pending summary constant',
)
attach_marker = 'function attachmentManifest(todo) {'
if attach_marker not in t:
    raise SystemExit('attachment manifest function marker missing')
pending_helpers = """export function createPendingReminderSummary(files = []) {
  return withAttachmentManifest({
    overview: '',
    sections: [{ heading: REMINDER_SUMMARY_PENDING_HEADING, items: ['pending'] }],
  }, files)
}

export function isReminderSummaryPending(summary) {
  const sections = Array.isArray(summary?.sections) ? summary.sections : []
  return sections.some((section) => section?.heading === REMINDER_SUMMARY_PENDING_HEADING)
}

"""
t = t.replace(attach_marker, pending_helpers + attach_marker, 1)
t = replace_once(
    t,
    "  const visibleSections = sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING)",
    "  const visibleSections = sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING && section?.heading !== REMINDER_SUMMARY_PENDING_HEADING)",
    'hide pending summary section',
)
write(p, t)

# 3) Todo data hook: keep a live shared ref and allow silent AI enrichment without changing attribution.
p = 'src/todo.jsx'
t = read(p)
state_marker = "  const [sharedTodos, setSharedTodos] = useState(() => readSharedTodosCache(profile))\n"
if state_marker not in t:
    raise SystemExit('shared todo state marker missing')
t = t.replace(state_marker, state_marker + '  const sharedTodosRef = useRef(sharedTodos)\n', 1)
# Keep the ref synchronous whenever optimistic state changes.
t = replace_once(
    t,
    "    setSharedTodos((current) => {\n      const next = updater(current)\n      writeSharedTodosCache(profile, next)",
    "    setSharedTodos((current) => {\n      const next = updater(current)\n      sharedTodosRef.current = next\n      writeSharedTodosCache(profile, next)",
    'shared todo ref updater',
)
# Cache/profile reset paths.
t = replace_once(
    t,
    "      setSharedTodos([])\n      setPersonalState({})",
    "      sharedTodosRef.current = []\n      setSharedTodos([])\n      setPersonalState({})",
    'shared todo empty ref',
)
t = replace_once(
    t,
    "    setSharedTodos(cachedShared)\n    setPersonalState(cachedPersonal)",
    "    sharedTodosRef.current = cachedShared\n    setSharedTodos(cachedShared)\n    setPersonalState(cachedPersonal)",
    'shared todo cached ref',
)
t = replace_once(
    t,
    "      setSharedTodos(nextShared)\n      setPersonalState(nextPersonal)",
    "      sharedTodosRef.current = nextShared\n      setSharedTodos(nextShared)\n      setPersonalState(nextPersonal)",
    'shared todo first remote ref',
)
t = replace_once(
    t,
    "        if (firstRemoteReadyRef.current) setSharedTodos(next)\n        else commitFirstRemotePair()",
    "        if (firstRemoteReadyRef.current) {\n          sharedTodosRef.current = next\n          setSharedTodos(next)\n        } else commitFirstRemotePair()",
    'shared todo later remote ref',
)
# Add silent enrichment immediately before personal state writes.
enrich_marker = '  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {'
if enrich_marker not in t:
    raise SystemExit('todo enrichment insertion marker missing')
enrich_fn = """  async function enrichTodo(id, enrichment = {}) {
    const currentTodo = sharedTodosRef.current.find((todo) => todo.id === id)
    if (!currentTodo) return false
    const summary = safeSummary(enrichment.summary)
    if (!summary) return false
    const attachment = safeAttachment(enrichment.attachment)
    const nextTodo = {
      ...currentTodo,
      summary,
      updatedAt: Date.now(),
      ...(attachment ? { attachment } : {}),
    }

    updateSharedTodos((current) => current.map((todo) => todo.id === id ? nextTodo : todo))
    try {
      await writeSharedTodo(profile, nextTodo)
      return true
    } catch (error) {
      updateSharedTodos((current) => current.map((todo) => (
        todo.id === id && todo.updatedAt === nextTodo.updatedAt ? currentTodo : todo
      )))
      throw error
    }
  }

"""
t = t.replace(enrich_marker, enrich_fn + enrich_marker, 1)
t = replace_once(
    t,
    "    saveTodo,\n    toggleTodo,",
    "    saveTodo,\n    enrichTodo,\n    toggleTodo,",
    'return enrich todo',
)
write(p, t)

# 4) Reminder UI: title-first save, background summary/original enrichment, offline write guard, smooth pending status.
p = 'src/todo-stage5-ai.jsx'
t = read(p)
t = replace_once(
    t,
    "import { parseReminderWithAI } from './firebase-ai.js'",
    "import { parseReminderTitleWithAI, parseReminderWithAI } from './firebase-ai.js'",
    'AI imports',
)
t = replace_once(
    t,
    "import { AttachmentPicker, SummarySheet, withAttachmentManifest } from './reminder-summary.jsx'",
    "import { AttachmentPicker, SummarySheet, createPendingReminderSummary, isReminderSummaryPending, withAttachmentManifest } from './reminder-summary.jsx'",
    'summary imports',
)
old_row = '''function ReminderRow({ todo, now, completed = false, motion = '', onToggle, onEdit, onDelete, onOpenSummary, attribution }) {
  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const content = (
    <>
      <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />
      <AnimatedText as="strong" value={todo.title} delay={45} />
      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {attribution ? <span className="activity-attribution reminder-attribution">{activityLabel(attribution)}</span> : null}
    </>
  )

  return (
    <article
      className={`todo-item ${completed ? 'is-completed' : ''} ${motion === 'leaving' ? 'is-state-leaving' : ''} ${motion === 'entering' ? 'is-state-entering' : ''}`.trim()}
      data-reminder-id={todo.id}
    >
      <button
        className="todo-check"
        aria-label={`${todo.title} ${completed ? '완료 취소' : '완료'}`}
        onClick={() => onToggle(todo.id)}
      >
        <span />
      </button>
      {todo.summary ? (
        <button
          className="todo-item-main has-summary"
          type="button"
          aria-label={`${todo.title} 요약 보기`}
          onClick={() => onOpenSummary(todo)}
        >
          {content}
        </button>
      ) : (
        <div className="todo-item-main">{content}</div>
      )}
      <div className="todo-row-actions">
        <span className="todo-date-text">{dateLabel}</span>
        {completed ? (
          <button
            className="todo-permanent-delete"
            type="button"
            aria-label={`${todo.title} 영구 삭제`}
            onClick={() => onDelete(todo.id)}
          >
            삭제
          </button>
        ) : (
          <button
            className="todo-edit-button"
            type="button"
            aria-label={`${todo.title} 수정`}
            onClick={() => onEdit(todo)}
          >
            수정
          </button>
        )}
      </div>
    </article>
  )
}
'''
new_row = '''function SummaryPendingStatus({ pending, withAttribution = false }) {
  const [rendered, setRendered] = useState(Boolean(pending))
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (pending) {
      setRendered(true)
      setResolving(false)
      return undefined
    }
    if (!rendered) return undefined
    setResolving(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setResolving(false)
    }, 380)
    return () => window.clearTimeout(timer)
  }, [pending, rendered])

  if (!rendered) return null
  return (
    <span className={`reminder-summary-pending ${resolving ? 'is-resolving' : ''}`.trim()}>
      <span>요약중</span>
      <span className="reminder-summary-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      {withAttribution ? <span className="reminder-summary-separator">·</span> : null}
    </span>
  )
}

function ReminderRow({ todo, now, completed = false, motion = '', onToggle, onEdit, onDelete, onOpenSummary, attribution }) {
  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const summaryPending = isReminderSummaryPending(todo.summary)
  const readableSummary = Boolean(todo.summary && !summaryPending)
  const content = (
    <>
      <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />
      <AnimatedText as="strong" value={todo.title} delay={45} />
      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {(summaryPending || attribution) ? (
        <span className="reminder-attribution-line">
          <SummaryPendingStatus pending={summaryPending} withAttribution={Boolean(attribution)} />
          {attribution ? <span className="activity-attribution reminder-attribution">{activityLabel(attribution)}</span> : null}
        </span>
      ) : null}
    </>
  )

  return (
    <article
      className={`todo-item ${completed ? 'is-completed' : ''} ${motion === 'leaving' ? 'is-state-leaving' : ''} ${motion === 'entering' ? 'is-state-entering' : ''}`.trim()}
      data-reminder-id={todo.id}
    >
      <button
        className="todo-check"
        aria-label={`${todo.title} ${completed ? '완료 취소' : '완료'}`}
        onClick={() => onToggle(todo.id)}
      >
        <span />
      </button>
      {readableSummary ? (
        <button
          className="todo-item-main has-summary"
          type="button"
          aria-label={`${todo.title} 요약 보기`}
          onClick={() => onOpenSummary(todo)}
        >
          {content}
        </button>
      ) : (
        <div className="todo-item-main">{content}</div>
      )}
      <div className="todo-row-actions">
        <span className="todo-date-text">{dateLabel}</span>
        {completed ? (
          <button
            className="todo-permanent-delete"
            type="button"
            aria-label={`${todo.title} 영구 삭제`}
            onClick={() => onDelete(todo.id)}
          >
            삭제
          </button>
        ) : (
          <button
            className="todo-edit-button"
            type="button"
            aria-label={`${todo.title} 수정`}
            onClick={() => onEdit(todo)}
          >
            수정
          </button>
        )}
      </div>
    </article>
  )
}
'''
t = replace_once(t, old_row, new_row, 'reminder row block')
t = replace_once(
    t,
    'export function TodoPage({ now, todoData }) {',
    'export function TodoPage({ now, todoData, requireOnline = () => true }) {',
    'todo page online signature',
)
t = replace_once(
    t,
    "    saveTodo,\n    toggleTodo,",
    "    saveTodo,\n    enrichTodo,\n    toggleTodo,",
    'todo enrich destructure',
)
t = replace_once(
    t,
    "  const [aiError, setAiError] = useState(null)\n  const [attachmentFiles, setAttachmentFiles] = useState([])",
    "  const [aiError, setAiError] = useState(null)\n  const [summaryResult, setSummaryResult] = useState(null)\n  const [summaryState, setSummaryState] = useState('idle')\n  const [summaryError, setSummaryError] = useState(null)\n  const [attachmentFiles, setAttachmentFiles] = useState([])",
    'summary states',
)
t = replace_once(
    t,
    "  const aiRequestRef = useRef(0)\n  const pendingCreateIdRef = useRef('')",
    "  const aiRequestRef = useRef(0)\n  const summaryPromiseRef = useRef(null)\n  const pendingCreateIdRef = useRef('')",
    'summary promise ref',
)
old_effect = '''  useEffect(() => {
    const text = naturalText.trim()
    const hasAttachment = attachmentFiles.length > 0
    const requestId = aiRequestRef.current + 1
    aiRequestRef.current = requestId
    setAiResult(null)
    setAiError(null)

    if (!sheetOpen || sheetMode !== 'natural' || (!hasAttachment && text.length < 2)) {
      setAiState('idle')
      return undefined
    }

    setAiState('waiting')
    const timer = window.setTimeout(async () => {
      if (aiRequestRef.current !== requestId) return
      setAiState('loading')

      try {
        const parsed = await parseReminderWithAI(text, new Date(), attachmentFiles)
        if (aiRequestRef.current !== requestId) return
        if (parsed) setAiResult(parsed)
        setAiError(null)
        setAiState(parsed ? 'ready' : 'error')
      } catch (error) {
        if (aiRequestRef.current !== requestId) return
        console.error('Reminder AI failed:', error)
        setAiError({
          name: error?.name || null,
          code: error?.code || null,
          message: error?.message || null,
          status: error?.status || null,
          customData: error?.customData ? JSON.stringify(error.customData) : null,
        })
        setAiState('error')
      }
    }, hasAttachment ? 420 : 650)

    return () => window.clearTimeout(timer)
  }, [aiTrigger, attachmentRetryKey, sheetOpen, sheetMode])
'''
new_effect = '''  useEffect(() => {
    const text = naturalText.trim()
    const files = attachmentFiles.slice()
    const hasAttachment = files.length > 0
    const requestId = aiRequestRef.current + 1
    aiRequestRef.current = requestId
    summaryPromiseRef.current = null
    setAiResult(null)
    setAiError(null)
    setSummaryResult(null)
    setSummaryError(null)

    if (!sheetOpen || sheetMode !== 'natural' || (!hasAttachment && text.length < 2)) {
      setAiState('idle')
      setSummaryState('idle')
      return undefined
    }

    setAiState('waiting')
    setSummaryState(hasAttachment ? 'waiting' : 'idle')
    const timer = window.setTimeout(() => {
      if (aiRequestRef.current !== requestId) return
      const requestNow = new Date()
      setAiState('loading')

      parseReminderTitleWithAI(text, requestNow, files)
        .then((parsed) => {
          if (aiRequestRef.current !== requestId) return
          if (parsed) setAiResult(parsed)
          setAiError(null)
          setAiState(parsed ? 'ready' : 'error')
        })
        .catch((error) => {
          if (aiRequestRef.current !== requestId) return
          console.error('Reminder title AI failed:', error)
          setAiError({
            name: error?.name || null,
            code: error?.code || null,
            message: error?.message || null,
            status: error?.status || null,
            customData: error?.customData ? JSON.stringify(error.customData) : null,
          })
          setAiState('error')
        })

      if (hasAttachment) {
        setSummaryState('loading')
        const promise = parseReminderWithAI(text, requestNow, files)
        summaryPromiseRef.current = { requestId, promise }
        promise
          .then((parsed) => {
            if (aiRequestRef.current !== requestId) return
            if (parsed?.summary) setSummaryResult(parsed)
            setSummaryError(null)
            setSummaryState(parsed?.summary ? 'ready' : 'error')
          })
          .catch((error) => {
            if (aiRequestRef.current !== requestId) return
            console.error('Reminder summary AI failed:', error)
            setSummaryError({
              name: error?.name || null,
              code: error?.code || null,
              message: error?.message || null,
              status: error?.status || null,
            })
            setSummaryState('error')
          })
      }
    }, hasAttachment ? 220 : 550)

    return () => window.clearTimeout(timer)
  }, [aiTrigger, attachmentRetryKey, sheetOpen, sheetMode])
'''
t = replace_once(t, old_effect, new_effect, 'AI title/summary effect')
t = replace_once(
    t,
    "  function resetAI() {\n    aiRequestRef.current += 1\n    setAiResult(null)\n    setAiState('idle')\n    setAiError(null)\n  }",
    "  function resetAI() {\n    aiRequestRef.current += 1\n    summaryPromiseRef.current = null\n    setAiResult(null)\n    setAiState('idle')\n    setAiError(null)\n    setSummaryResult(null)\n    setSummaryState('idle')\n    setSummaryError(null)\n  }",
    'reset AI summary state',
)
t = replace_once(
    t,
    "  function openCreate() {\n    setNaturalText('')",
    "  function openCreate() {\n    if (!requireOnline('리마인더를 추가')) return\n    setNaturalText('')",
    'offline create guard',
)
t = replace_once(
    t,
    "  function openEdit(todo) {\n    setNaturalText('')",
    "  function openEdit(todo) {\n    if (!requireOnline('리마인더를 수정')) return\n    setNaturalText('')",
    'offline edit guard',
)
t = replace_once(
    t,
    "      summary: attachmentFiles.length ? withAttachmentManifest(naturalResult.summary, attachmentFiles) : naturalResult.summary || null,",
    "      summary: attachmentFiles.length ? createPendingReminderSummary(attachmentFiles) : naturalResult.summary || null,",
    'manual switch pending summary',
)
old_submit_natural_start = t.index('  async function submitNatural() {')
old_submit_manual_start = t.index('  async function submitManual() {', old_submit_natural_start)
if old_submit_natural_start < 0 or old_submit_manual_start < 0:
    raise SystemExit('submit function markers missing')
background_block = '''  async function finishReminderEnrichment(todoId, text, files, existingSummaryPromise = null) {
    if (!todoId || !files.length) return
    const uploadResultsPromise = Promise.all(files.map(async (file, index) => {
      try {
        await uploadOriginalAttachment(todoId, file, `a${index}`)
        return true
      } catch (error) {
        console.error(`Original reminder attachment ${index + 1} background save failed:`, error)
        return false
      }
    }))

    let parsed = null
    try {
      parsed = await (existingSummaryPromise || parseReminderWithAI(text, new Date(), files))
    } catch (error) {
      console.error('Background reminder summary failed:', error)
    }

    if (!parsed?.summary && navigator.onLine !== false) {
      await new Promise((resolve) => window.setTimeout(resolve, 1600))
      try {
        parsed = await parseReminderWithAI(text, new Date(), files)
      } catch (error) {
        console.error('Background reminder summary retry failed:', error)
      }
    }

    const uploadResults = await uploadResultsPromise
    if (!parsed?.summary) return
    const finalSummary = uploadResults.every(Boolean)
      ? withAttachmentManifest(parsed.summary, files)
      : parsed.summary
    try {
      await enrichTodo(todoId, {
        summary: finalSummary,
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder enrichment save failed:', error)
    }
  }

  async function submitNatural() {
    const fallbackResult = aiState === 'error' && !attachmentFiles.length ? localNaturalResult : null
    const result = aiResult || fallbackResult
    if (!result?.title || !result?.dueDate || serverSaving) return
    if (!requireOnline('리마인더를 추가')) return
    const createId = pendingCreateIdRef.current || createTodoId()
    pendingCreateIdRef.current = createId
    const files = attachmentFiles.slice()
    const text = naturalText.trim()
    const summaryPromise = summaryPromiseRef.current?.promise || (summaryResult ? Promise.resolve(summaryResult) : null)

    setServerSaving(true)
    setServerSaveError('')
    const savePromise = saveTodo({
      id: '',
      createId,
      type: result.type,
      title: result.title,
      dueDate: result.dueDate,
      dueTime: result.dueTime || '',
      summary: files.length ? createPendingReminderSummary(files) : null,
      attachment: null,
    })
    setSheetOpen(false)

    try {
      const savedId = await savePromise
      if (!savedId) {
        setSheetOpen(true)
        return
      }
      pendingCreateIdRef.current = ''
      if (files.length) void finishReminderEnrichment(savedId, text, files, summaryPromise)
      resetAI()
    } catch (error) {
      console.error('Shared reminder save failed:', error)
      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')
      setSheetOpen(true)
    } finally {
      setServerSaving(false)
    }
  }

'''
# Replace natural function only, keeping manual marker for next replacement.
t = t[:old_submit_natural_start] + background_block + t[old_submit_manual_start:]
# Re-find manual and submitCurrent after changed text.
manual_start = t.index('  async function submitManual() {')
submit_current_start = t.index('  function submitCurrent() {', manual_start)
new_manual = '''  async function submitManual() {
    if (serverSaving) return
    if (!requireOnline(draft.id ? '리마인더를 수정' : '리마인더를 추가')) return
    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())
    if (createId) pendingCreateIdRef.current = createId
    const files = attachmentFiles.slice()
    const draftToSave = createId && files.length
      ? { ...draft, summary: createPendingReminderSummary(files), attachment: null }
      : draft

    setServerSaving(true)
    setServerSaveError('')
    const savePromise = saveTodo(createId ? { ...draftToSave, createId } : draftToSave)
    setSheetOpen(false)

    try {
      const savedId = await savePromise
      if (!savedId) {
        setSheetOpen(true)
        return
      }
      pendingCreateIdRef.current = ''
      if (createId && files.length) void finishReminderEnrichment(savedId, draft.title.trim(), files, null)
    } catch (error) {
      console.error('Shared reminder save failed:', error)
      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')
      setSheetOpen(true)
    } finally {
      setServerSaving(false)
    }
  }

'''
t = t[:manual_start] + new_manual + t[submit_current_start:]
t = replace_once(
    t,
    "  function animateToggleTodo(id) {\n    beginRowExit(id, 'toggle')\n  }",
    "  function animateToggleTodo(id) {\n    const target = todos.find((todo) => todo.id === id)\n    const action = target?.completed ? '리마인더 완료를 취소' : '리마인더를 완료'\n    if (!requireOnline(action)) return\n    beginRowExit(id, 'toggle')\n  }",
    'offline reminder toggle guard',
)
t = replace_once(
    t,
    "  function animatePermanentDelete(id) {\n    beginRowExit(id, 'delete')\n  }",
    "  function animatePermanentDelete(id) {\n    if (!requireOnline('리마인더를 삭제')) return\n    beginRowExit(id, 'delete')\n  }",
    'offline reminder delete guard',
)
t = replace_once(
    t,
    "  function deleteEditing() {\n    if (!draft.id) return\n    removeTodo(draft.id)",
    "  function deleteEditing() {\n    if (!draft.id) return\n    if (!requireOnline('리마인더를 삭제')) return\n    removeTodo(draft.id)",
    'offline editing delete guard',
)
t = replace_once(
    t,
    "  const aiBusy = aiState === 'waiting' || aiState === 'loading'\n  const saveDisabled = originalSaving || serverSaving || (sheetMode === 'natural'\n    ? (attachmentFiles.length ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)\n    : !draft.title.trim() || !draft.dueDate)",
    "  const aiBusy = aiState === 'waiting' || aiState === 'loading'\n  const summaryBusy = summaryState === 'waiting' || summaryState === 'loading'\n  const aiTitleReady = Boolean(aiResult?.title && aiResult?.dueDate)\n  const localFallbackReady = aiState === 'error' && !attachmentFiles.length && Boolean(localNaturalResult?.title && localNaturalResult?.dueDate)\n  const saveDisabled = serverSaving || (sheetMode === 'natural'\n    ? !(aiTitleReady || localFallbackReady)\n    : !draft.title.trim() || !draft.dueDate)",
    'title-first save disabled state',
)
t = replace_once(
    t,
    "        closeDisabled={originalSaving || serverSaving}",
    "        closeDisabled={serverSaving}",
    'sheet close disabled',
)
t = replace_once(
    t,
    "                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFiles.length && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}",
    "                busy={summaryBusy}\n                ready={summaryState === 'ready'}\n                error={attachmentFiles.length && summaryState === 'error' ? attachmentErrorMessage(summaryError) : ''}",
    'attachment summary status',
)
old_preview_status = '''                  {aiBusy ? (
                    <small className="reminder-ai-status is-working">{attachmentFiles.length ? '분석 중' : '확인 중'}</small>
                  ) : aiState === 'ready' ? (
                    <small className="reminder-ai-status is-ready">{attachmentFiles.length ? '분석 완료' : aiAdjusted ? '오타·축약을 보정했어.' : '확인 완료'}</small>
                  ) : aiState === 'error' ? (
                    <small className="reminder-ai-status">{attachmentFiles.length ? '텍스트는 유지했어. 첨부만 다시 분석해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}</small>
                  ) : naturalResult.assumedDate ? (
                    <small>날짜를 안 써서 오늘로 잡았어. 다르면 직접 입력에서 바꿀 수 있어.</small>
                  ) : null}'''
new_preview_status = '''                  {aiBusy ? (
                    <small className="reminder-ai-status is-working">AI가 제목을 정리하는 중…</small>
                  ) : aiState === 'ready' ? (
                    <small className="reminder-ai-status is-ready">
                      {attachmentFiles.length
                        ? summaryState === 'ready' ? '제목·요약 준비 완료' : '제목 준비됨 · 추가하면 요약은 뒤에서 계속돼.'
                        : aiAdjusted ? '오타·축약을 보정했어.' : 'AI 제목 준비 완료'}
                    </small>
                  ) : aiState === 'error' ? (
                    <small className="reminder-ai-status">{attachmentFiles.length ? 'AI 제목 생성에 실패했어. 다시 분석하거나 직접 입력해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용할 수 있어.'}</small>
                  ) : naturalResult.assumedDate ? (
                    <small>날짜를 안 써서 오늘로 잡았어. 다르면 직접 입력에서 바꿀 수 있어.</small>
                  ) : null}'''
t = replace_once(t, old_preview_status, new_preview_status, 'preview AI status')
t = replace_once(
    t,
    "                {originalSaving || serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}",
    "                {serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}",
    'save button state',
)
write(p, t)

# 5) Pending summary line / animated ellipsis.
p = 'src/todo-stage5.css'
t = read(p)
css_marker = '.todo-stage5 .reminder-attribution {\n'
if css_marker not in t:
    raise SystemExit('reminder attribution CSS marker missing')
pending_css = '''.todo-stage5 .reminder-attribution-line {
  grid-column: 1 / -1;
  grid-row: 3;
  display: flex;
  align-items: center;
  min-width: 0;
  margin-top: 1px;
  font-size: 9px;
  line-height: 1.3;
}

.reminder-summary-pending {
  display: inline-flex;
  align-items: baseline;
  flex: 0 0 auto;
  max-width: 88px;
  overflow: hidden;
  color: var(--text-secondary);
  opacity: 0.76;
  white-space: nowrap;
  transition:
    max-width 380ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 300ms ease,
    transform 380ms cubic-bezier(0.16, 1, 0.3, 1);
}

.reminder-summary-pending.is-resolving {
  max-width: 0;
  opacity: 0;
  transform: translate3d(0, -2px, 0);
}

.reminder-summary-dots {
  display: inline-flex;
  width: 13px;
  margin-left: 1px;
}

.reminder-summary-dots i {
  font-style: normal;
  opacity: 0.2;
  animation: reminder-summary-dot 1.05s ease-in-out infinite;
}

.reminder-summary-dots i:nth-child(2) { animation-delay: 140ms; }
.reminder-summary-dots i:nth-child(3) { animation-delay: 280ms; }

.reminder-summary-separator {
  margin: 0 5px;
  opacity: 0.48;
}

@keyframes reminder-summary-dot {
  0%, 70%, 100% { opacity: 0.18; }
  35% { opacity: 0.92; }
}

'''
t = t.replace(css_marker, pending_css + css_marker, 1)
# Existing attribution grid placement is now owned by the line wrapper.
t = t.replace(
    ".todo-stage5 .reminder-attribution {\n  grid-column: 1 / -1;\n  grid-row: 3;\n  margin-top: 1px;\n  font-size: 9px;\n  opacity: 0.7;\n}",
    ".todo-stage5 .reminder-attribution {\n  min-width: 0;\n  margin: 0;\n  font-size: 9px;\n  opacity: 0.7;\n}",
    1,
)
reduce_marker = '@media (prefers-reduced-motion: reduce) {\n  .reminder-natural-fields.is-visible,'
if reduce_marker not in t:
    raise SystemExit('reduced motion marker missing')
t = t.replace(
    reduce_marker,
    '@media (prefers-reduced-motion: reduce) {\n  .reminder-summary-pending,\n  .reminder-summary-dots i {\n    transition: none !important;\n    animation: none !important;\n  }\n\n  .reminder-natural-fields.is-visible,',
    1,
)
write(p, t)

print('async reminder summary refinement applied')
