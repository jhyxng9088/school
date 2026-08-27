import { createHash } from 'node:crypto'
import { adminAccessToken, adminAppCheckToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
import { generateStructuredWithFirebaseAI } from '../lib/s-hub-ai-service.js'

const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
const AI_CACHE_COLLECTION = 'sHubAiResponseCache'
const AI_CACHE_TTL_MS = 10 * 60 * 1000

export function normalizedPromptForCache(prompt = '') {
  return String(prompt || '')
    .replace(
      /현재 기준 시각:\s*(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g,
      '현재 기준 날짜: $1',
    )
    .replace(
      /"reference":"(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}"/g,
      '"reference":"$1"',
    )
}

export function schoolQuestionCacheKey(body, prompt, purpose) {
  if (body?.cacheScope !== 'school-question' || purpose !== 'school') return ''
  const digest = createHash('sha256')
  digest.update('s-hub-school-question-v1\n')
  digest.update(normalizedPromptForCache(prompt))
  digest.update('\nSCHEMA\n')
  digest.update(JSON.stringify(body.responseSchema || {}))
  digest.update('\nOPTIONS\n')
  digest.update(JSON.stringify({ maxOutputTokens: body.maxOutputTokens, temperature: body.temperature, purpose }))
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : []
  attachments.forEach((item, index) => {
    digest.update(`\nATTACHMENT:${index}:${String(item?.mimeType || '')}\n`)
    digest.update(String(item?.dataBase64 || ''))
  })
  return digest.digest('hex')
}

export async function readSchoolQuestionCache(db, key) {
  if (!key) return null
  const ref = db.collection(AI_CACHE_COLLECTION).doc(key)
  const snapshot = await ref.get()
  if (!snapshot.exists) return null
  const data = snapshot.data() || {}
  if (Number(data.expiresAtMs || 0) <= Date.now() || !data.result || typeof data.result !== 'object') {
    ref.delete().catch(() => {})
    return null
  }
  return { ...data.result, cacheHit: true }
}

export async function writeSchoolQuestionCache(db, key, result) {
  if (!key || !result || typeof result !== 'object') return
  await db.collection(AI_CACHE_COLLECTION).doc(key).set({
    result: { ...result, cacheHit: false },
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + AI_CACHE_TTL_MS,
  })
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function clientMessage(error) {
  const status = Number(error?.status || 0)
  if (status === 413) return '첨부 용량이 너무 커. 사진 수나 파일 용량을 줄여줘.'
  if (status === 429) return 'AI 사용량이 잠시 많아. 잠시 후 다시 시도해줘.'
  if (status === 504) return 'AI 응답 시간이 초과됐어. 다시 시도해줘.'
  if (status === 400) return 'AI 요청 내용을 처리하지 못했어. 입력이나 첨부를 확인해줘.'
  return 'AI 서버에 연결하지 못했어. 다시 시도해줘.'
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const identity = await adminDb().collection('users').doc(decoded.uid).get()
    if (!identity.exists) return res.status(403).json({ ok: false, error: 'identity_missing', message: '학생 정보를 확인하지 못했어.' })

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const purpose = body.purpose === 'reminder' ? 'reminder' : 'school'
    const prompt = String(body.prompt || '').trim()
    if (!prompt || prompt.length > 40_000) {
      return res.status(400).json({ ok: false, error: 'invalid_prompt', message: 'AI 요청 내용이 올바르지 않아.' })
    }

    const db = adminDb()
    const cacheKey = schoolQuestionCacheKey(body, prompt, purpose)
    if (cacheKey) {
      const cached = await readSchoolQuestionCache(db, cacheKey)
      if (cached) return res.status(200).json({ ok: true, result: cached })
    }

    const [accessToken, appCheckToken] = await Promise.all([
      adminAccessToken(),
      adminAppCheckToken(FIREBASE_APP_ID),
    ])
    const result = await generateStructuredWithFirebaseAI({
      projectId: adminProjectId(),
      accessToken,
      appCheckToken,
      prompt,
      attachments: body.attachments,
      responseSchema: body.responseSchema,
      maxOutputTokens: body.maxOutputTokens,
      timeoutMs: body.timeoutMs,
      temperature: body.temperature,
      purpose,
    })
    if (cacheKey) {
      try {
        await writeSchoolQuestionCache(db, cacheKey, result)
      } catch (cacheError) {
        console.warn('s-hub-ai cache write failed', cacheError?.message || cacheError)
      }
    }
    return res.status(200).json({ ok: true, result: { ...result, cacheHit: false } })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어. 앱을 다시 열어줘.' })
    console.error('s-hub-ai failed', {
      code: error?.code,
      status: error?.status,
      attempts: error?.attempts,
      message: error?.message,
    })
    const status = [400, 413, 429, 504].includes(Number(error?.status)) ? Number(error.status) : 502
    return res.status(status).json({
      ok: false,
      error: String(error?.code || 's_hub_ai_failed'),
      message: clientMessage(error),
      attempts: Array.isArray(error?.attempts) ? error.attempts : [],
    })
  }
}
