import { useEffect, useMemo, useRef, useState } from 'react'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import {
  analyzeSchoolNotice,
  askSchoolHub,
  answerAndAnalyzeSchoolAttachments,
  reviewSchoolImportConflicts,
} from './s-hub-ai.js'
import { classifyAttachmentTextIntent } from './s-hub-ai-intent.js'
import { normalizeImportItem } from './s-hub-ai-core.js'
import { SHubAIOrb } from './s-hub-ai-orb.jsx'
import './s-hub-ai.css'

const REMINDER_TYPES = [
  { id: 'task', label: '일반' },
  { id: 'performance', label: '수행평가' },
  { id: 'exam', label: '시험' },
  { id: 'material', label: '준비물' },
]

const QUESTION_HINTS = [
  '이번 주에 뭐 제출해야 돼?',
  '다음 시험 언제야?',
  '내일 시간표 뭐야?',
  '이번 주 시간표 바뀐 거 있어?',
]

const NOTICE_HINTS = [
  '공지에 대해 덧붙일 설명이 있으면 적어줘.',
  '예: 이건 수행평가 공지야.',
  '예: 마감일과 준비물만 찾아줘.',
  '예: 시간표 변경도 같이 확인해줘.',
]

const WORKING_MESSAGES = {
  image: ['사진을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],
  file: ['파일을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],
  mixed: ['사진과 파일을 분석하는 중…', '학교 일정을 찾는 중…', '날짜와 내용을 확인하는 중…'],
  question: ['S-Hub 정보를 확인하는 중…', '관련 일정을 찾는 중…', '답변을 정리하는 중…'],
  conflict: ['기존 일정과 겹치는지 확인하는 중…', '추가할 위치를 확인하는 중…'],
  imageQuestion: ['사진과 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
  fileQuestion: ['파일과 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
  mixedQuestion: ['첨부와 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
}

function noticeWorkingMode(files) {
  const hasImage = files.some((file) => String(file?.type || '').startsWith('image/'))
  const hasOther = files.some((file) => !String(file?.type || '').startsWith('image/'))
  if (hasImage && hasOther) return 'mixed'
  return hasImage ? 'image' : 'file'
}

function attachmentQuestionWorkingMode(files) {
  const hasImage = files.some((file) => String(file?.type || '').startsWith('image/'))
  const hasOther = files.some((file) => !String(file?.type || '').startsWith('image/'))
  if (hasImage && hasOther) return 'mixedQuestion'
  return hasImage ? 'imageQuestion' : 'fileQuestion'
}

function kindLabel(item) {
  if (item.kind === 'reminder') {
    const type = REMINDER_TYPES.find((candidate) => candidate.id === item.type)?.label || '일반'
    return `리마인더 · ${type}`
  }
  if (item.kind === 'timetable_change') return '시간표 변경'
  return '학사일정'
}

function shortDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${month}/${day}`
}

function nativeDateDisplay(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return '선택'
  return `${month}/${day}/${String(year).slice(-2)}`
}

function nativeTimeDisplay(value) {
  const [hourValue, minuteValue] = String(value || '').split(':').map(Number)
  if (!Number.isInteger(hourValue) || !Number.isInteger(minuteValue)) return '선택'
  const period = hourValue < 12 ? '오전' : '오후'
  const hour = hourValue % 12 || 12
  return `${period} ${hour}:${String(minuteValue).padStart(2, '0')}`
}

function itemMeta(item) {
  const parts = []
  if (item.kind === 'reminder') {
    const date = shortDate(item.dueDate)
    if (date) parts.push(date)
    if (item.dueTime) parts.push(item.dueTime)
    return parts.join(' · ')
  }
  if (item.kind === 'timetable_change') {
    const date = shortDate(item.date)
    if (date) parts.push(date)
    if (item.period) parts.push(`${item.period}교시`)
    if (item.subject) parts.push(item.subject)
    return parts.join(' · ')
  }
  const start = shortDate(item.startDate)
  const end = shortDate(item.endDate)
  if (start && end) return start === end ? start : `${start}–${end}`
  return start || end || ''
}

function itemReviewLabel(item) {
  if (item.kind === 'reminder' && !shortDate(item.dueDate)) return '날짜 확인 필요'
  if (item.kind === 'timetable_change' && (!shortDate(item.date) || !item.period || !String(item.subject || '').trim())) {
    return '시간표 정보 확인 필요'
  }
  if (item.kind === 'academic' && (!shortDate(item.startDate) || !shortDate(item.endDate))) return '날짜 확인 필요'
  if (item.confidence === 'low' || item.valid === false) return '정보 확인 필요'
  return ''
}

function existingMeta(conflict) {
  const existing = conflict?.existing
  if (!existing) return ''
  if (conflict.existingKind === 'reminder') {
    return `${existing.title} · ${shortDate(existing.dueDate) || '날짜 미확인'}${existing.dueTime ? ` ${existing.dueTime}` : ''}`
  }
  if (conflict.existingKind === 'timetable_change') {
    return `${shortDate(existing.date) || '날짜 미확인'} · ${existing.period}교시 · ${existing.subject || '미설정'}`
  }
  return `${existing.title} · ${shortDate(existing.startDate) || '날짜 미확인'}`
}

function NativeDateField({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <span className="s-hub-ai-native-control">
        <span className="s-hub-ai-native-value" aria-hidden="true">{nativeDateDisplay(value)}</span>
        <input type="date" value={value || ''} onChange={onChange} />
      </span>
    </label>
  )
}

function NativeTimeField({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <span className="s-hub-ai-native-control">
        <span className="s-hub-ai-native-value" aria-hidden="true">{nativeTimeDisplay(value)}</span>
        <input type="time" value={value || ''} onChange={onChange} />
      </span>
    </label>
  )
}

function conflictTitle(conflict) {
  return conflict?.relation === 'duplicate' ? '비슷한 일정이 이미 있어' : '기존 일정과 정보가 달라'
}

function blankState() {
  return {
    mode: 'compose',
    answer: '',
    items: [],
    selected: {},
    conflicts: {},
    resolutions: {},
    saveResult: null,
  }
}

export function SchoolAISheet({
  open,
  onClose,
  now,
  context,
  conflictContext = context,
  onImportItems,
  requireOnline = () => true,
}) {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState([])
  const [state, setState] = useState(blankState)
  const [working, setWorking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState('')
  const [conflictsDirty, setConflictsDirty] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [hintFading, setHintFading] = useState(false)
  const [workingMode, setWorkingMode] = useState('question')
  const [workingMessageIndex, setWorkingMessageIndex] = useState(0)
  const [workingMessageFading, setWorkingMessageFading] = useState(false)
  const [workingFinishing, setWorkingFinishing] = useState(false)
  const fileInputRef = useRef(null)
  const requestControllerRef = useRef(null)
  const requestSequenceRef = useRef(0)
  const editingCloseRef = useRef('')

  useEffect(() => {
    if (!open) {
      requestSequenceRef.current += 1
      requestControllerRef.current?.abort()
      requestControllerRef.current = null
      editingCloseRef.current = ''
      setWorking(false)
      return
    }
    setInput('')
    setFiles([])
    setState(blankState())
    setWorking(false)
    setSaving(false)
    setError('')
    editingCloseRef.current = ''
    setEditingId('')
    setConflictsDirty(false)
    setHintIndex(0)
    setHintFading(false)
    setWorkingMode('question')
    setWorkingMessageIndex(0)
    setWorkingMessageFading(false)
    setWorkingFinishing(false)
  }, [open])

  useEffect(() => {
    setHintIndex(0)
    setHintFading(false)
  }, [files.length])

  useEffect(() => {
    if (!open || input) {
      setHintFading(false)
      return undefined
    }

    let swapTimer = 0
    const interval = window.setInterval(() => {
      setHintFading(true)
      window.clearTimeout(swapTimer)
      swapTimer = window.setTimeout(() => {
        const hintCount = files.length ? NOTICE_HINTS.length : QUESTION_HINTS.length
        setHintIndex((current) => (current + 1) % hintCount)
        setHintFading(false)
      }, 220)
    }, 2500)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(swapTimer)
    }
  }, [open, input, files.length])

  useEffect(() => {
    if (!working) {
      setWorkingMessageFading(false)
      return undefined
    }

    const pool = WORKING_MESSAGES[workingMode] || WORKING_MESSAGES.question
    let swapTimer = 0
    let fadeTimer = 0

    const scheduleSwap = () => {
      const delay = 1550 + Math.round(Math.random() * 850)
      swapTimer = window.setTimeout(() => {
        setWorkingMessageFading(true)
        fadeTimer = window.setTimeout(() => {
          setWorkingMessageIndex((current) => (current + 1) % pool.length)
          setWorkingMessageFading(false)
          scheduleSwap()
        }, 240)
      }, delay)
    }

    scheduleSwap()
    return () => {
      window.clearTimeout(swapTimer)
      window.clearTimeout(fadeTimer)
    }
  }, [working, workingMode])

  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items, state.selected])
  const validSelectedItems = useMemo(() => selectedItems.filter((item) => item.valid !== false), [selectedItems])
  const hintPool = files.length ? NOTICE_HINTS : QUESTION_HINTS
  const rotatingHint = hintPool[hintIndex % hintPool.length]
  const workingPool = WORKING_MESSAGES[workingMode] || WORKING_MESSAGES.question
  const workingMessage = workingPool[workingMessageIndex % workingPool.length]
  const attachmentIntent = files.length ? classifyAttachmentTextIntent(input) : 'answer'
  const primaryActionLabel = files.length && attachmentIntent !== 'answer' ? '공지 분석' : '질문하기'

  function cancelAIRequest() {
    requestSequenceRef.current += 1
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    setWorking(false)
    setWorkingMessageFading(false)
    setWorkingFinishing(false)
  }

  function showWorkingMode(mode) {
    setWorkingMode(mode)
    setWorkingMessageIndex(0)
    setWorkingMessageFading(false)
    setWorkingFinishing(false)
  }

  async function finishWorkingStage(requestId) {
    if (requestSequenceRef.current !== requestId) return false
    setWorkingFinishing(true)
    setWorkingMessageFading(true)
    await new Promise((resolve) => window.setTimeout(resolve, 140))
    return requestSequenceRef.current === requestId
  }

  function beginAIRequest() {
    requestSequenceRef.current += 1
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    const requestId = requestSequenceRef.current
    requestControllerRef.current = controller
    return { controller, requestId }
  }

  function close() {
    if (saving) return
    cancelAIRequest()
    onClose()
  }

  function chooseFiles(event) {
    const incoming = Array.from(event.target.files || []).filter((file) => file instanceof File)
    if (!incoming.length) return
    setFiles((current) => {
      const next = [...current]
      incoming.forEach((file) => {
        const duplicate = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
        if (!duplicate && next.length < 4) next.push(file)
      })
      return next
    })
    setError('')
    event.target.value = ''
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function applyConflictSelection(items, conflicts, previousSelected = {}, previousResolutions = {}) {
    const selected = {}
    const resolutions = { ...previousResolutions }
    items.forEach((item) => {
      const conflict = conflicts[item.id]
      const previousResolution = resolutions[item.id]
      if (item.valid === false || item.confidence === 'low') {
        selected[item.id] = false
        return
      }
      if (conflict) {
        if (previousResolution === 'new' || previousResolution === 'replace') selected[item.id] = true
        else {
          selected[item.id] = false
          resolutions[item.id] = 'skip'
        }
        return
      }
      selected[item.id] = previousSelected[item.id] ?? true
      delete resolutions[item.id]
    })
    return { selected, resolutions }
  }

  async function reviewConflicts(items, { preserveChoices = false } = {}) {
    const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now)
    const choices = applyConflictSelection(
      items,
      conflicts,
      preserveChoices ? state.selected : {},
      preserveChoices ? state.resolutions : {},
    )
    setState((current) => ({
      ...current,
      conflicts,
      selected: choices.selected,
      resolutions: choices.resolutions,
    }))
    setConflictsDirty(false)
    return conflicts
  }

  async function analyzeNotice() {
    if (!requireOnline('공지 이미지를 분석')) return
    if (!input.trim() && !files.length) return
    const { controller, requestId } = beginAIRequest()
    showWorkingMode(noticeWorkingMode(files))
    setWorking(true)
    setError('')
    setEditingId('')
    try {
      const result = await analyzeSchoolNotice({ text: input, files, context, conflictContext, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!result.items.length) {
        if (!await finishWorkingStage(requestId)) return
        setState((current) => ({ ...current, mode: 'import', items: [], selected: {}, conflicts: {}, resolutions: {} }))
        setError(result.skippedExisting?.length
          ? '이미 S-Hub에 등록된 내용이라 새로 추가할 항목이 없어.'
          : '등록할 수 있는 학교 일정을 찾지 못했어. 날짜나 공지 내용이 보이는지 확인해줘.')
        return
      }
      const items = result.items
      showWorkingMode('conflict')
      const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!await finishWorkingStage(requestId)) return
      const choices = applyConflictSelection(items, conflicts)
      setState({
        mode: 'import',
        answer: '',
        items,
        selected: choices.selected,
        conflicts,
        resolutions: choices.resolutions,
        saveResult: null,
      })
      setConflictsDirty(false)
    } catch (requestError) {
      if (requestSequenceRef.current !== requestId || controller.signal.aborted || requestError?.code === 'school-ai/cancelled') return
      console.error('S-Hub notice analysis failed:', requestError)
      setError(requestError?.message || '공지 분석에 실패했어. 다시 시도해줘.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setWorking(false)
        setWorkingFinishing(false)
        if (requestControllerRef.current === controller) requestControllerRef.current = null
      }
    }
  }

  async function askAttachmentQuestion() {
    const question = input.trim()
    if (question.length < 2 || !files.length || !requireOnline('첨부 내용에 질문')) return
    const { controller, requestId } = beginAIRequest()
    showWorkingMode(attachmentQuestionWorkingMode(files))
    setWorking(true)
    setError('')
    setEditingId('')
    try {
      const result = await answerAndAnalyzeSchoolAttachments({ question, files, context, conflictContext, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      const items = result.items || []
      if (items.length) {
        showWorkingMode('conflict')
        const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })
        if (requestSequenceRef.current !== requestId) return
        if (!await finishWorkingStage(requestId)) return
        const choices = applyConflictSelection(items, conflicts)
        setState({
          mode: 'import',
          answer: result.answer,
          items,
          selected: choices.selected,
          conflicts,
          resolutions: choices.resolutions,
          saveResult: null,
        })
        setConflictsDirty(false)
      } else {
        if (!await finishWorkingStage(requestId)) return
        setState((current) => ({ ...current, mode: 'answer', answer: result.answer, items: [], selected: {}, conflicts: {}, resolutions: {}, saveResult: null }))
      }
    } catch (requestError) {
      if (requestSequenceRef.current !== requestId || controller.signal.aborted || requestError?.code === 'school-ai/cancelled') return
      console.error('S-Hub attachment question failed:', requestError)
      setError(requestError?.message || '첨부 내용을 바탕으로 답하지 못했어. 다시 시도해줘.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setWorking(false)
        setWorkingFinishing(false)
        if (requestControllerRef.current === controller) requestControllerRef.current = null
      }
    }
  }

  async function askQuestion() {
    const question = input.trim()
    if (question.length < 2 || !requireOnline('S-Hub에 질문')) return
    const { controller, requestId } = beginAIRequest()
    showWorkingMode('question')
    setWorking(true)
    setError('')
    setEditingId('')
    try {
      const result = await askSchoolHub({ question, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!await finishWorkingStage(requestId)) return
      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))
    } catch (requestError) {
      if (requestSequenceRef.current !== requestId || controller.signal.aborted || requestError?.code === 'school-ai/cancelled') return
      console.error('S-Hub question failed:', requestError)
      setError(requestError?.message || '질문에 답하지 못했어. 다시 시도해줘.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setWorking(false)
        setWorkingFinishing(false)
        if (requestControllerRef.current === controller) requestControllerRef.current = null
      }
    }
  }

  function runPrimary() {
    if (!files.length) {
      void askQuestion()
      return
    }
    if (classifyAttachmentTextIntent(input) === 'answer') void askAttachmentQuestion()
    else void analyzeNotice()
  }

  function toggleSelected(id) {
    const item = state.items.find((candidate) => candidate.id === id)
    if (!item || item.valid === false || state.conflicts[id]) return
    setState((current) => ({
      ...current,
      selected: { ...current.selected, [id]: !current.selected[id] },
    }))
  }

  function setResolution(id, resolution) {
    setState((current) => ({
      ...current,
      resolutions: { ...current.resolutions, [id]: resolution },
      selected: { ...current.selected, [id]: resolution !== 'skip' },
    }))
  }

  async function toggleEditor(id, event) {
    if (editingId !== id) {
      editingCloseRef.current = ''
      setEditingId(id)
      return
    }
    if (editingCloseRef.current === id) return

    const editor = event.currentTarget.closest('.s-hub-ai-item')?.querySelector('.s-hub-ai-editor')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!editor || reducedMotion || typeof editor.animate !== 'function') {
      setEditingId('')
      return
    }

    editingCloseRef.current = id
    editor.getAnimations().forEach((animation) => animation.cancel())
    const animation = editor.animate([
      {
        maxHeight: `${Math.max(editor.scrollHeight, 1)}px`,
        marginTop: '12px',
        paddingTop: '12px',
        paddingBottom: '12px',
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
      },
      {
        maxHeight: '0px',
        marginTop: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        opacity: 0,
        transform: 'translate3d(0, -7px, 0) scale(0.985)',
      },
    ], {
      duration: 360,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    })

    try {
      await animation.finished
    } catch {
      // A replaced or cancelled animation can safely finish by removing the editor.
    }
    if (editingCloseRef.current !== id) return
    editingCloseRef.current = ''
    setEditingId((current) => current === id ? '' : current)
  }

  function updateItem(id, patch) {
    setState((current) => {
      const index = current.items.findIndex((item) => item.id === id)
      if (index < 0) return current
      const raw = { ...current.items[index], ...patch, confidence: 'high', reason: '직접 확인한 값' }
      const normalized = normalizeImportItem(raw, index, now)
      const nextItem = normalized || { ...raw, valid: false }
      const items = current.items.map((item) => item.id === id ? nextItem : item)
      const conflicts = { ...current.conflicts }
      const resolutions = { ...current.resolutions }
      delete conflicts[id]
      delete resolutions[id]
      return {
        ...current,
        items,
        conflicts,
        resolutions,
        selected: { ...current.selected, [id]: Boolean(nextItem.valid !== false) },
      }
    })
    setConflictsDirty(true)
    setError('')
  }

  async function saveImports() {
    if (!requireOnline('AI로 찾은 일정을 추가')) return
    if (working || saving) return
    setError('')
    setSaving(true)
    try {
      if (conflictsDirty) {
        const conflicts = await reviewConflicts(state.items, { preserveChoices: false })
        if (Object.keys(conflicts).length) {
          setError('수정한 항목을 다시 비교했어. 충돌 항목을 확인한 뒤 한 번 더 추가해줘.')
          return
        }
      }

      const ready = state.items
        .filter((item) => state.selected[item.id] && item.valid !== false)
        .map((item) => ({
          ...item,
          resolution: state.resolutions[item.id] || 'new',
          existingId: state.conflicts[item.id]?.existingId || '',
          existingSource: state.conflicts[item.id]?.existing?.source || '',
        }))

      if (!ready.length) {
        setError('추가할 항목을 하나 이상 선택해줘.')
        return
      }

      const result = await onImportItems(ready)
      setState((current) => ({ ...current, mode: 'result', saveResult: result }))
      if (result?.failed?.length) setError(`${result.failed.length}개는 저장하지 못했어. 아래 결과를 확인해줘.`)
    } catch (saveError) {
      console.error('S-Hub import save failed:', saveError)
      setError(saveError?.message || '일정을 저장하지 못했어.')
    } finally {
      setSaving(false)
    }
  }

  function startOver() {
    cancelAIRequest()
    setInput('')
    setFiles([])
    setState(blankState())
    setError('')
    editingCloseRef.current = ''
    setEditingId('')
    setConflictsDirty(false)
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={close}
      closeDisabled={saving}
      title="S-Hub AI"
      subtitle="학교 정보를 물어보거나 공지 캡처를 넣어줘."
      ariaLabel="S-Hub AI"
      className="s-hub-ai-sheet"
    >
      <div className="s-hub-ai-content">
        {working ? (
          <div className={`s-hub-ai-thinking-stage ${workingFinishing ? 'is-finishing' : ''}`.trim()} role="status" aria-live="polite" aria-atomic="true">
            <SHubAIOrb size={56} active />
            <p className={`s-hub-ai-thinking-copy ${workingMessageFading ? 'is-fading' : ''}`.trim()}>{workingMessage}</p>
          </div>
        ) : null}

        {!working && state.answer ? (
          <section className="s-hub-ai-answer" aria-live="polite">
            <span>답변</span>
            <p>{state.answer}</p>
          </section>
        ) : null}

        {!working && state.mode === 'import' ? (
          <section className="s-hub-ai-import">
            <div className="s-hub-ai-result-head">
              <strong>{state.answer ? '추가할 수 있는 항목' : `${state.items.length}개를 찾았어`}</strong>
              <span>{state.answer ? `${state.items.length}개를 찾았어. 저장 전 내용을 확인해줘.` : '저장 전 내용을 확인해줘.'}</span>
            </div>

            <div className="s-hub-ai-item-list">
              {state.items.map((item) => {
                const conflict = state.conflicts[item.id]
                const editing = editingId === item.id
                const selected = Boolean(state.selected[item.id])
                const reviewLabel = itemReviewLabel(item)
                const meta = itemMeta(item)
                const canReplace = conflict?.relation === 'conflict' && (
                  item.kind === 'reminder' ||
                  item.kind === 'timetable_change' ||
                  (item.kind === 'academic' && conflict?.existing?.source === 'custom')
                )
                return (
                  <article className={`s-hub-ai-item ${selected ? 'is-selected' : ''} ${item.valid === false ? 'is-invalid' : ''}`} key={item.id}>
                    <div className="s-hub-ai-item-row">
                      <button
                        className="s-hub-ai-check"
                        type="button"
                        aria-label={`${item.title || kindLabel(item)} ${selected ? '선택 해제' : '선택'}`}
                        aria-pressed={selected}
                        disabled={item.valid === false || Boolean(conflict)}
                        onClick={() => toggleSelected(item.id)}
                      >
                        <span />
                      </button>
                      <div className="s-hub-ai-item-main">
                        <span>{kindLabel(item)}</span>
                        <strong>{item.title || '제목 미확인'}</strong>
                        {meta ? <small>{meta}</small> : null}
                        {reviewLabel ? <em>{reviewLabel}</em> : null}
                      </div>
                      <button
                        className={`s-hub-ai-edit ${editing ? 'is-done' : ''}`.trim()}
                        type="button"
                        onClick={(event) => void toggleEditor(item.id, event)}
                      >
                        {editing ? '완료' : '수정'}
                      </button>
                    </div>

                    {editing ? (
                      <div className="s-hub-ai-editor">
                        {item.kind === 'reminder' ? (
                          <>
                            <label><span>종류</span><select value={item.type || 'task'} onChange={(event) => updateItem(item.id, { type: event.target.value })}>{REMINDER_TYPES.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}</select></label>
                            <label><span>제목</span><input value={item.title || ''} onChange={(event) => updateItem(item.id, { title: event.target.value })} /></label>
                            <div className="s-hub-ai-editor-grid">
                              <NativeDateField label="날짜" value={item.dueDate} onChange={(event) => updateItem(item.id, { dueDate: event.target.value })} />
                              <NativeTimeField label="시간" value={item.dueTime} onChange={(event) => updateItem(item.id, { dueTime: event.target.value })} />
                            </div>
                          </>
                        ) : item.kind === 'timetable_change' ? (
                          <>
                            <NativeDateField label="날짜" value={item.date} onChange={(event) => updateItem(item.id, { date: event.target.value })} />
                            <div className="s-hub-ai-editor-grid">
                              <label><span>교시</span><select value={item.period || ''} onChange={(event) => updateItem(item.id, { period: Number(event.target.value) })}><option value="">선택</option>{[1,2,3,4,5,6,7].map((period) => <option value={period} key={period}>{period}교시</option>)}</select></label>
                              <label><span>변경 과목</span><input value={item.subject || ''} onChange={(event) => updateItem(item.id, { subject: event.target.value })} /></label>
                            </div>
                          </>
                        ) : (
                          <>
                            <label><span>일정</span><input value={item.title || ''} onChange={(event) => updateItem(item.id, { title: event.target.value })} /></label>
                            <div className="s-hub-ai-editor-grid">
                              <NativeDateField label="시작" value={item.startDate} onChange={(event) => updateItem(item.id, { startDate: event.target.value })} />
                              <NativeDateField label="종료" value={item.endDate} onChange={(event) => updateItem(item.id, { endDate: event.target.value })} />
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}

                    {conflict ? (
                      <div className="s-hub-ai-conflict">
                        <strong>{conflictTitle(conflict)}</strong>
                        <p>{existingMeta(conflict)}</p>
                        {conflict.reason ? <small>{conflict.reason}</small> : null}
                        <div>
                          <button type="button" onClick={() => setResolution(item.id, 'skip')}>제외</button>
                          {canReplace ? <button type="button" onClick={() => setResolution(item.id, 'replace')}>기존 수정</button> : null}
                          {item.kind !== 'timetable_change' ? <button type="button" onClick={() => setResolution(item.id, 'new')}>그래도 추가</button> : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {!working && state.mode === 'result' ? (
          <section className="s-hub-ai-save-result">
            <strong>{state.saveResult?.saved?.length || 0}개 추가했어</strong>
            {state.saveResult?.failed?.length ? (
              <div>
                {state.saveResult.failed.map((failed, index) => (
                  <p key={`${failed?.item?.id || 'failed'}-${index}`}>{failed?.item?.title || kindLabel(failed?.item || {})} · {failed?.message || '저장 실패'}</p>
                ))}
              </div>
            ) : <p>확인한 내용만 기존 S-Hub 데이터에 반영했어.</p>}
          </section>
        ) : null}

        {!working && (state.mode === 'compose' || state.mode === 'answer') ? (
          <div className="s-hub-ai-compose">
            <textarea
              className={hintFading ? 'is-hint-fading' : ''}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 500))}
              placeholder={rotatingHint}
              rows={3}
              disabled={working}
            />
            {files.length ? (
              <div className="s-hub-ai-files">
                {files.map((file, index) => (
                  <span key={`${file.name}-${file.size}-${index}`}>
                    <b>{file.name}</b>
                    <button type="button" onClick={() => removeFile(index)} aria-label={`${file.name} 제거`}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="s-hub-ai-compose-actions">
              <input
                ref={fileInputRef}
                className="s-hub-ai-file-input"
                type="file"
                multiple
                accept="image/*,application/pdf,application/json,text/plain,text/csv,text/rtf,text/html,text/xml"
                onChange={chooseFiles}
              />
              <button type="button" className="s-hub-ai-attach" onClick={() => fileInputRef.current?.click()} disabled={working || files.length >= 4}>사진·파일</button>
              <button type="button" className="s-hub-ai-primary" onClick={runPrimary} disabled={working || (!input.trim() && !files.length)}>
                {working ? '확인 중…' : primaryActionLabel}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="s-hub-ai-error" role="alert">{error}</p> : null}

        {state.mode === 'import' ? (
          <div className="s-hub-ai-footer">
            <button type="button" onClick={startOver} disabled={saving}>다시 하기</button>
            <button type="button" className="s-hub-ai-primary" onClick={saveImports} disabled={saving || !validSelectedItems.length}>
              {saving ? '저장 중…' : `${validSelectedItems.length}개 추가`}
            </button>
          </div>
        ) : state.mode === 'result' ? (
          <div className="s-hub-ai-footer">
            <button type="button" onClick={startOver}>새로 하기</button>
            <button type="button" className="s-hub-ai-primary" onClick={close}>완료</button>
          </div>
        ) : null}
      </div>
    </UnifiedBottomSheet>
  )
}
