import { initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'

const firebaseConfig = {
  apiKey: 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0',
  authDomain: 'school-adeda.firebaseapp.com',
  projectId: 'school-adeda',
  storageBucket: 'school-adeda.firebasestorage.app',
  messagingSenderId: '321702677113',
  appId: '1:321702677113:web:390c5d63e3d93ec17f22a8',
  measurementId: 'G-PFCP63TWQS',
}

const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LfuppctAAAAAMbZELYt0w0spaR2qTUmgLFdELGu'
const AI_LOGIC_TIMEOUT_MS = 12000
const APPCHECK_DEBUG_TIMEOUT_MS = 8000

const firebaseApp = initializeApp(firebaseConfig)

const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
})

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })

const responseSchema = Schema.object({
  properties: {
    type: Schema.enumString({
      enum: ['task', 'performance', 'exam', 'material'],
    }),
    title: Schema.string(),
    dueDate: Schema.string(),
    dueTime: Schema.string(),
    assumedDate: Schema.boolean(),
  },
})

const model = getGenerativeModel(ai, {
  model: 'gemini-3.7-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema,
    maxOutputTokens: 220,
  },
  systemInstruction: `You parse short Korean school reminders for a high-school student.
Return only the structured response required by the schema.

Rules:
- Correct obvious Korean typos, spacing mistakes, and common abbreviations when the intended meaning is clear. Do not invent content.
- Preserve the user's intended subject and task in the title, while removing date/time filler words from the title.
- type must be one of task, performance, exam, material.
- 수행, 수행평가, 발표, 프레젠테이션, PPT/피피티 and clear school assessment work -> performance.
- 시험, 고사, 모의고사, 전국연합, 학력평가, 수능 -> exam.
- 준비물, 챙기기, 가져가기, 지참 and clear things-to-bring -> material.
- Otherwise -> task.
- Resolve relative Korean dates such as 오늘, 내일, 모레, 글피, 이번주/다음주 + weekday using the reference datetime supplied in the user prompt.
- If no date was expressed, use the reference date and set assumedDate to true.
- If no time was expressed, dueTime must be an empty string.
- dueDate must always be a valid YYYY-MM-DD date and dueTime must be HH:MM or empty.
- Be conservative: if a typo could change the meaning, leave that part as written rather than guessing.`,
})

const TYPE_SET = new Set(['task', 'performance', 'exam', 'material'])

function timeoutError(milliseconds, label = 'AI Logic') {
  const error = new Error(`${label} timed out after ${milliseconds}ms`)
  error.code = label === 'App Check' ? 'school-appcheck/timeout' : 'school-ai/timeout'
  return error
}

function withTimeout(promise, milliseconds, label = 'AI Logic') {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(timeoutError(milliseconds, label)), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId))
}

if (typeof window !== 'undefined' && self.__SCHOOL_APPCHECK_DEBUG__) {
  window.__SCHOOL_APPCHECK_DIAGNOSE__ = async () => {
    const startedAt = Date.now()
    try {
      const result = await withTimeout(
        getToken(appCheck, true),
        APPCHECK_DEBUG_TIMEOUT_MS,
        'App Check',
      )
      return {
        ok: true,
        tokenLength: String(result?.token || '').length,
        elapsedMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        ok: false,
        name: error?.name || null,
        code: error?.code || null,
        message: error?.message || String(error),
        status: error?.status || null,
        elapsedMs: Date.now() - startedAt,
      }
    }
  }
}

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

export async function parseReminderWithAI(input, now = new Date()) {
  const text = String(input || '').trim()
  if (!text) return null

  const prompt = `Reference local datetime: ${localReference(now)} (Asia/Seoul)\nReminder: ${text}`
  const result = await withTimeout(model.generateContent(prompt), AI_LOGIC_TIMEOUT_MS)
  const responseText = result.response.text()
  const parsed = JSON.parse(responseText)
  const normalized = normalizeResult(parsed)
  if (!normalized) throw new Error('AI response did not match the reminder schema')
  return normalized
}
