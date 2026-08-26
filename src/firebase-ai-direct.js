import { getApp, getApps, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
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

const DIRECT_APP_NAME = 'school-ai-recovery'
const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LfuppctAAAAAMbZELYt0w0spaR2qTUmgLFdELGu'
const TITLE_MODELS = ['gemini-3.7-flash', 'gemini-3.1-pro-preview']
const RECOVERY_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.7-flash']
const TITLE_TIMEOUT_MS = 18000
const SUMMARY_TIMEOUT_MS = 40000

const TYPE_SCHEMA = Schema.enumString({
  enum: ['task', 'performance', 'exam', 'material'],
})

const TITLE_SCHEMA = Schema.object({
  properties: {
    type: TYPE_SCHEMA,
    title: Schema.string(),
    dueDate: Schema.string(),
    dueTime: Schema.string(),
    assumedDate: Schema.boolean(),
  },
})

const SUMMARY_SCHEMA = Schema.object({
  properties: {
    type: TYPE_SCHEMA,
    title: Schema.string(),
    dueDate: Schema.string(),
    dueTime: Schema.string(),
    assumedDate: Schema.boolean(),
    summary: Schema.object({
      properties: {
        overview: Schema.string(),
        sections: Schema.array({
          maxItems: 14,
          items: Schema.object({
            properties: {
              heading: Schema.string(),
              items: Schema.array({
                maxItems: 16,
                items: Schema.string(),
              }),
            },
          }),
        }),
      },
    }),
  },
})

let directAI = null
let appCheckInitialized = false

function getDirectAI() {
  if (directAI) return directAI
  const app = getApps().some((item) => item.name === DIRECT_APP_NAME)
    ? getApp(DIRECT_APP_NAME)
    : initializeApp(firebaseConfig, DIRECT_APP_NAME)

  if (!appCheckInitialized) {
    appCheckInitialized = true
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (error) {
      if (!/already|initialized/i.test(String(error?.message || ''))) throw error
    }
  }

  directAI = getAI(app, { backend: new GoogleAIBackend() })
  return directAI
}

function withTimeout(promise, milliseconds, modelName) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error(`Direct AI ${modelName} timed out after ${milliseconds}ms`)
      error.name = 'ReminderAIError'
      error.code = 'school-ai/direct-timeout'
      error.status = 504
      reject(error)
    }, milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer))
}

function preparedPart(attachment) {
  const mimeType = String(attachment?.mimeType || '').toLowerCase()
  const data = String(attachment?.dataBase64 || '')
  if (!mimeType || !data) return null
  const normalizedMime = (
    mimeType === 'application/json' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/rtf' ||
    mimeType === 'text/html' ||
    mimeType === 'text/xml'
  ) ? 'text/plain' : mimeType
  return { inlineData: { data, mimeType: normalizedMime } }
}

function titlePrompt(text, reference, hasAttachments) {
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

function summaryPrompt(text, reference) {
  return `너는 한국 고등학생용 학교 리마인더 정리 AI다.
현재 시각: ${reference}
사용자 입력: ${text || '(텍스트 없음)'}
첨부된 모든 사진/파일을 함께 읽어 하나의 리마인더로 정리한다.

1. type은 task/performance/exam/material 중 하나로 정확히 분류한다.
2. title은 과목과 해야 할 일을 짧고 명확하게 만든다.
3. dueDate/dueTime은 첨부와 사용자 입력에서 마감 정보를 찾아 정리한다. 날짜가 없으면 오늘 날짜와 assumedDate=true를 사용한다.
4. summary.overview에는 학생이 무엇을 해야 하는지 핵심을 짧게 요약한다.
5. summary.sections에는 중요한 요구사항, 준비물, 제출 형식, 평가 기준, 일정 등 실제 행동에 필요한 내용을 빠뜨리지 말고 구조화한다.
6. 파일에 없는 사실은 만들지 않는다.`
}

async function runModel(modelName, { text, reference, attachments, titleOnly }) {
  const ai = getDirectAI()
  const schema = titleOnly ? TITLE_SCHEMA : SUMMARY_SCHEMA
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
      maxOutputTokens: titleOnly ? 220 : 2200,
    },
  })
  const parts = (attachments || []).map(preparedPart).filter(Boolean)
  const prompt = titleOnly
    ? titlePrompt(text, reference, parts.length > 0)
    : summaryPrompt(text, reference)
  const result = await withTimeout(
    model.generateContent([prompt, ...parts]),
    titleOnly ? TITLE_TIMEOUT_MS : SUMMARY_TIMEOUT_MS,
    modelName,
  )
  const raw = String(result?.response?.text?.() || '').trim()
  if (!raw) throw new Error(`Direct AI ${modelName} returned an empty response`)
  try {
    return JSON.parse(raw)
  } catch {
    const error = new Error(`Direct AI ${modelName} returned invalid JSON`)
    error.name = 'ReminderAIError'
    error.code = 'school-ai/direct-invalid-json'
    throw error
  }
}

export async function generateDirectReminder({
  text = '',
  reference = '',
  attachments = [],
  titleOnly = false,
  smartRecovery = false,
}) {
  const models = smartRecovery ? RECOVERY_MODELS : TITLE_MODELS
  const attempts = []
  let lastError = null

  for (const modelName of models) {
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

  const error = new Error(attempts.join(' | ') || lastError?.message || 'Direct AI fallback failed')
  error.name = 'ReminderAIError'
  error.code = 'school-ai/direct-all-models-failed'
  error.status = lastError?.status || null
  error.customData = { attempts }
  throw error
}
