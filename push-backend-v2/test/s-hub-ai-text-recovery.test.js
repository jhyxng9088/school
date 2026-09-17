import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredAI } from '../lib/s-hub-ai-service.js'

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

test('empty 200 response from OpenRouter model routing falls back to a direct current free model', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY
  const originalFetch = globalThis.fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
  const requests = []

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    requests.push(body)
    if (requests.length === 1) {
      return response(200, {
        model: 'openrouter/free',
        choices: [{ message: { content: '' } }],
      })
    }
    return response(200, {
      model: 'google/gemma-4-26b-a4b-it:free',
      choices: [{ message: { content: '{"answer":"recovered"}' } }],
    })
  }

  try {
    const result = await generateStructuredAI({
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 26_000,
    })

    assert.equal(requests.length, 2)
    assert.deepEqual(requests[0].models, [
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it-20260403:free',
      'openrouter/free',
    ])
    assert.equal(requests[1].models, undefined)
    assert.equal(requests[1].model, 'google/gemma-4-26b-a4b-it:free')
    assert.deepEqual(result.value, { answer: 'recovered' })
    assert.equal(result.modelName, 'google/gemma-4-26b-a4b-it:free')
    assert.equal(result.attempts.length, 1)
    assert.match(result.attempts[0], /empty_response/)
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previousKey
  }
})
