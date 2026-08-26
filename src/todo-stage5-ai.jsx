import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TODO_TYPES } from './todo.jsx'
import { formatParsedDue, parseReminderText } from './reminder-parser.js'
import { parseReminderTitleWithAI, parseReminderWithAI } from './firebase-ai.js'
import { AttachmentPicker, SummarySheet, createPendingReminderSummary, isReminderSummaryPending, withAttachmentManifest } from './reminder-summary.jsx'
import { activityKey, activityLabel, useClassActivity } from './class-activity'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import './todo-stage5.css'
import './todo-ai.css'

const FILTERS = [{ id: 'all', label: '전체' }, ...TODO_TYPES]
const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDue(todo) {
  const time = todo.dueTime || '23:59'
  return new Date(`${todo.dueDate}T${time}:00`)
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return parseDue(a) - parseDue(b) || a.createdAt - b.createdAt
  })
}

function typeLabel(typeId) {
  return TODO_TYPES.find((type) => type.id === typeId)?.label || '일반'
}

function dueDateLabel(todo) {
  const [year, month, day] = String(todo.dueDate || '').split('-').map(Number)
  if (!year || !month || !day) return String(todo.dueDate || '날짜 없음')
  return `${month}월 ${day}일`
}

function dueMetaLabel(todo, now) {
  const today = dateKey(now)
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const relative = todo.dueDate === today ? '오늘' : todo.dueDate === tomorrow ? '내일' : ''

  if (relative && todo.dueTime) return `${relative} · ${todo.dueTime}`
  if (relative) return relative
  return todo.dueTime || ''
}

function emptyDraft(now) {
  return {
    id: '',
    type: 'task',
    title: '',
    dueDate: dateKey(now),
    dueTime: '',
    summary: null,
    attachment: null,
  }
}

function resultSignature(result) {
  if (!result) return ''
  return [result.type, result.title, result.dueDate, result.dueTime || '', Boolean(result.assumedDate)].join('|')
}

function attachmentErrorMessage(error) {
  const message = String(error?.message || '')
  if (/timed out|timeout|gemini-3\.[67]/i.test(message)) {
    return '이미지 분석 시간이 초과됐어. 최적화된 이미지로 다시 분석해줘.'
  }
  return message || '첨부 분석에 실패했어. 다시 시도해줘.'
}

function AnimatedText({ as = 'span', value, className = '', delay = 0 }) {
  const Tag = as
  const previous = useRef(value)
  const changed = previous.current !== value

  useLayoutEffect(() => {
    previous.current = value
  }, [value])

  return (
    <Tag
      className={`${className} ${changed ? 'is-reminder-text-changing' : ''}`.trim()}
      style={changed ? { '--reminder-text-delay': `${delay}ms` } : undefined}
    >
      {value}
    </Tag>
  )
}

function SummaryPendingStatus({ pending, withAttribution = false }) {
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

export function TodoPage({ now, todoData, requireOnline = () => true }) {
  const {
    todos,
    saveTodo,
    enrichTodo,
    toggleTodo,
    removeTodo,
    createTodoId,
    uploadOriginalAttachment,
    getOriginalAttachment,
  } = todoData
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState('natural')
  const [naturalText, setNaturalText] = useState('')
  const [draft, setDraft] = useState(() => emptyDraft(now))
  const [pageEntering, setPageEntering] = useState(true)
  const [rowMotion, setRowMotion] = useState({})
  const [filter, setFilter] = useState('all')
  const [aiResult, setAiResult] = useState(null)
  const [aiState, setAiState] = useState('idle')
  const [aiError, setAiError] = useState(null)
  const [summaryResult, setSummaryResult] = useState(null)
  const [summaryState, setSummaryState] = useState('idle')
  const [summaryError, setSummaryError] = useState(null)
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [attachmentRetryKey, setAttachmentRetryKey] = useState(0)
  const [originalSaving, setOriginalSaving] = useState(false)
  const [originalSaveError, setOriginalSaveError] = useState('')
  const [serverSaving, setServerSaving] = useState(false)
  const [serverSaveError, setServerSaveError] = useState('')
  const [summaryTodo, setSummaryTodo] = useState(null)
  const activity = useClassActivity()
  const pageRef = useRef(null)
  const rowMotionRef = useRef(new Set())
  const aiRequestRef = useRef(0)
  const summaryPromiseRef = useRef(null)
  const pendingCreateIdRef = useRef('')

  const sorted = useMemo(() => sortTodos(todos), [todos])
  const active = sorted.filter((todo) => !todo.completed)
  const completed = sorted.filter((todo) => todo.completed)
  const visibleActive = filter === 'all' ? active : active.filter((todo) => todo.type === filter)
  const visibleCompleted = filter === 'all' ? completed : completed.filter((todo) => todo.type === filter)
  const selectedFilterLabel = FILTERS.find((item) => item.id === filter)?.label || '전체'
  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])
  const naturalResult = aiResult || localNaturalResult
  const attachmentSignature = attachmentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')
  const aiAdjusted = Boolean(!attachmentFiles.length && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))
  const aiTrigger = attachmentSignature ? `${naturalText}|${attachmentSignature}` : naturalText

  useEffect(() => {
    const timer = window.setTimeout(() => setPageEntering(false), 1150)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
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


  function resetAI() {
    aiRequestRef.current += 1
    summaryPromiseRef.current = null
    setAiResult(null)
    setAiState('idle')
    setAiError(null)
    setSummaryResult(null)
    setSummaryState('idle')
    setSummaryError(null)
  }

  function openCreate() {
    if (!requireOnline('리마인더를 추가')) return
    setNaturalText('')
    setAttachmentFiles([])
    setAttachmentRetryKey(0)
    setOriginalSaving(false)
    setOriginalSaveError('')
    setServerSaving(false)
    setServerSaveError('')
    pendingCreateIdRef.current = ''
    setSummaryTodo(null)
    setDraft(emptyDraft(now))
    setSheetMode('natural')
    resetAI()
    setSheetOpen(true)
  }

  function openEdit(todo) {
    if (!requireOnline('리마인더를 수정')) return
    setNaturalText('')
    setAttachmentFiles([])
    setServerSaving(false)
    setServerSaveError('')
    pendingCreateIdRef.current = ''
    setSummaryTodo(null)
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
      summary: todo.summary || null,
      attachment: todo.attachment || null,
    })
    setSheetMode('manual')
    resetAI()
    setSheetOpen(true)
  }

  function touchAttachments() {
    setAttachmentRetryKey(0)
    setOriginalSaveError('')
    setServerSaveError('')
    pendingCreateIdRef.current = ''
    resetAI()
  }

  function addAttachments(nextFiles) {
    const incoming = Array.from(nextFiles || []).filter((file) => file instanceof File)
    if (!incoming.length) return
    setAttachmentFiles((current) => {
      const next = [...current]
      incoming.forEach((file) => {
        const duplicate = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
        if (!duplicate && next.length < 4) next.push(file)
      })
      return next
    })
    touchAttachments()
  }

  function removeAttachment(index) {
    setAttachmentFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
    touchAttachments()
  }

  function retryAttachment() {
    if (!attachmentFiles.length) return
    resetAI()
    setAttachmentRetryKey((current) => current + 1)
  }

  function syncPickerDisplays() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const sheet = document.querySelector('.unified-school-sheet.todo-sheet')
        sheet?.querySelectorAll('input[type="date"], input[type="time"]').forEach((input) => {
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      })
    })
  }

  function switchToManual() {
    setDraft(naturalResult ? {
      id: '',
      type: naturalResult.type,
      title: naturalResult.title,
      dueDate: naturalResult.dueDate,
      dueTime: naturalResult.dueTime || '',
      summary: attachmentFiles.length ? createPendingReminderSummary(attachmentFiles) : naturalResult.summary || null,
      attachment: naturalResult.attachment || null,
    } : emptyDraft(now))
    resetAI()
    setSheetMode('manual')
    syncPickerDisplays()
  }

  async function finishReminderEnrichment(todoId, text, files, existingSummaryPromise = null) {
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

    if (!parsed?.summary) {
      await uploadResultsPromise
      return
    }

    try {
      await enrichTodo(todoId, {
        summary: parsed.summary,
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder summary save failed:', error)
      await uploadResultsPromise
      return
    }

    const uploadResults = await uploadResultsPromise
    if (!uploadResults.every(Boolean)) return
    try {
      await enrichTodo(todoId, {
        summary: withAttachmentManifest(parsed.summary, files),
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder original manifest save failed:', error)
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

  async function submitManual() {
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

  function submitCurrent() {
    if (sheetMode === 'natural') submitNatural()
    else submitManual()
  }

  function beginRowExit(id, action) {
    if (!id || rowMotionRef.current.has(id)) return
    rowMotionRef.current.add(id)
    setRowMotion((current) => ({ ...current, [id]: 'leaving' }))

    window.setTimeout(() => {
      if (action === 'toggle') toggleTodo(id)
      else removeTodo(id)

      if (action === 'toggle') {
        setRowMotion((current) => ({ ...current, [id]: 'entering' }))
        window.setTimeout(() => {
          rowMotionRef.current.delete(id)
          setRowMotion((current) => {
            const next = { ...current }
            delete next[id]
            return next
          })
        }, 420)
      } else {
        rowMotionRef.current.delete(id)
        setRowMotion((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
      }
    }, 280)
  }

  function animateToggleTodo(id) {
    const target = todos.find((todo) => todo.id === id)
    const action = target?.completed ? '리마인더 완료를 취소' : '리마인더를 완료'
    if (!requireOnline(action)) return
    beginRowExit(id, 'toggle')
  }

  function animatePermanentDelete(id) {
    if (!requireOnline('리마인더를 삭제')) return
    beginRowExit(id, 'delete')
  }

  function deleteEditing() {
    if (!draft.id) return
    if (!requireOnline('리마인더를 삭제')) return
    removeTodo(draft.id)
    setSheetOpen(false)
  }

  const aiBusy = aiState === 'waiting' || aiState === 'loading'
  const summaryBusy = summaryState === 'waiting' || summaryState === 'loading'
  const aiTitleReady = Boolean(aiResult?.title && aiResult?.dueDate)
  const localFallbackReady = aiState === 'error' && !attachmentFiles.length && Boolean(localNaturalResult?.title && localNaturalResult?.dueDate)
  const saveDisabled = serverSaving || (sheetMode === 'natural'
    ? !(aiTitleReady || localFallbackReady)
    : !draft.title.trim() || !draft.dueDate)

  const summaryText = filter === 'all'
    ? (active.length ? `${active.length}개 남음` : '모두 완료')
    : `${selectedFilterLabel} ${visibleActive.length}개`

  return (
    <section ref={pageRef} className={`todo-page todo-stage5 ${pageEntering ? 'is-page-entering' : ''}`}>
      <header className="todo-header">
        <div>
          <p className="date-label">학교생활 일정</p>
          <h1>리마인더</h1>
        </div>
        <button className="todo-add-button" onClick={openCreate}>추가</button>
      </header>

      <section className="todo-summary">
        <AnimatedText as="strong" value={summaryText} />
      </section>

      <section className="todo-list-section reminder-upcoming-section">
        <div className="reminder-list-heading">
          <h2>다가오는 일정</h2>
          <div className="reminder-filter-row" role="group" aria-label="리마인더 종류 필터">
            {FILTERS.map((item) => (
              <button
                type="button"
                className={filter === item.id ? 'is-selected' : ''}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {visibleActive.length ? (
          <div className="todo-list">
            {visibleActive.map((todo) => (
              <ReminderRow
                todo={todo}
                now={now}
                onToggle={animateToggleTodo}
                onEdit={openEdit}
                onDelete={animatePermanentDelete}
                onOpenSummary={setSummaryTodo}
                attribution={activity[activityKey('reminder', todo.id)] || null}
                motion={rowMotion[todo.id] || ''}
                key={todo.id}
              />
            ))}
          </div>
        ) : (
          <div className="todo-empty">
            <strong>{filter === 'all' ? '예정된 리마인더가 없어' : `${selectedFilterLabel} 일정이 없어`}</strong>
            <span>{filter === 'all' ? '추가를 누르고 해야 할 일을 한 문장으로 적어봐.' : '다른 종류를 선택하거나 새 리마인더를 추가해.'}</span>
          </div>
        )}
      </section>

      <section
        className={`todo-list-section todo-completed-section ${visibleCompleted.length ? '' : 'is-empty'}`}
        aria-hidden={!visibleCompleted.length}
      >
        <div className="todo-completed-content">
          <h2>완료</h2>
          {visibleCompleted.length ? (
            <div className="todo-list">
              {visibleCompleted.map((todo) => (
                <ReminderRow
                  todo={todo}
                  now={now}
                  completed
                  motion={rowMotion[todo.id] || ''}
                  onToggle={animateToggleTodo}
                  onEdit={openEdit}
                  onDelete={animatePermanentDelete}
                  onOpenSummary={setSummaryTodo}
                  attribution={activity[activityKey('reminder', todo.id)] || null}
                  key={todo.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <SummarySheet
        todo={summaryTodo}
        onClose={() => setSummaryTodo(null)}
        loadOriginal={summaryTodo?.id ? (key = '') => getOriginalAttachment(summaryTodo.id, key) : null}
      />

      <UnifiedBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        closeDisabled={serverSaving}
        title={draft.id ? '리마인더 수정' : '리마인더 추가'}
        subtitle={sheetMode === 'natural' ? '해야 할 일을 그냥 한 문장으로 적어.' : '필요한 정보만 직접 수정해.'}
        ariaLabel={draft.id ? '리마인더 수정' : '리마인더 추가'}
        className="todo-sheet"
      >
        <div className="todo-sheet-form">
            <div className={`reminder-natural-fields ${sheetMode === 'natural' ? 'is-visible' : ''}`} aria-hidden={sheetMode !== 'natural'}>
              <label className="reminder-natural-input-wrap">
                <span>문장으로 추가</span>
                <textarea
                  value={naturalText}
                  onChange={(event) => setNaturalText(event.target.value.slice(0, 140))}
                  placeholder="예: 다음 주 화요일까지 영어 수행 PPT"
                  rows={2}
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <AttachmentPicker
                files={attachmentFiles}
                busy={summaryBusy}
                ready={summaryState === 'ready'}
                error={attachmentFiles.length && summaryState === 'error' ? attachmentErrorMessage(summaryError) : ''}
                onAdd={addAttachments}
                onRemove={removeAttachment}
                onRetry={retryAttachment}
              />

              {originalSaving ? (
                <div className="reminder-original-save-status is-working"><span>원본 사진을 저장하는 중…</span></div>
              ) : originalSaveError ? (
                <div className="reminder-original-save-status is-error"><span>{originalSaveError}</span></div>
              ) : null}

              {naturalResult ? (
                <section className="reminder-parse-preview" aria-live="polite">
                  <p>이렇게 이해했어</p>
                  <strong>{naturalResult.title}</strong>
                  <div className="reminder-parse-chips">
                    <span>{typeLabel(naturalResult.type)}</span>
                    <span>{formatParsedDue(naturalResult, now)}</span>
                  </div>
                  {aiBusy ? (
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
                  ) : null}
                </section>
              ) : null}

              <button className="reminder-manual-switch" type="button" onClick={switchToManual}>
                직접 입력
              </button>
            </div>

            <div className={`reminder-manual-fields ${sheetMode === 'manual' ? 'is-visible' : ''}`} aria-hidden={sheetMode !== 'manual'}>
              <div className="todo-type-picker" role="group" aria-label="리마인더 종류">
                {TODO_TYPES.map((type) => (
                  <button
                    type="button"
                    className={draft.type === type.id ? 'is-selected' : ''}
                    onClick={() => setDraft((current) => ({ ...current, type: type.id }))}
                    key={type.id}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <label className="change-field full todo-title-field">
                <span>제목</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 80) }))}
                  placeholder="제목 입력"
                  autoComplete="off"
                />
              </label>

              <div className="todo-due-grid">
                <label className="change-field">
                  <span>마감일</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  />
                </label>
                <label className="change-field todo-time-field">
                  <span>시간 · 선택</span>
                  <input
                    type="time"
                    value={draft.dueTime}
                    onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                  />
                </label>
              </div>

              {draft.id ? (
                <button className="todo-delete-button" type="button" onClick={deleteEditing}>삭제</button>
              ) : null}
            </div>

            {serverSaveError ? <p className="change-warning">{serverSaveError}</p> : null}

            <div className="change-submit-row">
              <button type="button" onClick={() => setSheetOpen(false)}>취소</button>
              <button
                type="button"
                className="save-change"
                disabled={saveDisabled}
                onClick={submitCurrent}
              >
                {serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}
              </button>
            </div>
        </div>
      </UnifiedBottomSheet>
    </section>
  )
}
