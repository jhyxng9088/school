
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredWithFirebaseAI, requestFirebaseModel } from '../lib/s-hub-ai-service.js'

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

test('server Firebase AI request uses Admin OAuth, App Check and API key', async () => {
  const originalFetch = globalThis.fetch
  let request = null
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok' }) }] } }],
    })
  }
  try {
    const value = await requestFirebaseModel({
      projectId: 'school-test',
      accessToken: 'admin-oauth-token',
      appCheckToken: 'server-app-check-token',
      modelName: 'gemini-test',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(value, { answer: 'ok' })
    assert.equal(request.init.headers.Authorization, 'Bearer admin-oauth-token')
    assert.equal(request.init.headers['X-Firebase-AppCheck'], 'server-app-check-token')
    assert.ok(request.init.headers['x-goog-api-key'])
    assert.match(request.url, /firebasevertexai\.googleapis\.com/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('text requests prefer Flash Lite while attachments prefer multimodal Flash', async () => {
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok' }) }] } }],
    })
  }
  try {
    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'text', responseSchema: schema,
    })
    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'image', responseSchema: schema,
      attachments: [{ mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    assert.match(urls[0], /gemini-3\.5-flash-lite/)
    assert.match(urls[1], /gemini-3\.7-flash/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI falls back to the next model on a retryable failure', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return response(503, { error: { status: 'UNAVAILABLE', message: 'try later' } })
    return response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'second' }) }] } }] })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'hello', responseSchema: schema,
      timeoutMs: 8000, models: ['model-one', 'model-two'],
    })
    assert.equal(result.value.answer, 'second')
    assert.equal(result.modelName, 'model-two')
    assert.equal(result.attempts.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI does not fan out an authorization failure across models', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } })
  }
  try {
    await assert.rejects(
      generateStructuredWithFirebaseAI({
        projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'hello', responseSchema: schema,
        timeoutMs: 8000, models: ['model-one', 'model-two'],
      }),
      (error) => error.status === 403 && error.attempts.length === 1,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
