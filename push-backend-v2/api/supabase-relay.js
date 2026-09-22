const SUPABASE_FUNCTION_BASE = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/'
const ALLOWED_TARGETS = new Set([
  'board-realtime',
  'class-activity-mirror',
  'class-board',
  'class-board-all',
  'class-board-sections',
  'class-presence',
  'class-study',
  'push-subscription-mirror',
  'study-events',
])
const MAX_BODY_BYTES = 8 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 20_000

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, accept')
  res.setHeader('Cache-Control', 'no-store')
}

function requestUrl(req) {
  try {
    return new URL(String(req.url || ''), 'https://school-reminder-backend.vercel.app')
  } catch {
    return new URL('https://school-reminder-backend.vercel.app/api/supabase-relay')
  }
}

function relayTarget(req) {
  const value = req?.query?.target ?? requestUrl(req).searchParams.get('target')
  return String(Array.isArray(value) ? value[0] : value || '').trim()
}

function authorizationHeader(req) {
  const value = String(req?.headers?.authorization || '').trim()
  return /^Bearer\s+\S+/i.test(value) && value.length <= 5000 ? value : ''
}

function upstreamUrl(req, target) {
  const source = requestUrl(req)
  const destination = new URL(target, SUPABASE_FUNCTION_BASE)
  source.searchParams.forEach((value, key) => {
    if (key !== 'target') destination.searchParams.append(key, value)
  })
  return destination
}

async function readBody(req) {
  const method = String(req?.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return undefined

  if (Buffer.isBuffer(req?.body)) {
    if (req.body.length > MAX_BODY_BYTES) throw Object.assign(new Error('payload too large'), { statusCode: 413 })
    return req.body
  }
  if (typeof req?.body === 'string') {
    const body = Buffer.from(req.body)
    if (body.length > MAX_BODY_BYTES) throw Object.assign(new Error('payload too large'), { statusCode: 413 })
    return body
  }
  if (req?.body && typeof req.body === 'object') {
    const body = Buffer.from(JSON.stringify(req.body))
    if (body.length > MAX_BODY_BYTES) throw Object.assign(new Error('payload too large'), { statusCode: 413 })
    return body
  }

  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('payload too large'), { statusCode: 413 })
    chunks.push(buffer)
  }
  return chunks.length ? Buffer.concat(chunks) : undefined
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.statusCode = 405
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
    return
  }

  const target = relayTarget(req)
  if (!ALLOWED_TARGETS.has(target)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'invalid_target' }))
    return
  }

  const authorization = authorizationHeader(req)
  if (!authorization) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'auth_required' }))
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    res.statusCode = Number(error?.statusCode || 400)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'invalid_body' }))
    return
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const headers = { authorization }
    const contentType = String(req.headers?.['content-type'] || '').trim()
    const accept = String(req.headers?.accept || '').trim()
    if (contentType) headers['content-type'] = contentType
    if (accept) headers.accept = accept

    const upstream = await fetch(upstreamUrl(req, target), {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    })

    const responseBody = Buffer.from(await upstream.arrayBuffer())
    const responseType = String(upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    res.statusCode = upstream.status
    res.setHeader('Content-Type', responseType)
    res.setHeader('X-S-Hub-Relay', 'supabase')
    res.end(responseBody)
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    res.statusCode = timedOut ? 504 : 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      ok: false,
      error: timedOut ? 'upstream_timeout' : 'upstream_unavailable',
    }))
  } finally {
    clearTimeout(timeoutId)
  }
}
