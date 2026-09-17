import test from 'node:test'
import assert from 'node:assert/strict'
import { requestOpenRouterModel } from '../lib/s-hub-ai-service.js'

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
  }
}

test('free image fallback accepts JSON wrapped in markdown fences', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => response(200, {
    model: 'openrouter/free',
    choices: [{ message: { content: '```json\n{"answer":"vision-ok"}\n```' } }],
  })

  try {
    const result = await requestOpenRouterModel({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      prompt: 'analyze image',
      attachments: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } }],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(result.value, { answer: 'vision-ok' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('free image fallback accepts a valid JSON object surrounded by prose', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => response(200, {
    model: 'openrouter/free',
    choices: [{ message: { content: 'Here is the result:\n{"answer":"vision-ok"}\nDone.' } }],
  })

  try {
    const result = await requestOpenRouterModel({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      prompt: 'analyze image',
      attachments: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } }],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(result.value, { answer: 'vision-ok' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
