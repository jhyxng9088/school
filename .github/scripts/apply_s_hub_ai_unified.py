from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one exact match, found {count}')
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, replacement, flags=re.S):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: expected one regex match, found {count}: {pattern[:80]}')
    write(path, next_text)


# 1) One transport for all S-Hub AI modes, with a caller-cancellable signal.
path = 'src/s-hub-ai-transport.js'
replace_once(path,
"""  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
} = {}) {""",
"""  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
  purpose = 'school',
  signal = null,
} = {}) {""")
replace_once(path,
"""  const controller = new AbortController()
  const clientTimeout = Math.min(
    MAX_CLIENT_TIMEOUT_MS,
    Math.max(12_000, Number(timeoutMs || 26000) + 10_000),
  )
  const timeoutId = window.setTimeout(() => controller.abort(), clientTimeout)
""",
"""  const controller = new AbortController()
  const callerSignal = signal && typeof signal.addEventListener === 'function' ? signal : null
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  const clientTimeout = Math.min(
    MAX_CLIENT_TIMEOUT_MS,
    Math.max(12_000, Number(timeoutMs || 26000) + 10_000),
  )
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, clientTimeout)
""")
replace_once(path,
"""      body: JSON.stringify({
        prompt: safePrompt.slice(0, 40_000),
""",
"""      body: JSON.stringify({
        purpose: purpose === 'reminder' ? 'reminder' : 'school',
        prompt: safePrompt.slice(0, 40_000),
""")
replace_once(path,
"""    if (error?.name === 'AbortError') {
      throw transportError('AI 응답 시간이 초과됐어. 다시 시도해줘.', 'school-ai/server-timeout', 504)
    }
""",
"""    if (error?.name === 'AbortError') {
      if (!timedOut && callerSignal?.aborted) {
        throw transportError('S-Hub AI 요청을 취소했어.', 'school-ai/cancelled', 499)
      }
      throw transportError('AI 응답 시간이 초과됐어. 다시 시도해줘.', 'school-ai/server-timeout', 504)
    }
""")
replace_once(path,
"""  } finally {
    window.clearTimeout(timeoutId)
  }
}""",
"""  } finally {
    window.clearTimeout(timeoutId)
    callerSignal?.removeEventListener?.('abort', abortFromCaller)
  }
}""")

# 2) Explicit school-mode calls and cancellable conflict review.
path = 'src/s-hub-ai.js'
replace_once(path,
"export async function analyzeSchoolNotice({ text = '', files = [], context = {}, now = new Date() } = {}) {",
"export async function analyzeSchoolNotice({ text = '', files = [], context = {}, now = new Date(), signal = null } = {}) {")
replace_once(path,
"""      timeoutMs: attachments.length ? 45000 : 26000,
      temperature: 0.05,
""",
"""      timeoutMs: attachments.length ? 45000 : 26000,
      temperature: 0.05,
      purpose: 'school',
      signal,
""")
replace_once(path,
"export async function askSchoolHub({ question = '', context = {}, now = new Date() } = {}) {",
"export async function askSchoolHub({ question = '', context = {}, now = new Date(), signal = null } = {}) {")
replace_once(path,
"""      timeoutMs: 26000,
      temperature: 0.05,
    })
    const answer""",
"""      timeoutMs: 26000,
      temperature: 0.05,
      purpose: 'school',
      signal,
    })
    const answer""")
replace_once(path,
"async function semanticConflictReview(items, context, now) {",
"async function semanticConflictReview(items, context, now, signal = null) {")
replace_once(path,
"""    timeoutMs: 24000,
    temperature: 0,
  })
  return Array.isArray(generated?.value?.conflicts) ? generated.value.conflicts : []
}

export async function reviewSchoolImportConflicts(items, context, now = new Date()) {""",
"""    timeoutMs: 24000,
    temperature: 0,
    purpose: 'school',
    signal,
  })
  return Array.isArray(generated?.value?.conflicts) ? generated.value.conflicts : []
}

export async function reviewSchoolImportConflicts(items, context, now = new Date(), { signal = null } = {}) {""")
replace_once(path,
"""    const semantic = await semanticConflictReview(candidates, context, now)
""",
"""    const semantic = await semanticConflictReview(candidates, context, now, signal)
""")
replace_once(path,
"""  } catch (error) {
    // Semantic review is advisory. Deterministic conflict checks remain authoritative
    // and a transient AI outage must never break normal saving.
    console.warn('S-Hub semantic conflict review unavailable:', error)
  }
""",
"""  } catch (error) {
    if (signal?.aborted || error?.code === 'school-ai/cancelled') throw error
    // Semantic review is advisory. Deterministic conflict checks remain authoritative
    // and a transient AI outage must never break normal saving.
    console.warn('S-Hub semantic conflict review unavailable:', error)
  }
""")

# 3) Reminder mode uses the same S-Hub AI transport, but declares its purpose.
path = 'src/firebase-ai.js'
replace_once(path,
"""    timeoutMs: wantsSummary ? ATTACHMENT_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS,
    temperature: 0.1,
  })
""",
"""    timeoutMs: wantsSummary ? ATTACHMENT_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS,
    temperature: 0.1,
    purpose: 'reminder',
  })
""")

# 4) Backend chooses a fast attachment profile only for reminder mode.
path = 'push-backend-v2/api/s-hub-ai.js'
replace_once(path,
"""    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const prompt = String(body.prompt || '').trim()
""",
"""    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const purpose = body.purpose === 'reminder' ? 'reminder' : 'school'
    const prompt = String(body.prompt || '').trim()
""")
replace_once(path,
"""      timeoutMs: body.timeoutMs,
      temperature: body.temperature,
    })
""",
"""      timeoutMs: body.timeoutMs,
      temperature: body.temperature,
      purpose,
    })
""")

path = 'push-backend-v2/lib/s-hub-ai-service.js'
replace_once(path,
"""const ATTACHMENT_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]
""",
"""const ATTACHMENT_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]
const REMINDER_ATTACHMENT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
]
""")
replace_once(path,
"""  temperature = 0.05,
  models = null,
}) {""",
"""  temperature = 0.05,
  models = null,
  purpose = 'school',
}) {""")
replace_once(path,
"""  const preferredModels = Array.isArray(models) && models.length
    ? models
    : (parts.length ? ATTACHMENT_MODELS : TEXT_MODELS)

  for (const modelName of preferredModels.slice(0, 4)) {
""",
"""  const preferredModels = Array.isArray(models) && models.length
    ? models
    : parts.length
      ? (purpose === 'reminder' ? REMINDER_ATTACHMENT_MODELS : ATTACHMENT_MODELS)
      : TEXT_MODELS
  const attachmentAttemptCap = purpose === 'reminder' ? 9000 : 20000

  for (const modelName of preferredModels.slice(0, 4)) {
""")
replace_once(path,
"""    const attemptTimeout = Math.max(2000, Math.min(remaining, parts.length ? 20_000 : 10_000))
""",
"""    const attemptTimeout = Math.max(2000, Math.min(remaining, parts.length ? attachmentAttemptCap : 10_000))
""")
replace_once(path,
"""      const status = Number(error?.status || 0)
      if ([400, 401, 403].includes(status)) break
""",
"""      const status = Number(error?.status || 0)
      if ([401, 403].includes(status)) break
      if (status === 400 && !String(error?.code || '').toUpperCase().includes('INVALID_ARGUMENT')) break
""")

# 5) S-Hub AI sheet: one name, cancellable analysis, clearer destinations, one review warning, iOS-safe date controls.
path = 'src/s-hub-ai-sheet.jsx'
replace_once(path,
"""function kindLabel(item) {
  if (item.kind === 'reminder') return REMINDER_TYPES.find((type) => type.id === item.type)?.label || '리마인더'
  if (item.kind === 'timetable_change') return '시간표 변경'
  return '학사일정'
}

function shortDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return '날짜 확인 필요'
  return `${month}/${day}`
}

function itemMeta(item) {
  if (item.kind === 'reminder') {
    return `${shortDate(item.dueDate)}${item.dueTime ? ` · ${item.dueTime}` : ''}`
  }
  if (item.kind === 'timetable_change') {
    return `${shortDate(item.date)} · ${item.period || '?'}교시 · ${item.subject || '과목 확인 필요'}`
  }
  const range = item.startDate === item.endDate
    ? shortDate(item.startDate)
    : `${shortDate(item.startDate)}–${shortDate(item.endDate)}`
  return range
}

function existingMeta(conflict) {
  const existing = conflict?.existing
  if (!existing) return ''
  if (conflict.existingKind === 'reminder') {
    return `${existing.title} · ${shortDate(existing.dueDate)}${existing.dueTime ? ` ${existing.dueTime}` : ''}`
  }
  if (conflict.existingKind === 'timetable_change') {
    return `${shortDate(existing.date)} · ${existing.period}교시 · ${existing.subject || '미설정'}`
  }
  return `${existing.title} · ${shortDate(existing.startDate)}`
}
""",
"""function kindLabel(item) {
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
""")
replace_once(path,
"""  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
""",
"""  const [working, setWorking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
""")
replace_once(path,
"""  const [hintFading, setHintFading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
""",
"""  const [hintFading, setHintFading] = useState(false)
  const fileInputRef = useRef(null)
  const requestControllerRef = useRef(null)
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    if (!open) {
      requestSequenceRef.current += 1
      requestControllerRef.current?.abort()
      requestControllerRef.current = null
      setWorking(false)
      return
    }
""")
replace_once(path,
"""    setWorking(false)
    setError('')
""",
"""    setWorking(false)
    setSaving(false)
    setError('')
""")
replace_once(path,
"""  function close() {
    if (working) return
    onClose()
  }
""",
"""  function cancelAIRequest() {
    requestSequenceRef.current += 1
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    setWorking(false)
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
""")
sub_once(path,
r"  async function analyzeNotice\(\) \{.*?\n  \}\n\n  async function askQuestion\(\) \{.*?\n  \}\n\n  function runPrimary\(\) \{",
"""  async function analyzeNotice() {
    if (!requireOnline('공지 이미지를 분석')) return
    if (!input.trim() && !files.length) return
    const { controller, requestId } = beginAIRequest()
    setWorking(true)
    setError('')
    setEditingId('')
    try {
      const result = await analyzeSchoolNotice({ text: input, files, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!result.items.length) {
        setState((current) => ({ ...current, mode: 'import', items: [], selected: {}, conflicts: {}, resolutions: {} }))
        setError('등록할 수 있는 학교 일정을 찾지 못했어. 날짜나 공지 내용이 보이는지 확인해줘.')
        return
      }
      const items = result.items
      const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
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
        if (requestControllerRef.current === controller) requestControllerRef.current = null
      }
    }
  }

  async function askQuestion() {
    const question = input.trim()
    if (question.length < 2 || !requireOnline('S-Hub에 질문')) return
    const { controller, requestId } = beginAIRequest()
    setWorking(true)
    setError('')
    setEditingId('')
    try {
      const result = await askSchoolHub({ question, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))
    } catch (requestError) {
      if (requestSequenceRef.current !== requestId || controller.signal.aborted || requestError?.code === 'school-ai/cancelled') return
      console.error('S-Hub question failed:', requestError)
      setError(requestError?.message || '질문에 답하지 못했어. 다시 시도해줘.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setWorking(false)
        if (requestControllerRef.current === controller) requestControllerRef.current = null
      }
    }
  }

  function runPrimary() {""")
sub_once(path,
r"  async function saveImports\(\) \{.*?\n  \}\n\n  function startOver\(\) \{",
"""  async function saveImports() {
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

  function startOver() {""")
replace_once(path,
"""  function startOver() {
    setInput('')
""",
"""  function startOver() {
    cancelAIRequest()
    setInput('')
""")
replace_once(path,
"""      onClose={close}
      closeDisabled={working}
      title="S-Hub"
""",
"""      onClose={close}
      closeDisabled={saving}
      title="S-Hub AI"
""")
replace_once(path,
"""                const selected = Boolean(state.selected[item.id])
                const canReplace = conflict?.relation === 'conflict' && (
""",
"""                const selected = Boolean(state.selected[item.id])
                const reviewLabel = itemReviewLabel(item)
                const meta = itemMeta(item)
                const canReplace = conflict?.relation === 'conflict' && (
""")
replace_once(path,
"""                        <span>{kindLabel(item)}</span>
                        <strong>{item.title || '내용 확인 필요'}</strong>
                        <small>{itemMeta(item)}</small>
                        {item.confidence === 'low' || item.valid === false ? <em>정보 확인 필요</em> : null}
""",
"""                        <span>{kindLabel(item)}</span>
                        <strong>{item.title || '제목 미확인'}</strong>
                        {meta ? <small>{meta}</small> : null}
                        {reviewLabel ? <em>{reviewLabel}</em> : null}
""")
replace_once(path,
"""                        className="s-hub-ai-edit"
""",
"""                        className={`s-hub-ai-edit ${editing ? 'is-done' : ''}`.trim()}
""")
replace_once(path,
"""                            <div className="s-hub-ai-editor-grid">
                              <label><span>날짜</span><input type="date" value={item.dueDate || ''} onChange={(event) => updateItem(item.id, { dueDate: event.target.value })} /></label>
                              <label><span>시간</span><input type="time" value={item.dueTime || ''} onChange={(event) => updateItem(item.id, { dueTime: event.target.value })} /></label>
                            </div>
""",
"""                            <div className="s-hub-ai-editor-grid">
                              <NativeDateField label="날짜" value={item.dueDate} onChange={(event) => updateItem(item.id, { dueDate: event.target.value })} />
                              <NativeTimeField label="시간" value={item.dueTime} onChange={(event) => updateItem(item.id, { dueTime: event.target.value })} />
                            </div>
""")
replace_once(path,
"""                            <label><span>날짜</span><input type="date" value={item.date || ''} onChange={(event) => updateItem(item.id, { date: event.target.value })} /></label>
""",
"""                            <NativeDateField label="날짜" value={item.date} onChange={(event) => updateItem(item.id, { date: event.target.value })} />
""")
replace_once(path,
"""                            <div className="s-hub-ai-editor-grid">
                              <label><span>시작</span><input type="date" value={item.startDate || ''} onChange={(event) => updateItem(item.id, { startDate: event.target.value })} /></label>
                              <label><span>종료</span><input type="date" value={item.endDate || ''} onChange={(event) => updateItem(item.id, { endDate: event.target.value })} /></label>
                            </div>
""",
"""                            <div className="s-hub-ai-editor-grid">
                              <NativeDateField label="시작" value={item.startDate} onChange={(event) => updateItem(item.id, { startDate: event.target.value })} />
                              <NativeDateField label="종료" value={item.endDate} onChange={(event) => updateItem(item.id, { endDate: event.target.value })} />
                            </div>
""")
replace_once(path,
"""            <button type="button" onClick={startOver} disabled={working}>다시 하기</button>
            <button type="button" className="s-hub-ai-primary" onClick={saveImports} disabled={working || !validSelectedItems.length}>
              {working ? '확인 중…' : `${validSelectedItems.length}개 추가`}
""",
"""            <button type="button" onClick={startOver} disabled={saving}>다시 하기</button>
            <button type="button" className="s-hub-ai-primary" onClick={saveImports} disabled={saving || !validSelectedItems.length}>
              {saving ? '저장 중…' : `${validSelectedItems.length}개 추가`}
""")

# 6) S-Hub item editor visual fixes and native date/time controls.
path = 'src/s-hub-ai.css'
replace_once(path,
""".s-hub-ai-item-main > span {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 650;
}
""",
""".s-hub-ai-item-main > span {
  width: max-content;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
""")
replace_once(path,
""".s-hub-ai-edit {
  min-height: 34px;
  padding: 0 9px;
  border-radius: 11px;
  background: transparent;
  font-size: 12px;
}
""",
""".s-hub-ai-edit {
  min-width: 58px;
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 12px;
}

.s-hub-ai-edit.is-done {
  border-color: var(--text);
  background: var(--text);
  color: var(--bg);
}
""")
replace_once(path,
""".s-hub-ai-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
""",
""".s-hub-ai-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}

.s-hub-ai-editor-grid > label,
.s-hub-ai-editor > label {
  min-width: 0;
}

.s-hub-ai-native-control {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  height: 42px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
}

.s-hub-ai-native-value {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0 10px;
  box-sizing: border-box;
  color: var(--text);
  font-size: 13px;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}

.s-hub-ai-native-control:focus-within {
  border-color: var(--text-tertiary);
}

.s-hub-ai-native-control > input[type="date"],
.s-hub-ai-native-control > input[type="time"] {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  max-width: none;
  margin: 0;
  padding: 0 10px;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: transparent;
  opacity: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.s-hub-ai-native-control > input[type="date"]::-webkit-calendar-picker-indicator,
.s-hub-ai-native-control > input[type="time"]::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}

.s-hub-ai-native-control > input[type="date"]::-webkit-date-and-time-value,
.s-hub-ai-native-control > input[type="time"]::-webkit-date-and-time-value,
.s-hub-ai-native-control > input[type="date"]::-webkit-datetime-edit,
.s-hub-ai-native-control > input[type="time"]::-webkit-datetime-edit,
.s-hub-ai-native-control > input[type="date"]::-webkit-datetime-edit-fields-wrapper,
.s-hub-ai-native-control > input[type="time"]::-webkit-datetime-edit-fields-wrapper {
  width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  text-align: center !important;
}
""")

# 7) Reminder surface presents only one S-Hub AI progress message.
path = 'src/todo-stage5-ai.jsx'
replace_once(path,
"""  if (/timed out|timeout|gemini-3\.[67]/i.test(message)) {
    return '이미지 분석 시간이 초과됐어. 최적화된 이미지로 다시 분석해줘.'
  }
  return message || '첨부 분석에 실패했어. 다시 시도해줘.'
""",
"""  if (/timed out|timeout|gemini-3\.[67]/i.test(message)) {
    return 'S-Hub AI 응답이 늦어졌어. 다시 분석해줘.'
  }
  return message || 'S-Hub AI 첨부 분석에 실패했어. 다시 시도해줘.'
""")
replace_once(path,
"""              <AttachmentPicker
                files={attachmentFiles}
                busy={summaryBusy}
                ready={summaryState === 'ready'}
                error={attachmentFiles.length && summaryState === 'error' ? attachmentErrorMessage(summaryError) : ''}
""",
"""              <AttachmentPicker
                files={attachmentFiles}
                error={attachmentFiles.length && summaryState === 'error' ? attachmentErrorMessage(summaryError) : ''}
""")
replace_once(path,
"""              {attachmentFiles.length && aiBusy && !aiResult ? (
                <section className="reminder-parse-preview is-title-loading" aria-live="polite">
                  <p>첨부에서 제목을 찾는 중</p>
                  <strong>제목 분석 중…</strong>
                  <small className="reminder-ai-status is-working">전체 요약도 동시에 시작했어.</small>
                </section>
              ) : naturalResult ? (
""",
"""              {attachmentFiles.length && aiBusy && !aiResult ? (
                <section className="reminder-parse-preview is-title-loading" aria-live="polite">
                  <strong>S-Hub AI가 첨부를 분석 중…</strong>
                </section>
              ) : naturalResult ? (
""")
replace_once(path,
"""                  {aiBusy ? (
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
""",
"""                  {aiBusy ? (
                    <small className="reminder-ai-status is-working">S-Hub AI가 내용을 정리 중…</small>
                  ) : aiState === 'ready' && !attachmentFiles.length && aiAdjusted ? (
                    <small className="reminder-ai-status is-ready">S-Hub AI가 오타·축약을 보정했어.</small>
                  ) : aiState === 'error' && !attachmentFiles.length ? (
                    <small className="reminder-ai-status">S-Hub AI 연결이 안 돼서 기기 분석 결과를 사용할 수 있어.</small>
                  ) : naturalResult.assumedDate ? (
""")
replace_once(path,
"""        subtitle={sheetMode === 'natural' ? '해야 할 일을 그냥 한 문장으로 적어.' : '필요한 정보만 직접 수정해.'}
""",
"""        subtitle={sheetMode === 'natural' ? '문장이나 첨부를 S-Hub AI가 리마인더로 정리해.' : '필요한 정보만 직접 수정해.'}
""")

# 8) Backend unit guard for reminder-specific model profile.
path = 'push-backend-v2/test/s-hub-ai-service.test.js'
replace_once(path,
"test('text requests prefer Flash Lite while attachments prefer multimodal Flash', async () => {",
"test('school and reminder requests use their intended model profiles', async () => {")
replace_once(path,
"""    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'image', responseSchema: schema,
      attachments: [{ mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    assert.match(urls[0], /gemini-3\\.5-flash-lite/)
    assert.match(urls[1], /gemini-3\\.7-flash/)
""",
"""    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'image', responseSchema: schema,
      attachments: [{ mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'reminder image', responseSchema: schema,
      attachments: [{ mimeType: 'image/jpeg', dataBase64: 'AA==' }], purpose: 'reminder',
    })
    assert.match(urls[0], /gemini-3\\.5-flash-lite/)
    assert.match(urls[1], /gemini-3\\.7-flash/)
    assert.match(urls[2], /gemini-3\\.5-flash-lite/)
""")

# 9) App regression tests for the exact UX defects reported on iPhone.
write('tests/s-hub-ai-unified-ux.test.js', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('S-Hub AI is the single user-facing AI name across school and reminder flows', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const reminder = read('src/todo-stage5-ai.jsx')
  assert.match(sheet, /title="S-Hub AI"/)
  assert.match(reminder, /S-Hub AI가 첨부를 분석 중/)
  assert.doesNotMatch(reminder, /첨부에서 제목을 찾는 중|제목 분석 중|전체 요약도 동시에 시작했어/)
})

test('running S-Hub AI can be closed and is treated as cancellation', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(sheet, /requestControllerRef\.current\?\.abort\(\)/)
  assert.match(sheet, /closeDisabled=\{saving\}/)
  assert.doesNotMatch(sheet, /closeDisabled=\{working\}/)
  assert.match(transport, /school-ai\/cancelled/)
  assert.match(transport, /purpose: purpose === 'reminder' \? 'reminder' : 'school'/)
})

test('S-Hub import rows expose destination and only one review warning', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /return `리마인더 · \$\{type\}`/)
  assert.match(sheet, /function itemReviewLabel/)
  assert.doesNotMatch(sheet, /return '날짜 확인 필요'\n  return `\$\{month\}\/\$\{day\}`/)
  assert.match(sheet, /className=\{`s-hub-ai-edit \$\{editing \? 'is-done' : ''\}`/)
})

test('S-Hub editor uses iOS-safe native date and time shells', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /NativeDateField label="날짜"/)
  assert.match(sheet, /NativeTimeField label="시간"/)
  assert.match(css, /\.s-hub-ai-native-control > input\[type="date"\]/)
  assert.match(css, /-webkit-text-fill-color: transparent/)
})

test('reminder analysis declares reminder purpose on the shared S-Hub backend', () => {
  const reminderAI = read('src/firebase-ai.js')
  const api = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')
  assert.match(reminderAI, /purpose: 'reminder'/)
  assert.match(api, /body\.purpose === 'reminder'/)
  assert.match(service, /REMINDER_ATTACHMENT_MODELS/)
  assert.match(service, /purpose === 'reminder' \? REMINDER_ATTACHMENT_MODELS : ATTACHMENT_MODELS/)
})
''')

# Force installed PWAs to pick up the UI/runtime change instead of the old shell.
replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v145'", "const CACHE_NAME = 'school-shell-v146'")

print('S-Hub AI unified UX patch applied successfully')
