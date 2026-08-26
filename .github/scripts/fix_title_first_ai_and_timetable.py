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


# --- firebase-ai.js: real title-only multimodal path + smart quota recovery ---
p = 'src/firebase-ai.js'
t = read(p)

insert_marker = 'function mergeAttachmentResults(results, files) {'
if insert_marker not in t:
    raise SystemExit('firebase-ai merge marker missing')
helper = r'''function shouldUseDirectRecovery(error) {
  const status = Number(error?.status || 0)
  const code = String(error?.code || '').toUpperCase()
  return status === 429 || status >= 500 ||
    code.includes('RESOURCE_EXHAUSTED') ||
    code.includes('UNAVAILABLE') ||
    code.includes('TIMEOUT') ||
    code.includes('ALL-MODELS-FAILED')
}

async function directReminderResult(input, now, files, { titleOnly = false, smartRecovery = false } = {}) {
  const prepared = await Promise.all((files || []).map(prepareAttachment))
  const { generateDirectReminder } = await import('./firebase-ai-direct.js')
  const direct = await generateDirectReminder({
    text: String(input || '').trim().slice(0, 140),
    reference: localReference(now),
    attachments: prepared,
    titleOnly,
    smartRecovery,
  })
  const base = normalizeResult(direct?.value)
  if (!base) {
    const error = new Error('Direct AI response did not match the reminder schema')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/direct-invalid-response'
    throw error
  }
  if (titleOnly || !files?.length) return { ...base, modelName: direct.modelName }
  const summary = normalizeSummary(direct?.value?.summary)
  if (!summary) {
    const error = new Error('Direct AI summary response was empty')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/direct-summary-empty'
    throw error
  }
  return {
    ...base,
    summary,
    modelName: direct.modelName,
    attachments: [],
  }
}

'''
t = t.replace(insert_marker, helper + insert_marker, 1)

old_title = r'''export async function parseReminderTitleWithAI(input, now = new Date(), attachmentInput = null) {
  const text = String(input || '').trim().slice(0, 140)
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  const meaningfulText = text.replace(/\s+/g, '').length >= 4
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

export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  if (!files.length) return parseReminderWithAISingle(input, now, null)
  const results = await Promise.all(files.map((file) => parseReminderWithAISingle(input, now, file)))
  return mergeAttachmentResults(results.filter(Boolean), files)
}'''
new_title = r'''export async function parseReminderTitleWithAI(input, now = new Date(), attachmentInput = null) {
  const text = String(input || '').trim().slice(0, 140)
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  // With attachments, title extraction is a genuinely separate lightweight multimodal request.
  // It never waits for the full summary path unless the direct title route itself is unavailable.
  if (files.length) {
    try {
      return await directReminderResult(text, now, files, { titleOnly: true, smartRecovery: false })
    } catch (titleError) {
      console.warn('Direct attachment title extraction failed; falling back to full backend analysis.', titleError)
      const full = await parseReminderWithAI(text, now, files)
      if (!full) return null
      return {
        type: full.type,
        title: full.title,
        dueDate: full.dueDate,
        dueTime: full.dueTime || '',
        assumedDate: Boolean(full.assumedDate),
        source: 'ai',
        modelName: full.modelName || '',
      }
    }
  }

  try {
    return await parseReminderWithAISingle(text, now, null)
  } catch (error) {
    if (!shouldUseDirectRecovery(error)) throw error
    return directReminderResult(text, now, [], { titleOnly: true, smartRecovery: true })
  }
}

export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  if (!files.length) {
    try {
      return await parseReminderWithAISingle(input, now, null)
    } catch (error) {
      if (!shouldUseDirectRecovery(error)) throw error
      return directReminderResult(input, now, [], { titleOnly: true, smartRecovery: true })
    }
  }

  try {
    const results = await Promise.all(files.map((file) => parseReminderWithAISingle(input, now, file)))
    return mergeAttachmentResults(results.filter(Boolean), files)
  } catch (error) {
    if (!shouldUseDirectRecovery(error)) throw error
    // Quota / capacity recovery uses the smartest supported multimodal model first,
    // then the latest stable Flash model if Pro is unavailable for this project.
    return directReminderResult(input, now, files, { titleOnly: false, smartRecovery: true })
  }
}'''
t = replace_once(t, old_title, new_title, 'firebase title/summary exports')
write(p, t)


# --- todo-stage5-ai.jsx: do not show a fake local title for attachments; save on title readiness ---
p = 'src/todo-stage5-ai.jsx'
t = read(p)
t = replace_once(
    t,
    '  const naturalResult = aiResult || localNaturalResult',
    '  const naturalResult = attachmentFiles.length ? aiResult : (aiResult || localNaturalResult)',
    'attachment title preview source',
)

old_summary_payload = "      summary: files.length ? createPendingReminderSummary(files) : null,\n      attachment: null,"
new_summary_payload = "      summary: files.length\n        ? (summaryResult?.summary ? withAttachmentManifest(summaryResult.summary, files) : createPendingReminderSummary(files))\n        : null,\n      attachment: summaryResult?.attachment || null,"
t = replace_once(t, old_summary_payload, new_summary_payload, 'natural save summary payload')

old_preview = '''              {naturalResult ? (
                <section className="reminder-parse-preview" aria-live="polite">'''
new_preview = '''              {attachmentFiles.length && aiBusy && !aiResult ? (
                <section className="reminder-parse-preview is-title-loading" aria-live="polite">
                  <p>첨부에서 제목을 찾는 중</p>
                  <strong>제목 분석 중…</strong>
                  <small className="reminder-ai-status is-working">전체 요약도 동시에 시작했어.</small>
                </section>
              ) : naturalResult ? (
                <section className="reminder-parse-preview" aria-live="polite">'''
t = replace_once(t, old_preview, new_preview, 'title loading preview')
write(p, t)


# --- main.jsx: timetable modal gets dedicated, non-overlapping layout classes ---
p = 'src/main.jsx'
t = read(p)
old_modal = '''        <div className="change-form">
            <label className="change-field">
              <span>날짜</span>
              <input
                type="date"
                value={changeDate}
                min={todayKey}
                onChange={(event) => {
                  setChangeDate(event.target.value)
                  setChangeSubject('')
                }}
              />
            </label>
            <label className="change-field">
              <span>교시</span>
              <select
                value={selectedPeriodIsAvailable ? changePeriod : ''}
                onChange={(event) => setChangePeriod(Number(event.target.value))}
                disabled={!selectedDay || !availablePeriods.length}
              >
                {availablePeriods.map((period) => (
                  <option value={period.number} key={period.number}>{period.number}교시</option>
                ))}
              </select>
            </label>
            <label className="change-field full">
              <span>변경 과목</span>
              <input
                value={changeSubject}
                onChange={(event) => setChangeSubject(event.target.value)}
                placeholder="변경된 과목 입력"
                maxLength={20}
                disabled={!selectedDay || !availablePeriods.length}
              />
            </label>
            {!selectedDay ? (
              <p className="change-warning">토·일요일에는 정규 시간표를 변경할 수 없어.</p>
            ) : selectedDateIsPast ? (
              <p className="change-warning">지난 날짜의 시간표는 변경할 수 없어.</p>
            ) : !availablePeriods.length ? (
              <p className="change-warning">오늘 이미 끝난 교시는 변경할 수 없어.</p>
            ) : (
              <p className="change-base">기본: {baseSubject.trim() || '미설정'}</p>
            )}
            <div className="change-submit-row">
              <button onClick={() => setChangeOpen(false)}>취소</button>
              <button
                className="save-change"
                onClick={saveChange}
                disabled={!selectedDay || !selectedPeriodIsAvailable || !changeSubject.trim()}
              >
                변경 저장
              </button>
            </div>
        </div>'''
new_modal = '''        <div className="timetable-sheet-form">
          <div className="timetable-sheet-primary-grid">
            <label className="change-field">
              <span>날짜</span>
              <input
                type="date"
                value={changeDate}
                min={todayKey}
                onChange={(event) => {
                  setChangeDate(event.target.value)
                  setChangeSubject('')
                }}
              />
            </label>
            <label className="change-field">
              <span>교시</span>
              <select
                value={selectedPeriodIsAvailable ? changePeriod : ''}
                onChange={(event) => setChangePeriod(Number(event.target.value))}
                disabled={!selectedDay || !availablePeriods.length}
              >
                {availablePeriods.map((period) => (
                  <option value={period.number} key={period.number}>{period.number}교시</option>
                ))}
              </select>
            </label>
          </div>
          <label className="change-field">
            <span>변경 과목</span>
            <input
              value={changeSubject}
              onChange={(event) => setChangeSubject(event.target.value)}
              placeholder="변경된 과목 입력"
              maxLength={20}
              disabled={!selectedDay || !availablePeriods.length}
            />
          </label>
          {!selectedDay ? (
            <p className="change-warning">토·일요일에는 정규 시간표를 변경할 수 없어.</p>
          ) : selectedDateIsPast ? (
            <p className="change-warning">지난 날짜의 시간표는 변경할 수 없어.</p>
          ) : !availablePeriods.length ? (
            <p className="change-warning">오늘 이미 끝난 교시는 변경할 수 없어.</p>
          ) : (
            <p className="change-base">기본: {baseSubject.trim() || '미설정'}</p>
          )}
          <div className="timetable-sheet-actions">
            <button type="button" onClick={() => setChangeOpen(false)}>취소</button>
            <button
              type="button"
              className="save-change"
              onClick={saveChange}
              disabled={!selectedDay || !selectedPeriodIsAvailable || !changeSubject.trim()}
            >
              변경 저장
            </button>
          </div>
        </div>'''
t = replace_once(t, old_modal, new_modal, 'timetable modal markup')
write(p, t)


# --- timetable.css: unique modal footer geometry, independent of legacy change-form rules ---
p = 'src/timetable.css'
t = read(p)
css = r'''

/* Timetable's unified sheet owns a dedicated form/footer so legacy change-editor rules cannot overlap buttons. */
body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-form {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 12px !important;
  width: 100% !important;
  min-width: 0 !important;
  padding: 1px 0 4px !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(88px, 0.46fr) !important;
  gap: 10px !important;
  width: 100% !important;
  min-width: 0 !important;
}

body .unified-school-sheet.timetable-unified-sheet .change-field,
body .unified-school-sheet.timetable-unified-sheet .change-field input,
body .unified-school-sheet.timetable-unified-sheet .change-field select {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

body .unified-school-sheet.timetable-unified-sheet .change-warning,
body .unified-school-sheet.timetable-unified-sheet .change-base {
  grid-column: auto !important;
  width: auto !important;
  margin-left: 2px !important;
  margin-right: 2px !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-actions {
  position: sticky !important;
  z-index: 4 !important;
  left: auto !important;
  right: auto !important;
  bottom: 0 !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr) !important;
  align-items: stretch !important;
  gap: 8px !important;
  width: 100% !important;
  min-width: 0 !important;
  margin: 3px 0 0 !important;
  padding: 10px 0 2px !important;
  background: var(--surface) !important;
  transform: none !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-actions > button {
  position: static !important;
  inset: auto !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 44px !important;
  margin: 0 !important;
  padding: 0 12px !important;
  box-sizing: border-box !important;
  border: 1px solid var(--border) !important;
  border-radius: 14px !important;
  background: var(--surface-soft) !important;
  color: var(--text-secondary) !important;
  font-size: 13px !important;
  font-weight: 680 !important;
  line-height: 1 !important;
  transform: none !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-actions > .save-change {
  border-color: transparent !important;
  background: var(--text) !important;
  color: var(--bg) !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-actions > button:disabled {
  opacity: 0.35 !important;
}

@media (max-width: 430px) {
  body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
    grid-template-columns: minmax(0, 1fr) 94px !important;
  }
}
'''
if 'body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-form' in t:
    raise SystemExit('dedicated timetable sheet CSS already exists')
write(p, t + css)

print('title-first AI and timetable modal patch applied')
