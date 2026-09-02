import { adminAuth, adminDb } from '../lib/firebase-admin.js'

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

function safe(value, max) {
  return String(value || '').trim().slice(0, max)
}

const DEVICE_TYPES = new Set(['iphone', 'ipad', 'android', 'desktop', 'unknown'])
const BROWSERS = new Set(['safari', 'samsung', 'chrome', 'firefox', 'edge', 'other'])
const DISPLAY_MODES = new Set(['standalone', 'browser'])

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: '지원하지 않는 요청이야.' })

  try {
    const token = bearerToken(req)
    if (!token) return res.status(401).json({ ok: false, message: '로그인이 필요해.' })
    const decoded = await adminAuth().verifyIdToken(token)

    const type = safe(req.body?.deviceType, 20).toLowerCase()
    const browser = safe(req.body?.browser, 20).toLowerCase()
    const displayMode = safe(req.body?.displayMode, 20).toLowerCase()
    const payload = {
      deviceType: DEVICE_TYPES.has(type) ? type : 'unknown',
      deviceLabel: safe(req.body?.deviceLabel, 50) || '알 수 없는 기기',
      platform: safe(req.body?.platform, 80),
      browser: BROWSERS.has(browser) ? browser : 'other',
      displayMode: DISPLAY_MODES.has(displayMode) ? displayMode : 'browser',
      updatedAt: Date.now(),
    }

    // One tiny admin-only document per Firebase Auth identity. No student data scan is needed.
    await adminDb().collection('adminDevices').doc(decoded.uid).set(payload, { merge: true })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('device registration failed', { code: error?.code, message: error?.message })
    return res.status(500).json({ ok: false, message: '기기 정보를 저장하지 못했어.' })
  }
}
