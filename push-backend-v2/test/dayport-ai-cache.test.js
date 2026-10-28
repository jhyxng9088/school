import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizedPromptForCache,
  schoolQuestionCacheKey,
  readSchoolQuestionCache,
  writeSchoolQuestionCache,
  pruneExpiredSchoolQuestionCache,
} from '../api/s-hub-ai.js'

function body(overrides = {}) {
  return {
    cacheScope: 'school-question',
    responseSchema: { type: 'object', properties: { answer: { type: 'string' } } },
    maxOutputTokens: 3200,
    temperature: 0.05,
    attachments: [{ mimeType: 'image/png', dataBase64: 'AAA' }],
    ...overrides,
  }
}

const CLASS_ID = 'class-7'

test('cache key ignores minute drift but keeps the date and actual school data', () => {
  const promptA = '현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","reminders":[{"title":"수학"}]}'
  const promptB = '현재 기준 시각: 2026-08-28 08:19\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:19","reminders":[{"title":"수학"}]}'
  assert.equal(
    schoolQuestionCacheKey(body(), promptA, 'school', CLASS_ID),
    schoolQuestionCacheKey(body(), promptB, 'school', CLASS_ID),
  )
  assert.match(normalizedPromptForCache(promptA), /현재 기준 날짜: 2026-08-28/)
  assert.match(normalizedPromptForCache(promptA), /"reference":"2026-08-28"/)
})

test('cache is limited to the same class and exact attachment/context', () => {
  const prompt = '현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","reminders":[]}'
  const key = schoolQuestionCacheKey(body(), prompt, 'school', CLASS_ID)
  assert.notEqual(key, schoolQuestionCacheKey(body(), prompt, 'school', 'class-8'))
  assert.notEqual(key, schoolQuestionCacheKey(body({ attachments: [{ mimeType: 'image/png', dataBase64: 'BBB' }] }), prompt, 'school', CLASS_ID))
  assert.notEqual(key, schoolQuestionCacheKey(body(), prompt.replace('"reminders":[]', '"reminders":[{"title":"영어"}]'), 'school', CLASS_ID))
  assert.equal(schoolQuestionCacheKey(body({ cacheScope: '' }), prompt, 'school', CLASS_ID), '')
  assert.equal(schoolQuestionCacheKey(body(), prompt, 'reminder', CLASS_ID), '')
  assert.equal(schoolQuestionCacheKey(body(), prompt, 'school', ''), '')
})

function fakeDb(initial = null, expiredDocs = []) {
  const state = { value: initial, deleted: false, written: null, pruned: [] }
  const collectionApi = {
    doc() {
      return {
        async get() {
          return state.value ? { exists: true, data: () => state.value } : { exists: false, data: () => null }
        },
        async set(value) { state.written = value },
        async delete() { state.deleted = true },
      }
    },
    where() { return collectionApi },
    limit() { return collectionApi },
    async get() {
      return {
        empty: expiredDocs.length === 0,
        docs: expiredDocs.map((id) => ({ id, ref: { id } })),
      }
    },
  }
  return {
    state,
    collection() { return collectionApi },
    batch() {
      return {
        delete(ref) { state.pruned.push(ref.id) },
        async commit() {},
      }
    },
  }
}

test('cache returns live results and rejects expired results', async () => {
  const live = fakeDb({ result: { value: { answer: 'cached', items: [] } }, expiresAtMs: Date.now() + 60_000 })
  assert.deepEqual(await readSchoolQuestionCache(live, 'abc'), { value: { answer: 'cached', items: [] }, cacheHit: true })

  const expired = fakeDb({ result: { value: { answer: 'old' } }, expiresAtMs: Date.now() - 1 })
  assert.equal(await readSchoolQuestionCache(expired, 'abc'), null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(expired.state.deleted, true)
})

test('cache writes only the AI result and timestamps, not request source data', async () => {
  const db = fakeDb()
  await writeSchoolQuestionCache(db, 'abc', { value: { answer: 'ok', items: [] }, modelName: 'model' })
  assert.deepEqual(db.state.written.result.value, { answer: 'ok', items: [] })
  assert.equal(db.state.written.result.cacheHit, false)
  assert.equal(typeof db.state.written.createdAtMs, 'number')
  assert.equal(typeof db.state.written.expiresAtMs, 'number')
  const stored = JSON.stringify(db.state.written)
  assert.equal(stored.includes('dataBase64'), false)
  assert.equal(stored.includes('학생 질문'), false)
})

test('expired cache maintenance prunes a bounded batch', async () => {
  const db = fakeDb(null, ['old-1', 'old-2'])
  assert.equal(await pruneExpiredSchoolQuestionCache(db, 2), 2)
  assert.deepEqual(db.state.pruned, ['old-1', 'old-2'])
})
