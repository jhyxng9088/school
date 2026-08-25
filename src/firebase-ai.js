const REMINDER_API_URL = 'https://school-ai-backend-ruby.vercel.app/api/reminder'
const REQUEST_TIMEOUT_MS = 18000
const TYPE_SET = new Set(['task', 'performance', 'exam', 'material'])

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizeResult(value) {
  if (!value || !TYPE_SET.has(value.type)) return null

  const title = String(value.title || '').trim().slice(0, 80)
  const dueDate = String(value.dueDate || '').trim()
  const dueTime = String(value.dueTime || '').trim()

  if (!title || !validDateKey(dueDate)) return null
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return null

  return {
    type: value.type,
    title,
    dueDate,
    dueTime,
    assumedDate: Boolean(value.assumedDate),
    source: 'ai',
  }
}

function localReference(now) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function buildBackendError(response, payload, rawText) {
  const error = new Error(payload?.message || rawText || `Reminder AI failed with HTTP ${response.status}`)
  error.name = 'ReminderAIError'
  error.code = payload?.code || `school-ai/http-${response.status}`
  error.status = response.status
  error.customData = {
    attempts: Array.isArray(payload?.attempts) ? payload.attempts : [],
  }
  return error
}

export async function parseReminderWithAI(input, now = new Date()) {
  const text = String(input || '').trim().slice(0, 140)
  if (!text) return null

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(REMINDER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference: localReference(now),
      }),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null
    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch {
      payload = null
    }

    if (!response.ok || !payload?.ok) {
      throw buildBackendError(response, payload, rawText)
    }

    const normalized = normalizeResult(payload.result)
    if (!normalized) {
      const error = new Error('AI response did not match the reminder schema')
      error.name = 'ReminderAIError'
      error.code = 'school-ai/invalid-response'
      error.status = 502
      throw error
    }

    return normalized
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(`Reminder AI timed out after ${REQUEST_TIMEOUT_MS}ms`)
      timeout.name = 'ReminderAIError'
      timeout.code = 'school-ai/timeout'
      timeout.status = 504
      throw timeout
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}
