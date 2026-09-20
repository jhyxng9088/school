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

const informal = /했어요|있어요|예정이에요|올렸어요|시작했어요|했나요|꺼져 있어|켜둘까|허용해줘|알려줄게|드릴게요/

test('all user-visible notification copy stays honorific', () => {
  for (const path of sources) {
    const source = read(path)
    assert.doesNotMatch(source, informal, path)
  }
})

test('notification families use formal Korean endings', () => {
  const schedule = read('push-backend-v2/lib/schedule-logic.js')
  const activity = read('push-backend-v2/lib/activity-logic.js')
  const social = read('push-backend-v2/api/activity-dispatch.js')
  const sw = read('public/sw.js')
  const client = read('src/push-client.js')

  assert.match(schedule, /관련 내용을 확인해 주세요/)
  assert.match(schedule, /할 일이 있습니다/)
  assert.match(schedule, /예정입니다/)
  assert.match(activity, /추가했습니다/)
  assert.match(activity, /수정했습니다/)
  assert.match(activity, /변경했습니다/)
  assert.match(social, /새 글을 올렸습니다/)
  assert.match(social, /공부를 시작했습니다/)
  assert.match(sw, /새로운 알림이 있습니다/)
  assert.match(sw, /알려 드리겠습니다/)
  assert.match(client, /S-Hub 알림이 꺼져 있습니다/)
  assert.match(client, /S-Hub 알림을 켜시겠습니까/)
  assert.match(client, /허용해 주세요/)
  assert.match(client, /알려 드립니다/)
})
