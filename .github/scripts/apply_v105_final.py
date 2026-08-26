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


# main.jsx: tomorrow preview after school + tomorrow initial change date + isolated native controls.
p = 'src/main.jsx'
t = read(p)

t = replace_once(
    t,
    "function TimetablePreview({ schedule, now, configured }) {",
    "function TimetablePreview({ schedule, now, configured, title = '오늘 시간표', futureDay = false }) {",
    'timetable preview signature',
)
t = replace_once(
    t,
    """        <SectionTitle>오늘 시간표</SectionTitle>
        <div className=\"today-timetable-empty\">오늘은 정규 수업이 없어.</div>""",
    """        <SectionTitle>{title}</SectionTitle>
        <div className=\"today-timetable-empty\">{futureDay ? '내일은 정규 수업이 없어.' : '오늘은 정규 수업이 없어.'}</div>""",
    'empty timetable preview label',
)
t = replace_once(
    t,
    """  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nextPeriod = schedule.find((period) => timeToMinutes(period.start) > nowMinutes) || null

  return (
    <section className=\"home-section\">
      <SectionTitle>오늘 시간표</SectionTitle>""",
    """  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nextPeriod = futureDay
    ? schedule[0] || null
    : schedule.find((period) => timeToMinutes(period.start) > nowMinutes) || null

  return (
    <section className=\"home-section\">
      <SectionTitle>{title}</SectionTitle>""",
    'timetable preview heading',
)
t = replace_once(
    t,
    """        aria-label=\"오늘 시간표 미리보기\"""",
    """        aria-label={`${title} 미리보기`}""",
    'timetable preview aria label',
)
t = replace_once(
    t,
    """          const visualState = getPeriodVisualState(now, period)
          const isNext = visualState !== 'current' && nextPeriod?.number === period.number""",
    """          const visualState = futureDay ? 'future' : getPeriodVisualState(now, period)
          const isNext = visualState !== 'current' && nextPeriod?.number === period.number""",
    'future timetable visual state',
)

home_marker = """  const schoolState = getSchoolState(now, weeklySchedule, overrides)

  return ("""
home_replacement = """  const schoolState = getSchoolState(now, weeklySchedule, overrides)
  const showTomorrowTimetable = schoolState.kind === 'done'
  const timetablePreviewDate = showTomorrowTimetable
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0)
    : now
  const timetablePreviewSchedule = showTomorrowTimetable
    ? getScheduleForDate(timetablePreviewDate, weeklySchedule, overrides)
    : schoolState.schedule

  return ("""
t = replace_once(t, home_marker, home_replacement, 'home tomorrow timetable state')
t = replace_once(
    t,
    """        <TimetablePreview
          schedule={schoolState.schedule}
          now={now}
          configured={schoolState.configured}
        />""",
    """        <TimetablePreview
          schedule={timetablePreviewSchedule}
          now={now}
          configured={schoolState.configured}
          title={showTomorrowTimetable ? '내일 시간표' : '오늘 시간표'}
          futureDay={showTomorrowTimetable}
        />""",
    'home timetable preview props',
)

open_change_old = """              onClick={() => { if (requireOnline('시간표를 수정')) setChangeOpen(true) }}"""
open_change_new = """              onClick={() => {
                if (!requireOnline('시간표를 수정')) return
                const initialDate = currentState.kind === 'done'
                  ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0)
                  : now
                setChangeDate(dateKey(initialDate))
                setChangeSubject('')
                setChangeOpen(true)
              }}"""
t = replace_once(t, open_change_old, open_change_new, 'change modal default date')

old_date_field = """            <label className=\"change-field\">
              <span>날짜</span>
              <input
                type=\"date\"
                value={changeDate}
                min={todayKey}
                onChange={(event) => {
                  setChangeDate(event.target.value)
                  setChangeSubject('')
                }}
              />
            </label>"""
new_date_field = """            <label className=\"change-field timetable-date-field\">
              <span>날짜</span>
              <span className=\"timetable-control-shell timetable-date-shell\">
                <input
                  type=\"date\"
                  value={changeDate}
                  min={todayKey}
                  onChange={(event) => {
                    setChangeDate(event.target.value)
                    setChangeSubject('')
                  }}
                />
              </span>
            </label>"""
t = replace_once(t, old_date_field, new_date_field, 'date control shell')

old_period_field = """            <label className=\"change-field\">
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
            </label>"""
new_period_field = """            <label className=\"change-field timetable-period-field\">
              <span>교시</span>
              <span className=\"timetable-control-shell timetable-period-shell\">
                <select
                  value={selectedPeriodIsAvailable ? changePeriod : ''}
                  onChange={(event) => setChangePeriod(Number(event.target.value))
                  disabled={!selectedDay || !availablePeriods.length}
                >
                  {availablePeriods.map((period) => (
                    <option value={period.number} key={period.number}>{period.number}교시</option>
                  ))}
                </select>
              </span>
            </label>"""
t = replace_once(t, old_period_field, new_period_field, 'period control shell')
write(p, t)


# timetable.css: outer shell owns visible geometry; Safari native controls cannot visually collide.
p = 'src/timetable.css'
t = read(p)
old_grid = """body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(96px, 0.34fr) !important;
  gap: 10px !important;
  width: 100% !important;
  min-width: 0 !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid > .change-field {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
  justify-self: stretch !important;
}

body .unified-school-sheet.timetable-unified-sheet .change-field {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

body .unified-school-sheet.timetable-unified-sheet .change-field input,
body .unified-school-sheet.timetable-unified-sheet .change-field select {
  display: block !important;
  width: 100% !important;
  inline-size: 100% !important;
  min-width: 0 !important;
  min-inline-size: 0 !important;
  max-width: 100% !important;
  max-inline-size: 100% !important;
  box-sizing: border-box !important;
}"""
new_grid = """body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 132px !important;
  gap: 12px !important;
  width: 100% !important;
  min-width: 0 !important;
  align-items: end !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid > .change-field,
body .unified-school-sheet.timetable-unified-sheet .change-field {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  justify-self: stretch !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 46px !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  border: 1px solid var(--border) !important;
  border-radius: 14px !important;
  background: var(--surface-soft) !important;
  color: var(--text) !important;
  font-size: 13px !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell:focus-within {
  border-color: var(--focus-accent, var(--text-tertiary)) !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > input,
body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > select {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 12px !important;
  box-sizing: border-box !important;
  border: 0 !important;
  border-radius: 0 !important;
  outline: 0 !important;
  background: transparent !important;
  color: var(--text) !important;
  font-size: 13px !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > input:focus,
body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > select:focus {
  border: 0 !important;
  outline: 0 !important;
}"""
t = replace_once(t, old_grid, new_grid, 'timetable shell CSS')
t = replace_once(
    t,
    """@media (max-width: 430px) {
  body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
    grid-template-columns: minmax(0, 1fr) 96px !important;
  }
}""",
    """@media (max-width: 430px) {
  body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {
    grid-template-columns: minmax(0, 1fr) 104px !important;
    gap: 9px !important;
  }
}""",
    'compact timetable shell grid',
)
write(p, t)


# firebase-ai-direct.js: adaptive per-model quota cooldown and automatic recovery to higher models.
p = 'src/firebase-ai-direct.js'
t = read(p)
t = replace_once(
    t,
    "const RAW_TITLE_TIMEOUT_MS = 16000\n",
    "const RAW_TITLE_TIMEOUT_MS = 16000\nconst MODEL_HEALTH_KEY = 'school.ai.modelHealth.v1'\nconst MODEL_BACKOFF_MS = [120000, 300000, 600000, 1200000]\n",
    'model health constants',
)

state_marker = "let directAI = null\nlet appCheckInitialized = false\n"
if state_marker not in t:
    raise SystemExit('AI state marker missing')
health_helpers = r'''
function readModelHealth() {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_HEALTH_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeModelHealth(value) {
  try {
    localStorage.setItem(MODEL_HEALTH_KEY, JSON.stringify(value || {}))
  } catch {
    // Optimization only; AI still works if storage is unavailable.
  }
}

function retryAfterMilliseconds(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const seconds = Number(text)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const retryDate = Date.parse(text)
  return Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0
}

function retryAfterFromError(error) {
  const explicit = Number(error?.retryAfterMs || error?.customData?.retryAfterMs || 0)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const message = String(error?.message || '')
  const match = message.match(/retry(?:\s+after|\s+in)?\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|milliseconds?|s|sec(?:onds?)?|m|min(?:utes?)?)/i)
  if (!match) return 0
  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  if (unit.startsWith('ms')) return Math.ceil(amount)
  if (unit.startsWith('m') && !unit.startsWith('ms')) return Math.ceil(amount * 60000)
  return Math.ceil(amount * 1000)
}

function isQuotaError(error) {
  const status = Number(error?.status || 0)
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toUpperCase()
  return status === 429 ||
    code.includes('RESOURCE_EXHAUSTED') ||
    code.includes('QUOTA') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('QUOTA EXCEEDED')
}

function modelIsCoolingDown(modelName, now = Date.now()) {
  const state = readModelHealth()[modelName]
  return Number(state?.until || 0) > now
}

function markModelSuccess(modelName) {
  const health = readModelHealth()
  if (!health[modelName]) return
  delete health[modelName]
  writeModelHealth(health)
}

function markModelQuotaFailure(modelName, error) {
  if (!isQuotaError(error)) return
  const health = readModelHealth()
  const previous = health[modelName] || {}
  const strikes = Math.max(0, Number(previous.strikes || 0)) + 1
  const adaptiveDelay = MODEL_BACKOFF_MS[Math.min(strikes - 1, MODEL_BACKOFF_MS.length - 1)]
  const serverDelay = retryAfterFromError(error)
  const delay = serverDelay > 0 ? Math.max(1000, serverDelay + 1000) : adaptiveDelay
  health[modelName] = {
    strikes,
    until: Date.now() + delay,
    lastQuotaAt: Date.now(),
  }
  writeModelHealth(health)
}
'''
t = t.replace(state_marker, state_marker + health_helpers, 1)

t = replace_once(
    t,
    """      error.code = payload?.error?.status || `school-ai/raw-http-${response.status}`
      error.status = response.status
      throw error""",
    """      error.code = payload?.error?.status || `school-ai/raw-http-${response.status}`
      error.status = response.status
      error.retryAfterMs = retryAfterMilliseconds(response.headers.get('Retry-After'))
      throw error""",
    'raw request retry-after',
)

old_model_loop = """  for (const modelName of models) {
    const startedAt = Date.now()
    try {
      const value = await runModel(modelName, {
        text,
        reference,
        attachments,
        titleOnly,
      })
      return { value, modelName, attempts }
    } catch (error) {
      lastError = error
      attempts.push(`${modelName}: ${error?.code || error?.name || 'error'} (${Date.now() - startedAt}ms)`)
    }
  }

  const error = new Error(attempts.join(' | ') || lastError?.message || 'Direct AI fallback failed')"""
new_model_loop = """  const now = Date.now()
  const availableModels = models.filter((modelName) => !modelIsCoolingDown(modelName, now))

  if (!availableModels.length) {
    const error = new Error('All AI fallback models are temporarily cooling down after quota errors')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/all-models-cooling-down'
    error.status = 429
    error.customData = { attempts: ['all models skipped by adaptive quota cooldown'] }
    throw error
  }

  for (const modelName of availableModels) {
    const startedAt = Date.now()
    try {
      const value = await runModel(modelName, {
        text,
        reference,
        attachments,
        titleOnly,
      })
      markModelSuccess(modelName)
      return { value, modelName, attempts }
    } catch (error) {
      lastError = error
      markModelQuotaFailure(modelName, error)
      attempts.push(`${modelName}: ${error?.code || error?.name || 'error'} (${Date.now() - startedAt}ms)`)
    }
  }

  const error = new Error(attempts.join(' | ') || lastError?.message || 'Direct AI fallback failed')"""
t = replace_once(t, old_model_loop, new_model_loop, 'adaptive model fallback loop')
write(p, t)

print('v105 final patch applied')
