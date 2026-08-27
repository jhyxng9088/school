import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizedPromptForCache,
  schoolQuestionCacheKey,
  readSchoolQuestionCache,
  writeSchoolQuestionCache,
} from '../api/s-hub-ai.js'

function body(overrides = {}) {
  return {
    cacheScope: 'school-question',
    responseSchema: { type: 'object', properties: { answer: { type: 'string' } } },
    maxOutputTokens: 1200,
    temperature: 0.05,
    attachments: [{ mimeType: 'image/png', dataBase64: 'AAA' }],
    ...overrides,
  }
}

test('cache normalization removes minute-level clock drift but keeps the date', () => {
  assert.equal(
    normalizedPromptForCache('현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","a":1}'),
    '현재 기준 날짜: 2026-08-28\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28","a":1}',
  )
})

test('school question cache key is shared only for the exact effective request', () => {
  const promptA = '현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","a":1}'
  const promptB = '현재 기준 시각: 2026-08-28 08:19\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:19","a":1}'
  const keyA = schoolQuestionCacheKey(body(), promptA, 'school')
  const keyB = schoolQuestionCacheKey(body(), promptB, 'school')
  assert.equal(keyA, keyB)
  assert.notEqual(keyA, schoolQuestionCacheKey(body({ attachments: [{ mimeType: 'image/png', dataBase64: 'BBB' }] }), promptB, 'school'))
  assert.notEqual(keyA, schoolQuestionCacheKey(body(), promptB.replace('"a":1', '"a":2'), 'school'))
  assert.equal(schoolQuestionCacheKey(body({ cacheScope: '' }), promptA, 'school'), '')
  assert.equal(schoolQuestionCacheKey(body(), promptA, 'reminder'), '')
})

function fakeDb(initial = null) {
  const state = { value: initial, deleted: false, written: null }
  return {
    state,
    collection() {
      return {
        doc() {
          return {
            async get() {
              return state.value
                ? { exists: true, data: () => state.value }
                : { exists: false, data: () => null }
            },
            async set(value) { state.written = value },
            async delete() { state.deleted = true },
          }
        },
      }
    },
  }
}

test('cache read returns valid results and rejects expired entries', async () => {
  const live = fakeDb({ result: { value: { answer: 'cached' } }, expiresAtMs: Date.now() + 60_000 })
  assert.deepEqual(await readSchoolQuestionCache(live, 'abc'), { value: { answer: 'cached' }, cacheHit: true })

  const expired = fakeDb({ result: { value: { answer: 'old' } }, expiresAtMs: Date.now() - 1 })
  assert.equal(await readSchoolQuestionCache(expired, 'abc'), null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(expired.state.deleted, true)
})

test('cache write stores only result metadata, not prompt or attachment bytes', async () => {
  const db = fakeDb()
  await writeSchoolQuestionCache(db, 'abc', { value: { answer: 'ok', items: [] }, modelName: 'model' })
  assert.deepEqual(db.state.written.result.value, { answer: 'ok', items: [] })
  assert.equal(db.state.written.result.cacheHit, false)
  assert.equal(typeof db.state.written.createdAtMs, 'number')
  assert.equal(typeof db.state.written.expiresAtMs, 'number')
  assert.equal(JSON.stringify(db.state.written).includes('dataBase64'), false)
  assert.equal(JSON.stringify(db.state.written).includes('학생 질문'), false)
})
