import { adminAccessToken, adminAppCheckToken, adminProjectId } from '../lib/firebase-admin.js'

const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
const FIREBASE_WEB_API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const startedAt = Date.now()
  try {
    const [accessToken, appCheckToken] = await Promise.all([
      adminAccessToken(),
      adminAppCheckToken(FIREBASE_APP_ID),
    ])
    const response = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${encodeURIComponent(adminProjectId())}/models/gemini-3.5-flash-lite:generateContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Firebase-AppCheck': appCheckToken,
        'Content-Type': 'application/json',
        'x-goog-api-key': FIREBASE_WEB_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Return JSON with answer equal to OK.' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
          maxOutputTokens: 80,
          temperature: 0,
        },
      }),
      signal: controller.signal,
    })
    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      code: String(payload?.error?.status || ''),
      message: String(payload?.error?.message || '').slice(0, 220),
      content: String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').slice(0, 180),
    })
  } catch (error) {
    return res.status(200).json({
      ok: false,
      status: 0,
      ms: Date.now() - startedAt,
      code: String(error?.code || error?.name || 'error'),
      message: String(error?.message || error).slice(0, 220),
    })
  } finally {
    clearTimeout(timer)
  }
}
