from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)


# --- AI client: analyze up to four files with the existing single-file backend and merge results. ---
p = 'src/firebase-ai.js'
t = read(p)
t = once(
    t,
    'export async function parseReminderWithAI(input, now = new Date(), attachmentFile = null) {',
    'async function parseReminderWithAISingle(input, now = new Date(), attachmentFile = null) {',
    'rename single AI parser',
)
append = r'''

function mergeAttachmentResults(results, files) {
  if (!results.length) return null
  if (results.length === 1) {
    const only = results[0]
    return {
      ...only,
      attachments: only?.attachment ? [only.attachment] : [],
    }
  }

  const primary = [...results].sort((a, b) => {
    const aKey = `${a?.dueDate || '9999-99-99'}T${a?.dueTime || '23:59'}`
    const bKey = `${b?.dueDate || '9999-99-99'}T${b?.dueTime || '23:59'}`
    return aKey.localeCompare(bKey)
  })[0] || results[0]

  const overviewParts = []
  const seenOverview = new Set()
  results.forEach((result, index) => {
    const overview = String(result?.summary?.overview || '').trim()
    if (!overview || seenOverview.has(overview)) return
    seenOverview.add(overview)
    const label = String(files[index]?.name || `첨부 ${index + 1}`).slice(0, 80)
    overviewParts.push(`${label}: ${overview}`)
  })

  const sections = []
  results.forEach((result, index) => {
    const label = String(files[index]?.name || `첨부 ${index + 1}`).slice(0, 48)
    const sourceSections = Array.isArray(result?.summary?.sections) ? result.summary.sections : []
    sourceSections.forEach((section) => {
      if (sections.length >= 13) return
      sections.push({
        heading: `${label} · ${String(section?.heading || '내용')}`.slice(0, 80),
        items: Array.isArray(section?.items) ? section.items.slice(0, 16) : [],
      })
    })
  })

  const attachments = results.map((result) => result?.attachment).filter(Boolean)
  return {
    ...primary,
    summary: {
      overview: overviewParts.join('\n\n').slice(0, 2400),
      sections,
    },
    attachment: attachments[0] || primary?.attachment || null,
    attachments,
  }
}

export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  if (!files.length) return parseReminderWithAISingle(input, now, null)
  const results = await Promise.all(files.map((file) => parseReminderWithAISingle(input, now, file)))
  return mergeAttachmentResults(results.filter(Boolean), files)
}
'''
t = t.rstrip() + append + '\n'
write(p, t)


# --- Attachment UI + hidden manifest + multiple original viewer. ---
p = 'src/reminder-summary.jsx'
t = read(p)
start = t.index('export function AttachmentPicker(')
end = t.index('\nfunction clamp(', start)
new_picker = r'''export const REMINDER_ATTACHMENT_MANIFEST_HEADING = '\u2063school-attachments\u2063'

export function withAttachmentManifest(summary, files) {
  const source = summary && typeof summary === 'object' ? summary : {}
  const sections = Array.isArray(source.sections)
    ? source.sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING).slice(0, 13)
    : []
  const items = (files || []).slice(0, 4).map((file, index) => JSON.stringify({
    key: `a${index}`,
    name: String(file?.name || `첨부 ${index + 1}`).slice(0, 120),
  }))
  if (items.length) sections.push({ heading: REMINDER_ATTACHMENT_MANIFEST_HEADING, items })
  return {
    overview: String(source.overview || '').slice(0, 2400),
    sections,
  }
}

function attachmentManifest(todo) {
  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []
  const manifest = sections.find((section) => section?.heading === REMINDER_ATTACHMENT_MANIFEST_HEADING)
  if (manifest && Array.isArray(manifest.items)) {
    const entries = manifest.items.map((item) => {
      try {
        const parsed = JSON.parse(String(item || ''))
        const key = String(parsed?.key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
        const name = String(parsed?.name || '').trim().slice(0, 120)
        return key && name ? { key, name } : null
      } catch {
        return null
      }
    }).filter(Boolean)
    if (entries.length) return entries
  }
  return todo?.attachment?.name ? [{ key: '', name: String(todo.attachment.name).slice(0, 120) }] : []
}

export function AttachmentPicker({ files = [], busy = false, ready = false, error = '', onAdd, onRemove, onRetry = () => {} }) {
  const inputRef = useRef(null)
  const selected = Array.isArray(files) ? files.slice(0, 4) : []

  function chooseFile() {
    if (selected.length >= 4) return
    inputRef.current?.click()
  }

  function handleChange(event) {
    const nextFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (nextFiles.length) onAdd?.(nextFiles)
  }

  return (
    <section className={`reminder-attachment-picker ${selected.length ? 'has-file' : ''}`}>
      <input
        ref={inputRef}
        className="reminder-file-input"
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        onChange={handleChange}
        tabIndex={-1}
      />

      {selected.length ? (
        <div className="reminder-attachment-list">
          {selected.map((file, index) => (
            <div className="reminder-attachment-selected" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              <div>
                <span>첨부 {index + 1}</span>
                <strong>{file.name}</strong>
                <small>{fileSizeLabel(file.size)}</small>
              </div>
              <div className="reminder-attachment-actions">
                <button type="button" onClick={() => onRemove?.(index)}>제거</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {selected.length < 4 ? (
        <button className="reminder-attachment-add" type="button" onClick={chooseFile}>
          {selected.length ? '사진 또는 파일 더 추가' : '사진 또는 파일 추가'}
        </button>
      ) : (
        <small className="reminder-attachment-limit">첨부는 최대 4개까지 가능해.</small>
      )}

      {selected.length && (error || ready || busy) ? (
        <div className={`reminder-attachment-status ${error ? 'is-error' : ready ? 'is-ready' : 'is-working'}`} aria-live="polite">
          <span>{error ? error : ready ? `${selected.length}개 분석 완료` : `${selected.length}개 분석 중`}</span>
          {error ? (
            <button className="reminder-attachment-retry" type="button" onClick={onRetry}>다시 분석</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
'''
t = t[:start] + new_picker + t[end:]

t = once(
    t,
    '  if (!original) return null\n\n  return (',
    "  if (!original) return null\n  const isImage = String(original.mimeType || original.blob?.type || '').startsWith('image/')\n\n  return (",
    'original viewer type',
)
t = once(
    t,
    '    <div className={`reminder-original-viewer ${closing ? \'is-closing\' : \'\'}`.trim()} role="dialog" aria-modal="true" aria-label="원본 사진">\n      <button className="reminder-original-backdrop" type="button" aria-label="원본 사진 닫기" onClick={requestClose} />',
    '    <div className={`reminder-original-viewer ${closing ? \'is-closing\' : \'\'}`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">\n      <button className="reminder-original-backdrop" type="button" aria-label="원본 파일 닫기" onClick={requestClose} />',
    'original viewer aria',
)
t = once(
    t,
    '''        <div className="reminder-original-image-wrap">\n          <img src={original.url} alt={original.name || '원본 사진'} />\n        </div>\n        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>\n          {saving ? '준비 중…' : '사진 저장'}\n        </button>'''.replace('\\n', '\n'),
    '''        {isImage ? (\n          <div className="reminder-original-image-wrap">\n            <img src={original.url} alt={original.name || '원본 사진'} />\n          </div>\n        ) : (\n          <div className="reminder-original-file-info">\n            <strong>{original.name || '원본 파일'}</strong>\n            <span>{fileSizeLabel(original.size)}{original.mimeType ? ` · ${original.mimeType}` : ''}</span>\n          </div>\n        )}\n        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>\n          {saving ? '준비 중…' : '원본 저장'}\n        </button>'''.replace('\\n', '\n'),
    'original generic viewer',
)
t = once(
    t,
    "  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []\n  const canShowOriginal = Boolean(todo?.attachment?.mimeType?.startsWith('image/') && loadOriginal)",
    "  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []\n  const visibleSections = sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING)\n  const originalEntries = attachmentManifest(todo)\n  const canShowOriginal = Boolean(originalEntries.length && loadOriginal)",
    'summary manifest state',
)
t = once(
    t,
    '  async function openOriginal() {\n    if (!loadOriginal || originalState === \'loading\') return',
    "  async function openOriginal(entry) {\n    if (!loadOriginal || originalState === 'loading') return",
    'open original arg',
)
t = once(
    t,
    '      const original = await loadOriginal()',
    '      const original = await loadOriginal(entry?.key || \'\')',
    'load manifest original',
)
t = once(
    t,
    "            <p>{todo.attachment?.name ? `첨부 · ${todo.attachment.name}` : '리마인더 요약'}</p>",
    "            <p>{originalEntries.length ? `첨부 · ${originalEntries.length}개` : '리마인더 요약'}</p>",
    'summary attachment count',
)
t = once(
    t,
    '{sections.map((section, sectionIndex) => (',
    '{visibleSections.map((section, sectionIndex) => (',
    'hide manifest section',
)
old_original_action = '''          {canShowOriginal ? (\n            <div className="reminder-original-action">\n              <button type="button" onClick={openOriginal} disabled={originalState === 'loading'}>\n                {originalState === 'loading' ? '원본 불러오는 중…' : '원본 사진 보기'}\n              </button>\n              {originalError ? <small>{originalError}</small> : null}\n            </div>\n          ) : null}'''.replace('\\n', '\n')
new_original_action = '''          {canShowOriginal ? (\n            <div className="reminder-original-action reminder-original-list">\n              {originalEntries.map((entry, index) => (\n                <button type="button" onClick={() => openOriginal(entry)} disabled={originalState === 'loading'} key={`${entry.key}-${index}`}>\n                  {originalState === 'loading' ? '원본 불러오는 중…' : `원본 ${index + 1} · ${entry.name}`}\n                </button>\n              ))}\n              {originalError ? <small>{originalError}</small> : null}\n            </div>\n          ) : null}'''.replace('\\n', '\n')
t = once(t, old_original_action, new_original_action, 'multiple original actions')
write(p, t)


# --- Reminder page: hold an attachment queue, keep the add button, save each original under a stable suffix. ---
p = 'src/todo-stage5-ai.jsx'
t = read(p)
t = once(
    t,
    "import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'",
    "import { AttachmentPicker, SummarySheet, withAttachmentManifest } from './reminder-summary.jsx'",
    'attachment helper import',
)
t = once(t, "  const [attachmentFile, setAttachmentFile] = useState(null)", "  const [attachmentFiles, setAttachmentFiles] = useState([])", 'attachment queue state')
t = once(
    t,
    "  const aiAdjusted = Boolean(!attachmentFile && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))\n  const aiTrigger = attachmentFile || naturalText",
    "  const attachmentSignature = attachmentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')\n  const aiAdjusted = Boolean(!attachmentFiles.length && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))\n  const aiTrigger = attachmentSignature ? `${naturalText}|${attachmentSignature}` : naturalText",
    'attachment AI signature',
)
t = once(t, "    const hasAttachment = Boolean(attachmentFile)", "    const hasAttachment = attachmentFiles.length > 0", 'attachment presence')
t = once(t, "        const parsed = await parseReminderWithAI(text, new Date(), attachmentFile)", "        const parsed = await parseReminderWithAI(text, new Date(), attachmentFiles)", 'multi AI call')
t = once(t, "    setAttachmentFile(null)", "    setAttachmentFiles([])", 'create attachment reset')
t = once(t, "    setAttachmentFile(null)\n    setServerSaving(false)", "    setAttachmentFiles([])\n    setServerSaving(false)", 'edit attachment reset')
old_change = '''  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    setOriginalSaveError('')\n    setServerSaveError('')\n    pendingCreateIdRef.current = ''\n    resetAI()\n  }\n\n  function retryAttachment() {\n    if (!attachmentFile) return\n    resetAI()\n    setAttachmentRetryKey((current) => current + 1)\n  }'''.replace('\\n', '\n')
new_change = '''  function touchAttachments() {\n    setAttachmentRetryKey(0)\n    setOriginalSaveError('')\n    setServerSaveError('')\n    pendingCreateIdRef.current = ''\n    resetAI()\n  }\n\n  function addAttachments(nextFiles) {\n    const incoming = Array.from(nextFiles || []).filter((file) => file instanceof File)\n    if (!incoming.length) return\n    setAttachmentFiles((current) => {\n      const next = [...current]\n      incoming.forEach((file) => {\n        const duplicate = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)\n        if (!duplicate && next.length < 4) next.push(file)\n      })\n      return next\n    })\n    touchAttachments()\n  }\n\n  function removeAttachment(index) {\n    setAttachmentFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))\n    touchAttachments()\n  }\n\n  function retryAttachment() {\n    if (!attachmentFiles.length) return\n    resetAI()\n    setAttachmentRetryKey((current) => current + 1)\n  }'''.replace('\\n', '\n')
t = once(t, old_change, new_change, 'attachment queue handlers')

# Natural save: upload every original and embed manifest in the existing summary schema.
old_upload = '''    if (attachmentFile) {\n      setOriginalSaving(true)\n      setOriginalSaveError('')\n      try {\n        await uploadOriginalAttachment(createId, attachmentFile)\n      } catch (error) {\n        console.error('Original reminder attachment save failed:', error)\n        setOriginalSaveError(error?.message || '원본 사진 저장에 실패했어. 다시 시도해줘.')\n        return\n      } finally {\n        setOriginalSaving(false)\n      }\n    }'''.replace('\\n', '\n')
new_upload = '''    if (attachmentFiles.length) {\n      setOriginalSaving(true)\n      setOriginalSaveError('')\n      try {\n        for (let index = 0; index < attachmentFiles.length; index += 1) {\n          await uploadOriginalAttachment(createId, attachmentFiles[index], `a${index}`)\n        }\n      } catch (error) {\n        console.error('Original reminder attachment save failed:', error)\n        setOriginalSaveError(error?.message || '원본 파일 저장에 실패했어. 다시 시도해줘.')\n        return\n      } finally {\n        setOriginalSaving(false)\n      }\n    }'''.replace('\\n', '\n')
t = once(t, old_upload, new_upload, 'multi original upload')
t = once(
    t,
    "      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,",
    "      summary: attachmentFiles.length ? withAttachmentManifest(naturalResult.summary, attachmentFiles) : naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,",
    'natural manifest save',
)

# Manual save after switching from AI mode must also retain the queued originals.
old_manual_start = '''  async function submitManual() {\n    if (serverSaving) return\n    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())\n    if (createId) pendingCreateIdRef.current = createId\n    setServerSaving(true)\n    setServerSaveError('')\n    const savePromise = saveTodo(createId ? { ...draft, createId } : draft)'''.replace('\\n', '\n')
new_manual_start = '''  async function submitManual() {\n    if (serverSaving || originalSaving) return\n    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())\n    if (createId) pendingCreateIdRef.current = createId\n\n    if (createId && attachmentFiles.length) {\n      setOriginalSaving(true)\n      setOriginalSaveError('')\n      try {\n        for (let index = 0; index < attachmentFiles.length; index += 1) {\n          await uploadOriginalAttachment(createId, attachmentFiles[index], `a${index}`)\n        }\n      } catch (error) {\n        console.error('Original reminder attachment save failed:', error)\n        setOriginalSaveError(error?.message || '원본 파일 저장에 실패했어. 다시 시도해줘.')\n        return\n      } finally {\n        setOriginalSaving(false)\n      }\n    }\n\n    setServerSaving(true)\n    setServerSaveError('')\n    const draftToSave = attachmentFiles.length\n      ? { ...draft, summary: withAttachmentManifest(draft.summary, attachmentFiles) }\n      : draft\n    const savePromise = saveTodo(createId ? { ...draftToSave, createId } : draftToSave)'''.replace('\\n', '\n')
t = once(t, old_manual_start, new_manual_start, 'manual multi attachment save')

# Picker props.
t = once(
    t,
    '''              <AttachmentPicker\n                file={attachmentFile}\n                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFile && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}\n                onChange={changeAttachment}\n                onRetry={retryAttachment}\n              />'''.replace('\\n', '\n'),
    '''              <AttachmentPicker\n                files={attachmentFiles}\n                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFiles.length && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}\n                onAdd={addAttachments}\n                onRemove={removeAttachment}\n                onRetry={retryAttachment}\n              />'''.replace('\\n', '\n'),
    'multi attachment picker props',
)
t = t.replace("{attachmentFile ? '분석 중' : '확인 중'}", "{attachmentFiles.length ? '분석 중' : '확인 중'}")
t = t.replace("{attachmentFile ? '분석 완료' : aiAdjusted ? '오타·축약을 보정했어.' : '확인 완료'}", "{attachmentFiles.length ? '분석 완료' : aiAdjusted ? '오타·축약을 보정했어.' : '확인 완료'}")
t = t.replace("{attachmentFile ? '텍스트는 유지했어. 첨부만 다시 분석해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}", "{attachmentFiles.length ? '텍스트는 유지했어. 첨부만 다시 분석해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}")
# Summary loader now accepts an optional manifest key.
t = once(
    t,
    "        loadOriginal={summaryTodo?.id ? () => getOriginalAttachment(summaryTodo.id) : null}",
    "        loadOriginal={summaryTodo?.id ? (key = '') => getOriginalAttachment(summaryTodo.id, key) : null}",
    'keyed original loader',
)
write(p, t)


# --- Original storage accessor: suffix keys preserve the existing Firestore schema and legacy originals. ---
p = 'src/todo.jsx'
t = read(p)
t = once(
    t,
    '''  function uploadOriginalAttachment(todoId, file) {\n    return writeReminderOriginal(profile, todoId, file)\n  }\n\n  function getOriginalAttachment(todoId) {\n    return getReminderOriginal(profile, todoId)\n  }'''.replace('\\n', '\n'),
    '''  function originalAttachmentId(todoId, key = '') {\n    const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)\n    return safeKey ? `${todoId}--${safeKey}` : todoId\n  }\n\n  function uploadOriginalAttachment(todoId, file, key = '') {\n    return writeReminderOriginal(profile, originalAttachmentId(todoId, key), file)\n  }\n\n  function getOriginalAttachment(todoId, key = '') {\n    return getReminderOriginal(profile, originalAttachmentId(todoId, key))\n  }'''.replace('\\n', '\n'),
    'keyed original storage access',
)
write(p, t)


# --- Styles for queued attachments and generic original files. ---
p = 'src/reminder-summary.css'
t = read(p)
t += r'''

.reminder-attachment-list {
  display: grid;
  gap: 7px;
}

.reminder-attachment-limit {
  justify-self: start;
  margin: 0 2px;
  color: var(--text-tertiary);
  font-size: 10.5px;
  font-weight: 600;
}

.reminder-original-list {
  display: grid;
  gap: 7px;
}

.reminder-original-list > button {
  overflow: hidden;
  width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-original-file-info {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 180px;
  margin: 0 18px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-soft);
  text-align: center;
}

.reminder-original-file-info strong {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 14px;
}

.reminder-original-file-info span {
  color: var(--text-tertiary);
  font-size: 11px;
}
'''
write(p, t)
