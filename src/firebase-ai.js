const REMINDER_API_URL = 'https://school-ai-backend-ruby.vercel.app/api/reminder'
const TEXT_REQUEST_TIMEOUT_MS = 18000
const ATTACHMENT_REQUEST_TIMEOUT_MS = 45000
const MAX_ATTACHMENT_BYTES = 2_500_000
const MAX_ORIGINAL_IMAGE_BYTES = 20_000_000
const TYPE_SET = new Set(['task', 'performance', 'exam', 'material'])
const SUPPORTED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/rtf',
  'text/html',
  'text/xml',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
])

function reminderError(message, code, status = 400) {
  const error = new Error(message)
  error.name = 'ReminderAIError'
  error.code = code
  error.status = status
  return error
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizeSummary(value) {
  if (!value || typeof value !== 'object') return null
  const overview = String(value.overview || '').trim().slice(0, 2400)
  const sections = Array.isArray(value.sections)
    ? value.sections.slice(0, 14).map((section) => ({
        heading: String(section?.heading || '').trim().slice(0, 80),
        items: Array.isArray(section?.items)
          ? section.items.slice(0, 16).map((item) => String(item || '').trim().slice(0, 700)).filter(Boolean)
          : [],
      })).filter((section) => section.heading && section.items.length)
    : []
  if (!overview && !sections.length) return null
  return { overview, sections }
}

function normalizeAttachment(value) {
  if (!value || typeof value !== 'object') return null
  const name = String(value.name || '').trim().slice(0, 120)
  const mimeType = String(value.mimeType || '').trim().toLowerCase()
  const size = Number(value.size || 0)
  if (!name || !SUPPORTED_ATTACHMENT_TYPES.has(mimeType) || !Number.isFinite(size) || size <= 0) return null
  return { name, mimeType, size }
}

function normalizeResult(value, attachmentMeta = null) {
  if (!value || !TYPE_SET.has(value.type)) return null

  const title = String(value.title || '').trim().slice(0, 80)
  const dueDate = String(value.dueDate || '').trim()
  const dueTime = String(value.dueTime || '').trim()

  if (!title || !validDateKey(dueDate)) return null
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return null

  const result = {
    type: value.type,
    title,
    dueDate,
    dueTime,
    assumedDate: Boolean(value.assumedDate),
    source: 'ai',
  }

  if (attachmentMeta) {
    const summary = normalizeSummary(value.summary)
    const attachment = normalizeAttachment(attachmentMeta)
    if (!summary || !attachment) return null
    result.summary = summary
    result.attachment = attachment
  }

  return result
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

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(reminderError('사진을 읽을 수 없어. 다른 사진으로 다시 시도해줘.', 'school-ai/image-read-failed'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(reminderError('사진을 처리할 수 없어.', 'school-ai/image-compress-failed'))
    }, 'image/jpeg', quality)
  })
}

async function resizeImage(file, maxEdge, quality) {
  const image = await loadImage(file)
  const largest = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = largest > maxEdge ? maxEdge / largest : 1
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw reminderError('사진을 처리할 수 없어.', 'school-ai/image-canvas-failed')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvasToBlob(canvas, quality)
}

function inferredAttachmentType(file) {
  const explicit = String(file?.type || '').toLowerCase().trim()
  if (SUPPORTED_ATTACHMENT_TYPES.has(explicit)) return explicit
  const name = String(file?.name || '').toLowerCase()
  const extensionMap = [
    ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],
    ['.webp', 'image/webp'], ['.bmp', 'image/bmp'], ['.heic', 'image/heic'],
    ['.heif', 'image/heif'], ['.pdf', 'application/pdf'], ['.json', 'application/json'],
    ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.rtf', 'text/rtf'],
    ['.html', 'text/html'], ['.htm', 'text/html'], ['.xml', 'text/xml'],
  ]
  return extensionMap.find(([extension]) => name.endsWith(extension))?.[1] || explicit
}

async function prepareAttachment(file) {
  if (!(file instanceof Blob)) throw reminderError('첨부 파일을 읽을 수 없어.', 'school-ai/invalid-file')
  const originalName = String(file.name || '첨부파일').slice(0, 120)
  const originalType = inferredAttachmentType(file)
  if (!SUPPORTED_ATTACHMENT_TYPES.has(originalType)) {
    throw reminderError('이 파일 형식은 바로 분석할 수 없어. 사진, PDF 또는 텍스트 파일을 사용해줘.', 'school-ai/unsupported-file', 415)
  }

  let blob = file
  let name = originalName
  let mimeType = originalType
  const needsJpegNormalization = originalType === 'image/heic' || originalType === 'image/heif'
  const needsImageCompression = originalType.startsWith('image/') && file.size > MAX_ATTACHMENT_BYTES

  if (needsJpegNormalization || needsImageCompression) {
    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
      throw reminderError('사진 용량이 너무 커. 20MB 이하 사진을 사용해줘.', 'school-ai/file-too-large', 413)
    }
    blob = await resizeImage(file, 1800, 0.82)
    if (blob.size > MAX_ATTACHMENT_BYTES) blob = await resizeImage(file, 1400, 0.7)
    name = originalName.replace(/\.[^.]+$/, '') + '.jpg'
    mimeType = 'image/jpeg'
  }

  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) {
    throw reminderError('첨부 파일은 2.5MB 이하만 분석할 수 있어. PDF는 용량을 줄여서 다시 올려줘.', 'school-ai/file-too-large', 413)
  }

  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(reminderError('첨부 파일을 변환할 수 없어.', 'school-ai/file-read-failed'))
      else resolve(value.slice(comma + 1))
    }
    reader.onerror = () => reject(reminderError('첨부 파일을 읽을 수 없어.', 'school-ai/file-read-failed'))
    reader.readAsDataURL(blob)
  })

  return {
    name,
    mimeType,
    dataBase64,
  }
}

export async function parseReminderWithAI(input, now = new Date(), attachmentFile = null) {
  const text = String(input || '').trim().slice(0, 140)
  if (!text && !attachmentFile) return null

  const attachment = attachmentFile ? await prepareAttachment(attachmentFile) : null
  const timeoutMs = attachment ? ATTACHMENT_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(REMINDER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference: localReference(now),
        attachment,
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

    const normalized = normalizeResult(payload.result, payload.attachment)
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
      const timeout = new Error(`Reminder AI timed out after ${timeoutMs}ms`)
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
