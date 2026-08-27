import { generateSchoolStructured } from './s-hub-ai-transport.js'

const TEXT_REQUEST_TIMEOUT_MS = 15000
const ATTACHMENT_REQUEST_TIMEOUT_MS = 30000
const MAX_ATTACHMENT_BYTES = 2_500_000
const MAX_IMAGE_BYTES = 900_000
const MAX_ORIGINAL_IMAGE_BYTES = 20_000_000
const TYPE_SET = new Set(['task', 'performance', 'exam', 'material'])
const ATTACHMENT_ANALYSIS_CACHE_KEY = 'school.ai.attachmentAnalysisCache.v1'
const ATTACHMENT_ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ATTACHMENT_ANALYSIS_CACHE_MAX = 12
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

const REMINDER_TITLE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['task', 'performance', 'exam', 'material'] },
    title: { type: 'string' },
    dueDate: { type: 'string' },
    dueTime: { type: 'string' },
    assumedDate: { type: 'boolean' },
  },
  required: ['type', 'title', 'dueDate', 'dueTime', 'assumedDate'],
}

const REMINDER_SUMMARY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['task', 'performance', 'exam', 'material'] },
    title: { type: 'string' },
    dueDate: { type: 'string' },
    dueTime: { type: 'string' },
    assumedDate: { type: 'boolean' },
    summary: {
      type: 'object',
      properties: {
        overview: { type: 'string' },
        sections: {
          type: 'array',
          maxItems: 14,
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              items: { type: 'array', maxItems: 16, items: { type: 'string' } },
            },
            required: ['heading', 'items'],
          },
        },
      },
      required: ['overview', 'sections'],
    },
  },
  required: ['type', 'title', 'dueDate', 'dueTime', 'assumedDate', 'summary'],
}

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

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) return ''
  const bytes = value instanceof Blob
    ? new Uint8Array(await value.arrayBuffer())
    : new TextEncoder().encode(String(value || ''))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function localDayKey(now) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function attachmentAnalysisCacheId(input, now, files) {
  if (!globalThis.crypto?.subtle || !files.length) return ''
  try {
    const fileHashes = await Promise.all(files.map((file) => sha256Hex(file)))
    if (fileHashes.some((hash) => !hash)) return ''
    return sha256Hex([
      localDayKey(now),
      String(input || '').trim().slice(0, 140),
      ...fileHashes,
    ].join('\n'))
  } catch {
    return ''
  }
}

function readAttachmentAnalysisCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(ATTACHMENT_ANALYSIS_CACHE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    const cutoff = Date.now() - ATTACHMENT_ANALYSIS_CACHE_TTL_MS
    return stored
      .filter((entry) => entry && typeof entry === 'object' && Number(entry.savedAt || 0) >= cutoff)
      .slice(0, ATTACHMENT_ANALYSIS_CACHE_MAX)
  } catch {
    return []
  }
}

function cachedAttachmentAnalysis(cacheId) {
  if (!cacheId) return null
  const entry = readAttachmentAnalysisCache().find((item) => item.key === cacheId)
  if (!entry?.result) return null
  const base = normalizeResult(entry.result)
  const summary = normalizeSummary(entry.result.summary)
  if (!base || !summary) return null
  const attachment = normalizeAttachment(entry.result.attachment)
  const attachments = Array.isArray(entry.result.attachments)
    ? entry.result.attachments.map(normalizeAttachment).filter(Boolean)
    : []
  return {
    ...base,
    summary,
    ...(attachment ? { attachment } : {}),
    ...(attachments.length ? { attachments } : {}),
    modelName: String(entry.result.modelName || ''),
  }
}

function cacheAttachmentAnalysis(cacheId, result) {
  if (!cacheId || !result?.summary) return
  try {
    const entries = readAttachmentAnalysisCache().filter((entry) => entry.key !== cacheId)
    entries.unshift({ key: cacheId, savedAt: Date.now(), result })
    localStorage.setItem(
      ATTACHMENT_ANALYSIS_CACHE_KEY,
      JSON.stringify(entries.slice(0, ATTACHMENT_ANALYSIS_CACHE_MAX)),
    )
  } catch {
    // Cache is only an optimization. AI analysis still works without local storage.
  }
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

export async function prepareAttachment(file) {
  if (!(file instanceof Blob)) throw reminderError('첨부 파일을 읽을 수 없어.', 'school-ai/invalid-file')
  const originalName = String(file.name || '첨부파일').slice(0, 120)
  const originalType = inferredAttachmentType(file)
  if (!SUPPORTED_ATTACHMENT_TYPES.has(originalType)) {
    throw reminderError('이 파일 형식은 바로 분석할 수 없어. 사진, PDF 또는 텍스트 파일을 사용해줘.', 'school-ai/unsupported-file', 415)
  }

  let blob = file
  let name = originalName
  let mimeType = originalType
  const isImage = originalType.startsWith('image/')
  const needsJpegNormalization = originalType === 'image/heic' || originalType === 'image/heif'
  const needsImageCompression = isImage && file.size > MAX_IMAGE_BYTES

  if (needsJpegNormalization || needsImageCompression) {
    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
      throw reminderError('사진 용량이 너무 커. 20MB 이하 사진을 사용해줘.', 'school-ai/file-too-large', 413)
    }
    blob = await resizeImage(file, 1440, 0.72)
    if (blob.size > MAX_IMAGE_BYTES) blob = await resizeImage(file, 1200, 0.62)
    if (blob.size > MAX_IMAGE_BYTES) blob = await resizeImage(file, 1024, 0.56)
    name = originalName.replace(/\.[^.]+$/, '') + '.jpg'
    mimeType = 'image/jpeg'
  }

  const maxPreparedBytes = isImage ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES
  if (!blob.size || blob.size > maxPreparedBytes) {
    throw reminderError(
      isImage
        ? '사진을 분석용 크기로 줄이지 못했어. 다른 사진으로 다시 시도해줘.'
        : '첨부 파일은 2.5MB 이하만 분석할 수 있어. PDF는 용량을 줄여서 다시 올려줘.',
      'school-ai/file-too-large',
      413,
    )
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

function reminderTitlePrompt(text, reference, hasAttachments) {
  return `너는 한국 고등학생용 학교 리마인더 정리 AI다.
현재 시각: ${reference}
사용자 입력: ${text || '(텍스트 없음)'}
${hasAttachments ? '첨부된 사진/파일 전체를 빠르게 읽고 제목에 필요한 핵심만 파악해라. 본문 전체 요약은 지금 하지 마라.' : '사용자 문장을 읽고 리마인더를 정리해라.'}

반드시 다음 기준으로 분류한다.
- 수행평가, 발표, PPT, 보고서, 과제 제출, 평가용 활동 -> performance
- 준비물, 가져오기, 챙기기, 지참, 제출물 실물 준비 -> material
- 시험, 고사, 모의고사, 학력평가 -> exam
- 그 외 일반 할 일 -> task

제목은 날짜/시간 군더더기를 빼고 학교생활에서 바로 알아볼 수 있게 짧고 정확하게 만든다.
첨부에 과목명이나 수행 내용이 있으면 제목에 반영한다.
상대 날짜는 현재 시각을 기준으로 실제 YYYY-MM-DD로 계산한다.
날짜가 전혀 없으면 오늘 날짜를 사용하고 assumedDate=true로 한다.
시간이 없으면 dueTime은 빈 문자열이다.`
}

function reminderSummaryPrompt(text, reference) {
  return `너는 한국 고등학생용 학교 리마인더 정리 AI다.
현재 시각: ${reference}
사용자 입력: ${text || '(텍스트 없음)'}
첨부된 사진/파일을 읽어 하나의 리마인더로 정리한다.

1. type은 task/performance/exam/material 중 하나로 정확히 분류한다.
2. title은 과목과 해야 할 일을 짧고 명확하게 만든다.
3. dueDate/dueTime은 첨부와 사용자 입력에서 마감 정보를 찾아 정리한다. 날짜가 없으면 오늘 날짜와 assumedDate=true를 사용한다.
4. summary.overview에는 학생이 무엇을 해야 하는지 핵심을 짧게 요약한다.
5. summary.sections에는 중요한 요구사항, 준비물, 제출 형식, 평가 기준, 일정 등 실제 행동에 필요한 내용을 빠뜨리지 말고 구조화한다.
6. 파일에 없는 사실은 만들지 않는다.`
}

async function serverReminderResult(input, now, files, { titleOnly = false } = {}) {
  const text = String(input || '').trim().slice(0, 140)
  const selectedFiles = Array.isArray(files) ? files.filter((file) => file instanceof Blob).slice(0, 4) : []
  if (!text && !selectedFiles.length) return null

  const prepared = await Promise.all(selectedFiles.map(prepareAttachment))
  const wantsSummary = selectedFiles.length > 0 && !titleOnly
  const response = await generateSchoolStructured({
    prompt: wantsSummary
      ? reminderSummaryPrompt(text, localReference(now))
      : reminderTitlePrompt(text, localReference(now), selectedFiles.length > 0),
    attachments: prepared,
    responseSchema: wantsSummary ? REMINDER_SUMMARY_RESPONSE_SCHEMA : REMINDER_TITLE_RESPONSE_SCHEMA,
    maxOutputTokens: wantsSummary ? 2200 : 220,
    timeoutMs: wantsSummary ? ATTACHMENT_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS,
    temperature: 0.1,
  })

  const base = normalizeResult(response?.value)
  if (!base) {
    const error = new Error('AI response did not match the reminder schema')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/invalid-response'
    error.status = 502
    throw error
  }
  if (!wantsSummary) return { ...base, modelName: String(response?.modelName || '') }

  const summary = normalizeSummary(response?.value?.summary)
  if (!summary) {
    const error = new Error('AI summary response was empty')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/summary-empty'
    error.status = 502
    throw error
  }
  return {
    ...base,
    summary,
    modelName: String(response?.modelName || ''),
  }
}

function mergeAttachmentResults(results, files) {
  if (!results.length) return null
  if (results.length === 1) return results[0]

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

  return {
    ...primary,
    summary: {
      overview: overviewParts.join('\n\n').slice(0, 2400),
      sections,
    },
  }
}

export async function parseReminderTitleWithAI(input, now = new Date(), attachmentInput = null) {
  const text = String(input || '').trim().slice(0, 140)
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []
  return serverReminderResult(text, now, files, { titleOnly: true })
}

export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  if (!files.length) return serverReminderResult(input, now, [], { titleOnly: true })

  const cacheId = await attachmentAnalysisCacheId(input, now, files)
  const cached = cachedAttachmentAnalysis(cacheId)
  if (cached) return cached

  // Analyze each attachment through the same verified server route. Keeping each request
  // bounded avoids Vercel request-body spikes when several photos are selected at once.
  const results = await Promise.all(
    files.map((file) => serverReminderResult(input, now, [file], { titleOnly: false })),
  )
  const result = mergeAttachmentResults(results, files)
  if (!result) return null

  const attachments = files.map((file) => normalizeAttachment({
    name: String(file.name || '첨부파일').slice(0, 120),
    mimeType: inferredAttachmentType(file),
    size: Number(file.size || 0),
  })).filter(Boolean)
  const enriched = {
    ...result,
    attachment: attachments[0] || null,
    attachments,
  }
  cacheAttachmentAnalysis(cacheId, enriched)
  return enriched
}
