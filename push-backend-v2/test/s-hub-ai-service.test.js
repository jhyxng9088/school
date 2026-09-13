import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredAI, requestMistralModel } from '../lib/s-hub-ai-service.js'

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

function withApiKey(value = 'test-mistral-key') {
  const previous = process.env.MISTRAL_API_KEY
  process.env.MISTRAL_API_KEY = value
  return () => {
    if (previous === undefined) delete process.env.MISTRAL_API_KEY
    else process.env.MISTRAL_API_KEY = previous
  }
}

test('Mistral request uses bearer auth, pinned model and strict JSON schema', async () => {
  const originalFetch = globalThis.fetch
  let request = null
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return response(200, {
      choices: [{ message: { content: JSON.stringify({ answer: 'ok' }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    })
  }
  try {
    const result = await requestMistralModel({
      apiKey: 'secret',
      modelName: 'mistral-small-2603',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    const body = JSON.parse(request.init.body)
    assert.deepEqual(result.value, { answer: 'ok' })
    assert.equal(result.usage.totalTokens, 15)
    assert.equal(request.url, 'https://api.mistral.ai/v1/chat/completions')
    assert.equal(request.init.headers.Authorization, 'Bearer secret')
    assert.equal(body.model, 'mistral-small-2603')
    assert.equal(body.response_format.type, 'json_schema')
    assert.deepEqual(body.response_format.json_schema.schema, schema)
    assert.equal(body.response_format.json_schema.strict, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('image, PDF and text attachments use Mistral multimodal content chunks', async () => {
  const restoreKey = withApiKey()
  const originalFetch = globalThis.fetch
  let body = null
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body)
    return response(200, {
      choices: [{ message: { content: JSON.stringify({ answer: 'attachments-ok' }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
    })
  }
  try {
    const result = await generateStructuredAI({
      prompt: 'analyze',
      responseSchema: schema,
      attachments: [
        { name: 'notice.jpg', mimeType: 'image/jpeg', dataBase64: 'AA==' },
        { name: 'notice.pdf', mimeType: 'application/pdf', dataBase64: 'AQ==' },
        { name: 'memo.txt', mimeType: 'text/plain', dataBase64: Buffer.from('학교 공지').toString('base64') },
      ],
    })
    const content = body.messages[0].content
    assert.equal(result.modelName, 'mistral-small-2603')
    assert.equal(content[1].type, 'image_url')
    assert.equal(content[1].image_url, 'data:image/jpeg;base64,AA==')
    assert.equal(content[2].type, 'document_url')
    assert.equal(content[2].document_url, 'data:application/pdf;base64,AQ==')
    assert.equal(content[3].type, 'text')
    assert.match(content[3].text, /학교 공지/)
    assert.match(content[3].text, /memo\.txt/)
  } finally {
    globalThis.fetch = originalFetch
    restoreKey()
  }
})

test('default provider retries the same pinned model only once on transient failure', async () => {
  const restoreKey = withApiKey()
  const originalFetch = globalThis.fetch
  const models = []
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls += 1
    models.push(JSON.parse(init.body).model)
    if (calls === 1) return response(503, { message: 'temporarily unavailable', code: 'service_unavailable' })
    return response(200, {
      choices: [{ message: { content: JSON.stringify({ answer: 'second' }) } }],
    })
  }
  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 8000,
    })
    assert.deepEqual(result.value, { answer: 'second' })
    assert.deepEqual(models, ['mistral-small-2603', 'mistral-small-2603'])
    assert.equal(result.attempts.length, 1)
  } finally {
    globalThis.fetch = originalFetch
    restoreKey()
  }
})

test('authorization and rate-limit failures are not retried', async () => {
  for (const status of [401, 403, 429]) {
    const restoreKey = withApiKey()
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return response(status, { message: 'denied', code: `http-${status}` })
    }
    try {
      await assert.rejects(
        generateStructuredAI({ prompt: 'hello', responseSchema: schema, timeoutMs: 8000 }),
        (error) => error.status === status && error.attempts.length === 1,
      )
      assert.equal(calls, 1)
    } finally {
      globalThis.fetch = originalFetch
      restoreKey()
    }
  }
})

test('missing server API key fails before any provider request', async () => {
  const originalFetch = globalThis.fetch
  const previous = process.env.MISTRAL_API_KEY
  delete process.env.MISTRAL_API_KEY
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(500, {})
  }
  try {
    await assert.rejects(
      generateStructuredAI({ prompt: 'hello', responseSchema: schema }),
      (error) => error.status === 503 && error.code === 'mistral_not_configured',
    )
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (previous === undefined) delete process.env.MISTRAL_API_KEY
    else process.env.MISTRAL_API_KEY = previous
  }
})
