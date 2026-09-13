import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredAI, requestOpenRouterModel } from '../lib/s-hub-ai-service.js'

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

function response(status, payload, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)]),
  )
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => normalizedHeaders.get(String(name).toLowerCase()) || null },
    text: async () => JSON.stringify(payload),
  }
}

function withApiKey(value = 'test-openrouter-key') {
  const previous = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = value
  return () => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  }
}

test('OpenRouter request uses bearer auth, pinned free Gemma model and JSON object mode', async () => {
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
    const result = await requestOpenRouterModel({
      apiKey: 'secret',
      modelName: 'google/gemma-4-31b-it:free',
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
    assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(request.init.headers.Authorization, 'Bearer secret')
    assert.equal(body.model, 'google/gemma-4-31b-it:free')
    assert.equal(body.response_format.type, 'json_object')
    assert.match(body.messages[0].content[0].text, /JSON_SCHEMA:/)
    assert.match(body.messages[0].content[0].text, /"answer"/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('image, PDF and text attachments use OpenRouter multimodal chunks with free PDF parser', async () => {
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
    assert.equal(result.modelName, 'google/gemma-4-31b-it:free')
    assert.equal(content[1].type, 'image_url')
    assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,AA==')
    assert.equal(content[2].type, 'file')
    assert.equal(content[2].file.filename, 'notice.pdf')
    assert.equal(content[2].file.file_data, 'data:application/pdf;base64,AQ==')
    assert.equal(content[3].type, 'text')
    assert.match(content[3].text, /학교 공지/)
    assert.match(content[3].text, /memo\.txt/)
    assert.deepEqual(body.plugins, [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }])
  } finally {
    globalThis.fetch = originalFetch
    restoreKey()
  }
})

test('default provider retries the same pinned OpenRouter model only once on transient failure', async () => {
  const restoreKey = withApiKey()
  const originalFetch = globalThis.fetch
  const models = []
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls += 1
    models.push(JSON.parse(init.body).model)
    if (calls === 1) return response(503, { error: { message: 'temporarily unavailable', code: 'service_unavailable' } })
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
    assert.deepEqual(models, ['google/gemma-4-31b-it:free', 'google/gemma-4-31b-it:free'])
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
    const originalConsoleError = console.error
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return response(status, { error: { message: 'denied', code: `http-${status}` } })
    }
    console.error = () => {}
    try {
      await assert.rejects(
        generateStructuredAI({ prompt: 'hello', responseSchema: schema, timeoutMs: 8000 }),
        (error) => error.status === status && error.attempts.length === 1,
      )
      assert.equal(calls, 1)
    } finally {
      console.error = originalConsoleError
      globalThis.fetch = originalFetch
      restoreKey()
    }
  }
})

test('429 preserves safe provider headers and request-size metadata for diagnostics', async () => {
  const restoreKey = withApiKey()
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error
  globalThis.fetch = async () => response(
    429,
    { error: { message: 'Rate limit exceeded', code: 429 } },
    {
      'x-request-id': 'req-test-123',
      'retry-after': '60',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-limit-requests': '50',
      'x-ratelimit-remaining-requests': '0',
    },
  )
  console.error = () => {}
  try {
    await assert.rejects(
      generateStructuredAI({
        prompt: 'hello',
        responseSchema: schema,
        maxOutputTokens: 300,
        attachments: [{ name: 'notice.jpg', mimeType: 'image/jpeg', dataBase64: 'AA==' }],
      }),
      (error) => {
        assert.equal(error.status, 429)
        assert.equal(error.code, '429')
        assert.equal(error.rateLimit.requestId, 'req-test-123')
        assert.equal(error.rateLimit.retryAfter, '60')
        assert.equal(error.rateLimit.remaining, '0')
        assert.equal(error.rateLimit.limitRequests, '50')
        assert.equal(error.rateLimit.remainingRequests, '0')
        assert.deepEqual(error.requestMeta, {
          modelName: 'google/gemma-4-31b-it:free',
          promptChars: 5,
          attachmentCount: 1,
          attachmentBase64Chars: 4,
          maxOutputTokens: 300,
        })
        return true
      },
    )
  } finally {
    console.error = originalConsoleError
    globalThis.fetch = originalFetch
    restoreKey()
  }
})

test('missing server API key fails before any provider request', async () => {
  const originalFetch = globalThis.fetch
  const previous = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(500, {})
  }
  try {
    await assert.rejects(
      generateStructuredAI({ prompt: 'hello', responseSchema: schema }),
      (error) => error.status === 503 && error.code === 'openrouter_not_configured',
    )
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  }
})
