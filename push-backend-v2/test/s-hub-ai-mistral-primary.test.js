import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredAI, requestMistralModel } from '../lib/s-hub-ai-service.js'

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

function withProviderKeys({ mistral = 'test-mistral-key', openrouter = 'test-openrouter-key' } = {}) {
  const previousMistral = process.env.MISTRAL_API_KEY
  const previousOpenRouter = process.env.OPENROUTER_API_KEY
  if (mistral == null) delete process.env.MISTRAL_API_KEY
  else process.env.MISTRAL_API_KEY = mistral
  if (openrouter == null) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = openrouter
  return () => {
    if (previousMistral === undefined) delete process.env.MISTRAL_API_KEY
    else process.env.MISTRAL_API_KEY = previousMistral
    if (previousOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previousOpenRouter
  }
}

test('Ministral 14B request uses direct API, strict schema and multimodal chunks', async () => {
  const originalFetch = globalThis.fetch
  let request = null
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init }
    return response(200, {
      model: 'ministral-14b-2512',
      choices: [{ message: { content: JSON.stringify({ answer: 'mistral-ok' }) } }],
      usage: { prompt_tokens: 18, completion_tokens: 4, total_tokens: 22 },
    })
  }

  try {
    const result = await requestMistralModel({
      apiKey: 'secret',
      prompt: 'analyze',
      attachments: [
        { type: 'image_url', image_url: 'data:image/jpeg;base64,AA==' },
        { type: 'document_url', document_url: 'data:application/pdf;base64,AQ==' },
      ],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    const body = JSON.parse(request.init.body)
    assert.equal(request.url, 'https://api.mistral.ai/v1/chat/completions')
    assert.equal(request.init.headers.Authorization, 'Bearer secret')
    assert.equal(body.model, 'ministral-14b-2512')
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.name, 's_hub_result')
    assert.deepEqual(body.response_format.json_schema.schema, schema)
    assert.equal(body.response_format.json_schema.strict, true)
    assert.equal(body.messages[0].content[1].image_url, 'data:image/jpeg;base64,AA==')
    assert.equal(body.messages[0].content[2].document_url, 'data:application/pdf;base64,AQ==')
    assert.deepEqual(result.value, { answer: 'mistral-ok' })
    assert.equal(result.modelName, 'ministral-14b-2512')
    assert.equal(result.usage.totalTokens, 22)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('default S-Hub AI uses Ministral 14B before other providers', async () => {
  const restoreKeys = withProviderKeys()
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return response(200, {
      model: 'ministral-14b-2512',
      choices: [{ message: { content: JSON.stringify({ answer: 'primary-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
    })
    assert.deepEqual(urls, ['https://api.mistral.ai/v1/chat/completions'])
    assert.deepEqual(result.value, { answer: 'primary-ok' })
    assert.equal(result.modelName, 'ministral-14b-2512')
    assert.deepEqual(result.attempts, [])
  } finally {
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})

test('Mistral image input is converted to direct base64 image_url format', async () => {
  const restoreKeys = withProviderKeys()
  const originalFetch = globalThis.fetch
  let body = null
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body)
    return response(200, {
      model: 'ministral-14b-2512',
      choices: [{ message: { content: JSON.stringify({ answer: 'vision-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'read this notice',
      responseSchema: schema,
      attachments: [{ name: 'notice.jpg', mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    assert.equal(body.model, 'ministral-14b-2512')
    assert.equal(body.messages[0].content[1].type, 'image_url')
    assert.equal(body.messages[0].content[1].image_url, 'data:image/jpeg;base64,AA==')
    assert.deepEqual(result.value, { answer: 'vision-ok' })
  } finally {
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})

test('Ministral 14B 429 falls back to Mistral Small 4 before OpenRouter', async () => {
  const restoreKeys = withProviderKeys()
  const originalFetch = globalThis.fetch
  const calls = []
  const originalConsoleError = console.error
  console.error = () => {}

  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url))
    const body = JSON.parse(init.body)
    calls.push({ host: parsed.host, body })

    if (parsed.host !== 'api.mistral.ai') {
      throw new Error('OpenRouter should not be reached when Ministral succeeds')
    }
    if (body.model === 'ministral-14b-2512') {
      return response(429, { message: 'capacity busy', code: '1300' })
    }
    assert.equal(body.model, 'mistral-small-2603')
    return response(200, {
      model: 'mistral-small-2603',
      choices: [{ message: { content: JSON.stringify({ answer: 'small-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 33000,
    })
    assert.deepEqual(calls.map(({ host, body }) => [host, body.model]), [
      ['api.mistral.ai', 'ministral-14b-2512'],
      ['api.mistral.ai', 'mistral-small-2603'],
    ])
    assert.deepEqual(result.value, { answer: 'small-ok' })
    assert.equal(result.modelName, 'mistral-small-2603')
    assert.equal(result.attempts.length, 1)
    assert.match(result.attempts[0], /^mistral ministral-14b-2512: 1300 /)
  } finally {
    console.error = originalConsoleError
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})

test('OpenRouter remains final fallback after both Mistral models are unavailable', async () => {
  const restoreKeys = withProviderKeys()
  const originalFetch = globalThis.fetch
  const calls = []
  const originalConsoleError = console.error
  console.error = () => {}

  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url))
    const body = JSON.parse(init.body)
    calls.push({ host: parsed.host, body })
    if (parsed.host === 'api.mistral.ai') {
      return response(429, { message: 'capacity busy', code: '1300' })
    }
    return response(200, {
      model: 'google/gemma-4-31b-it:free',
      choices: [{ message: { content: JSON.stringify({ answer: 'openrouter-fallback-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 33000,
    })
    assert.equal(calls[0].body.model, 'ministral-14b-2512')
    assert.equal(calls[1].body.model, 'mistral-small-2603')
    assert.equal(calls[2].host, 'openrouter.ai')
    assert.deepEqual(result.value, { answer: 'openrouter-fallback-ok' })
    assert.equal(result.attempts.length, 2)
    assert.match(result.attempts[0], /^mistral ministral-14b-2512: 1300 /)
    assert.match(result.attempts[1], /^mistral mistral-small-2603: 1300 /)
  } finally {
    console.error = originalConsoleError
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})

test('image requests keep the same Mistral-native image chunk when Small 4 recovers', async () => {
  const restoreKeys = withProviderKeys()
  const originalFetch = globalThis.fetch
  const calls = []
  const originalConsoleError = console.error
  console.error = () => {}

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    calls.push(body)
    if (body.model === 'ministral-14b-2512') {
      return response(429, { message: 'capacity busy', code: '1300' })
    }
    return response(200, {
      model: 'mistral-small-2603',
      choices: [{ message: { content: JSON.stringify({ answer: 'vision-fallback-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'read this notice',
      responseSchema: schema,
      attachments: [{ name: 'notice.jpg', mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    assert.equal(calls[1].model, 'mistral-small-2603')
    assert.equal(calls[1].messages[0].content[1].type, 'image_url')
    assert.equal(calls[1].messages[0].content[1].image_url, 'data:image/jpeg;base64,AA==')
    assert.deepEqual(result.value, { answer: 'vision-fallback-ok' })
  } finally {
    console.error = originalConsoleError
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})

test('OpenRouter remains available when Mistral key is absent', async () => {
  const restoreKeys = withProviderKeys({ mistral: null, openrouter: 'test-openrouter-key' })
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return response(200, {
      model: 'openrouter/free',
      choices: [{ message: { content: JSON.stringify({ answer: 'openrouter-ok' }) } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
    })
    assert.deepEqual(urls, ['https://openrouter.ai/api/v1/chat/completions'])
    assert.deepEqual(result.value, { answer: 'openrouter-ok' })
  } finally {
    globalThis.fetch = originalFetch
    restoreKeys()
  }
})
