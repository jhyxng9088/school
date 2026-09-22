import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../lib/supabase-relay-handler.js'

function responseRecorder() {
  const headers = new Map()
  return {
    headers,
    statusCode: 200,
    body: Buffer.alloc(0),
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)) },
    end(value = '') { this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value)) },
  }
}

test('Supabase relay only forwards whitelisted authenticated functions', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ ok: true, scope: 'class' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const req = {
      method: 'GET',
      url: '/api/supabase-relay?target=class-study&scope=class&period=today',
      query: { target: 'class-study', scope: 'class', period: 'today' },
      headers: { authorization: 'Bearer firebase-token', accept: 'application/json' },
    }
    const res = responseRecorder()
    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(calls.length, 1)
    assert.equal(
      calls[0].url,
      'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-study?scope=class&period=today',
    )
    assert.equal(calls[0].options.headers.authorization, 'Bearer firebase-token')
    assert.equal(res.headers.get('x-s-hub-relay'), 'supabase')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Supabase relay rejects unknown targets before fetching', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => {
    called = true
    return new Response('{}')
  }

  try {
    const req = {
      method: 'GET',
      url: '/api/supabase-relay?target=not-allowed',
      query: { target: 'not-allowed' },
      headers: { authorization: 'Bearer firebase-token' },
    }
    const res = responseRecorder()
    await handler(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Supabase relay requires bearer authentication', async () => {
  const req = {
    method: 'GET',
    url: '/api/supabase-relay?target=class-board',
    query: { target: 'class-board' },
    headers: {},
  }
  const res = responseRecorder()
  await handler(req, res)
  assert.equal(res.statusCode, 401)
})
