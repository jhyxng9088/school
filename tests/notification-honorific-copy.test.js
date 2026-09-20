import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const sources = [
  'push-backend-v2/lib/schedule-logic.js',
  'push-backend-v2/lib/activity-logic.js',
  'push-backend-v2/api/activity-dispatch.js',
  'public/sw.js',
  'src/push-client.js',
]

const actualBanmal = /켜둘까\?|허용해줘|알려줄게|추가했어[.'"`]|수정했어[.'"`]|변경했어[.'"`]|올렸어[.'"`]|시작했어[.'"`]|예정이야|있어[.'"`]/

test('all user-visible notification copy stays polite without forcing formal 합니다 style', () => {
  for (const path of sources) {
    const source = read(path)
    assert.doesNotMatch(source, actualBanmal, path)
  }
})

test('notification families use friendly Korean honorific endings', () => {
  const schedule = read('push-backend-v2/lib/schedule-logic.js')
  const activity = read('push-backend-v2/lib/activity-logic.js')
  const social = read('push-backend-v2/api/activity-dispatch.js')
  const sw = read('public/sw.js')
  const client = read('src/push-client.js')

  assert.match(schedule, /확인해 주세요/)
  assert.match(schedule, /있어요/)
  assert.match(schedule, /예정이에요/)
  assert.match(activity, /추가했어요/)
  assert.match(activity, /수정했어요/)
  assert.match(activity, /변경했어요/)
  assert.match(social, /새 글을 올렸어요/)
  assert.match(social, /공부를 시작했어요/)
  assert.match(sw, /새로운 알림이 있어요/)
  assert.match(sw, /알려 드릴게요/)
  assert.match(client, /S-Hub 알림이 꺼져 있어요/)
  assert.match(client, /S-Hub 알림을 켜시겠어요/)
  assert.match(client, /허용해 주세요/)
  assert.match(client, /알려 드려요/)
})
