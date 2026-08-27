import { adminAccessToken, adminProjectId } from '../lib/firebase-admin.js'

const FIREBASE_WEB_API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'

async function probeDeveloperApi() {
  const startedAt = Date.now()
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply only with OK.' }] }] }),
    })
    const payload = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      code: String(payload?.error?.status || ''),
      message: String(payload?.error?.message || '').slice(0, 180),
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, status: 0, code: 'fetch-error', message: String(error?.message || error).slice(0, 180), ms: Date.now() - startedAt }
  }
}

async function probeVertexApi() {
  const startedAt = Date.now()
  try {
    const projectId = adminProjectId()
    const token = await adminAccessToken()
    const response = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply only with OK.' }] }] }),
    })
    const payload = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      code: String(payload?.error?.status || ''),
      message: String(payload?.error?.message || '').slice(0, 180),
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, status: 0, code: 'fetch-error', message: String(error?.message || error).slice(0, 180), ms: Date.now() - startedAt }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false })
  const [developerApi, vertexApi] = await Promise.all([probeDeveloperApi(), probeVertexApi()])
  return res.status(200).json({ ok: true, developerApi, vertexApi })
}
