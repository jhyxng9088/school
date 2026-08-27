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

test('server Firebase AI request forwards Firebase Auth, App Check and API key', async () => {
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
      firebaseIdToken: 'firebase-user-token',
      appCheckToken: 'app-check-token',
      modelName: 'gemini-test',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(value, { answer: 'ok' })
    assert.equal(request.init.headers.Authorization, 'Firebase firebase-user-token')
    assert.equal(request.init.headers['X-Firebase-AppCheck'], 'app-check-token')
    assert.ok(request.init.headers['x-goog-api-key'])
    assert.match(request.url, /firebasevertexai\.googleapis\.com/)
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
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'second' }) }] } }],
    })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test',
      firebaseIdToken: 'firebase-user-token',
      appCheckToken: 'app-check-token',
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 8000,
      models: ['model-one', 'model-two'],
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
        projectId: 'school-test',
        firebaseIdToken: 'firebase-user-token',
        appCheckToken: 'app-check-token',
        prompt: 'hello',
        responseSchema: schema,
        timeoutMs: 8000,
        models: ['model-one', 'model-two'],
      }),
      (error) => error.status === 403 && error.attempts.length === 1,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
