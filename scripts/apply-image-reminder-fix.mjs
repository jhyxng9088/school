import fs from 'node:fs'

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`)
  return source.replace(before, after)
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`${path}: no changes produced`)
  fs.writeFileSync(path, after)
}

update('src/firebase-ai.js', (source) => {
  source = replaceExact(
    source,
    "const MAX_ATTACHMENT_BYTES = 2_500_000\nconst MAX_ORIGINAL_IMAGE_BYTES = 20_000_000",
    "const MAX_ATTACHMENT_BYTES = 2_500_000\nconst MAX_IMAGE_BYTES = 900_000\nconst MAX_ORIGINAL_IMAGE_BYTES = 20_000_000",
    'firebase image constants',
  )

  source = replaceExact(
    source,
    `  const needsJpegNormalization = originalType === 'image/heic' || originalType === 'image/heif'\n  const needsImageCompression = originalType.startsWith('image/') && file.size > MAX_ATTACHMENT_BYTES\n\n  if (needsJpegNormalization || needsImageCompression) {\n    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {\n      throw reminderError('사진 용량이 너무 커. 20MB 이하 사진을 사용해줘.', 'school-ai/file-too-large', 413)\n    }\n    blob = await resizeImage(file, 1800, 0.82)\n    if (blob.size > MAX_ATTACHMENT_BYTES) blob = await resizeImage(file, 1400, 0.7)\n    name = originalName.replace(/\\.[^.]+$/, '') + '.jpg'\n    mimeType = 'image/jpeg'\n  }\n\n  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) {\n    throw reminderError('첨부 파일은 2.5MB 이하만 분석할 수 있어. PDF는 용량을 줄여서 다시 올려줘.', 'school-ai/file-too-large', 413)\n  }`,
    `  const isImage = originalType.startsWith('image/')\n  const needsJpegNormalization = originalType === 'image/heic' || originalType === 'image/heif'\n  const needsImageCompression = isImage && file.size > MAX_IMAGE_BYTES\n\n  if (needsJpegNormalization || needsImageCompression) {\n    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {\n      throw reminderError('사진 용량이 너무 커. 20MB 이하 사진을 사용해줘.', 'school-ai/file-too-large', 413)\n    }\n    blob = await resizeImage(file, 1440, 0.72)\n    if (blob.size > MAX_IMAGE_BYTES) blob = await resizeImage(file, 1200, 0.62)\n    if (blob.size > MAX_IMAGE_BYTES) blob = await resizeImage(file, 1024, 0.56)\n    name = originalName.replace(/\\.[^.]+$/, '') + '.jpg'\n    mimeType = 'image/jpeg'\n  }\n\n  const maxPreparedBytes = isImage ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES\n  if (!blob.size || blob.size > maxPreparedBytes) {\n    throw reminderError(\n      isImage\n        ? '사진을 분석용 크기로 줄이지 못했어. 다른 사진으로 다시 시도해줘.'\n        : '첨부 파일은 2.5MB 이하만 분석할 수 있어. PDF는 용량을 줄여서 다시 올려줘.',\n      'school-ai/file-too-large',\n      413,\n    )\n  }`,
    'firebase image preparation',
  )
  return source
})

update('src/todo-stage5-ai.jsx', (source) => {
  source = replaceExact(
    source,
    `function resultSignature(result) {\n  if (!result) return ''\n  return [result.type, result.title, result.dueDate, result.dueTime || '', Boolean(result.assumedDate)].join('|')\n}\n`,
    `function resultSignature(result) {\n  if (!result) return ''\n  return [result.type, result.title, result.dueDate, result.dueTime || '', Boolean(result.assumedDate)].join('|')\n}\n\nfunction attachmentErrorMessage(error) {\n  const message = String(error?.message || '')\n  if (/timed out|timeout|gemini-3\\.[67]/i.test(message)) {\n    return '이미지 분석 시간이 초과됐어. 최적화된 이미지로 다시 분석해줘.'\n  }\n  return message || '첨부 분석에 실패했어. 다시 시도해줘.'\n}\n`,
    'attachment error helper',
  )

  source = replaceExact(
    source,
    `  const [attachmentFile, setAttachmentFile] = useState(null)\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    `  const [attachmentFile, setAttachmentFile] = useState(null)\n  const [attachmentRetryKey, setAttachmentRetryKey] = useState(0)\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    'attachment retry state',
  )

  source = replaceExact(
    source,
    `  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])\n  const naturalResult = attachmentFile ? aiResult : (aiResult || localNaturalResult)\n  const aiAdjusted = Boolean(!attachmentFile && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))`,
    `  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])\n  const naturalResult = aiResult || localNaturalResult\n  const aiAdjusted = Boolean(!attachmentFile && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))\n  const aiTrigger = attachmentFile || naturalText`,
    'natural result fallback',
  )

  source = replaceExact(
    source,
    `  }, [naturalText, attachmentFile, sheetOpen, sheetMode])`,
    `  }, [aiTrigger, attachmentRetryKey, sheetOpen, sheetMode])`,
    'AI effect dependencies',
  )

  source = replaceExact(
    source,
    `  function openCreate() {\n    setNaturalText('')\n    setAttachmentFile(null)\n    setSummaryTodo(null)`,
    `  function openCreate() {\n    setNaturalText('')\n    setAttachmentFile(null)\n    setAttachmentRetryKey(0)\n    setSummaryTodo(null)`,
    'open create retry reset',
  )

  source = replaceExact(
    source,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    resetAI()\n  }`,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    resetAI()\n  }\n\n  function retryAttachment() {\n    if (!attachmentFile) return\n    resetAI()\n    setAttachmentRetryKey((current) => current + 1)\n  }`,
    'attachment retry handler',
  )

  source = replaceExact(
    source,
    `                error={attachmentFile && aiState === 'error' ? (aiError?.message || '첨부 분석에 실패했어. 다시 시도해줘.') : ''}\n                onChange={changeAttachment}`,
    `                error={attachmentFile && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}\n                onChange={changeAttachment}\n                onRetry={retryAttachment}`,
    'attachment picker retry props',
  )

  source = replaceExact(
    source,
    `                  {aiBusy ? (\n                    <small className="reminder-ai-status is-working">AI가 오타와 문맥을 확인하는 중…</small>\n                  ) : aiState === 'ready' ? (\n                    <small className="reminder-ai-status is-ready">{attachmentFile ? '첨부 내용 분석과 요약 완료' : aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>\n                  ) : aiState === 'error' ? (\n                    <small className="reminder-ai-status">{attachmentFile ? '첨부를 분석하지 못했어.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}</small>`,
    `                  {aiBusy ? (\n                    <small className="reminder-ai-status is-working">{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중…' : 'AI가 오타와 문맥을 확인하는 중…'}</small>\n                  ) : aiState === 'ready' ? (\n                    <small className="reminder-ai-status is-ready">{attachmentFile ? '첨부 내용 분석과 요약 완료' : aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>\n                  ) : aiState === 'error' ? (\n                    <small className="reminder-ai-status">{attachmentFile ? '텍스트는 유지했어. 첨부만 다시 분석해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}</small>`,
    'attachment progress copy',
  )
  return source
})

update('src/reminder-summary.jsx', (source) => {
  source = replaceExact(
    source,
    `export function AttachmentPicker({ file, busy = false, ready = false, error = '', onChange }) {`,
    `export function AttachmentPicker({ file, busy = false, ready = false, error = '', onChange, onRetry = () => {} }) {`,
    'attachment picker signature',
  )

  source = replaceExact(
    source,
    `      {file ? (\n        <p className={\`reminder-attachment-status \${error ? 'is-error' : ready ? 'is-ready' : busy ? 'is-working' : ''}\`} aria-live="polite">\n          {error\n            ? error\n            : ready\n              ? '첨부 내용을 읽고 요약까지 정리했어.'\n              : busy\n                ? '첨부 내용을 읽고 정리하는 중…'\n                : '첨부를 분석할 준비가 됐어.'}\n        </p>\n      ) : (`,
    `      {file ? (\n        <div className={\`reminder-attachment-status \${error ? 'is-error' : ready ? 'is-ready' : busy ? 'is-working' : ''}\`} aria-live="polite">\n          <span>\n            {error\n              ? error\n              : ready\n                ? '첨부 내용을 읽고 요약까지 정리했어.'\n                : busy\n                  ? '첨부 내용을 읽고 정리하는 중…'\n                  : '첨부를 분석할 준비가 됐어.'}\n          </span>\n          {error ? (\n            <button className="reminder-attachment-retry" type="button" onClick={onRetry}>다시 분석</button>\n          ) : null}\n        </div>\n      ) : (`,
    'attachment retry UI',
  )
  return source
})

update('src/reminder-summary.css', (source) => {
  source = replaceExact(
    source,
    `.reminder-attachment-add {\n  justify-self: start;\n  min-height: 36px;\n  padding: 0 13px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: var(--surface-soft);\n  color: var(--text-secondary);\n  font-size: 12px;\n  font-weight: 700;\n  cursor: pointer;\n}`,
    `.reminder-attachment-add {\n  justify-self: stretch;\n  width: 100%;\n  min-height: 48px;\n  padding: 0 16px;\n  border: 1px solid color-mix(in srgb, var(--text) 18%, var(--border));\n  border-radius: 15px;\n  background: var(--text);\n  color: var(--bg);\n  font-size: 13px;\n  font-weight: 760;\n  letter-spacing: -0.015em;\n  cursor: pointer;\n  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;\n}\n\n.reminder-attachment-add:active {\n  transform: scale(0.985);\n  opacity: 0.78;\n}`,
    'attachment primary button',
  )

  source = replaceExact(
    source,
    `.reminder-attachment-status,\n.reminder-attachment-help {\n  margin: 0 2px;\n  color: var(--text-tertiary);\n  font-size: 11px;\n  line-height: 1.45;\n}`,
    `.reminder-attachment-status,\n.reminder-attachment-help {\n  margin: 0 2px;\n  color: var(--text-tertiary);\n  font-size: 11px;\n  line-height: 1.45;\n}\n\n.reminder-attachment-status {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.reminder-attachment-status > span {\n  min-width: 0;\n}\n\n.reminder-attachment-retry {\n  flex: none;\n  min-height: 30px;\n  padding: 0 10px;\n  border: 1px solid color-mix(in srgb, #d84d49 26%, var(--border));\n  border-radius: 10px;\n  background: color-mix(in srgb, #d84d49 8%, var(--surface-soft));\n  color: #d84d49;\n  font-size: 11px;\n  font-weight: 730;\n  cursor: pointer;\n}`,
    'attachment status row',
  )
  return source
})

update('src/todo-stage5.css', (source) => {
  source = replaceExact(
    source,
    `.todo-stage5 .todo-edit-button,\n.todo-stage5 .todo-permanent-delete {\n  flex: none;\n  min-width: 28px;\n  padding: 8px 0;\n  border: 0;\n  background: transparent;\n  font-size: 12px;\n  font-weight: 700;\n  line-height: 1;\n  letter-spacing: -0.01em;\n  cursor: pointer;\n}\n\n.todo-stage5 .todo-edit-button {\n  color: var(--text-secondary);\n}\n\n.todo-stage5 .todo-permanent-delete {\n  grid-column: auto;\n  align-self: auto;\n  color: #d84d49;\n  opacity: 0.82;\n}`,
    `.todo-stage5 .todo-edit-button,\n.todo-stage5 .todo-permanent-delete {\n  flex: none;\n  min-height: 30px;\n  font-size: 12px;\n  font-weight: 700;\n  line-height: 1;\n  letter-spacing: -0.01em;\n  cursor: pointer;\n}\n\n.todo-stage5 .todo-edit-button {\n  min-width: 42px;\n  padding: 0 10px;\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  background: var(--surface-soft);\n  color: var(--text-secondary);\n}\n\n.todo-stage5 .todo-permanent-delete {\n  grid-column: auto;\n  align-self: auto;\n  min-width: 30px;\n  padding: 0 2px;\n  border: 0;\n  background: transparent;\n  color: #d84d49;\n  opacity: 0.82;\n}`,
    'edit button treatment',
  )
  return source
})

update('public/sw.js', (source) => replaceExact(source, "const CACHE_NAME = 'school-shell-v68'", "const CACHE_NAME = 'school-shell-v69'", 'service worker cache'))

console.log('image reminder fix applied')
