import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const TARGET_STUDENT_KEY = 'student-a63dc064d4c5227e'

test('notification tone profile is loaded and keyed without exposing profile fields to the service worker', () => {
  const index = read('index.html')
  const profileSync = read('public/notification-tone-profile.js')
  const sw = read('public/sw.js')

  assert.match(index, /notification-tone-profile\.js/)
  assert.match(profileSync, /school\.studentProfile\.v1/)
  assert.match(profileSync, /SET_NOTIFICATION_TONE_PROFILE/)
  assert.match(profileSync, new RegExp(TARGET_STUDENT_KEY))
  assert.match(sw, new RegExp(TARGET_STUDENT_KEY))
  assert.match(sw, /school-notification-profile-v1/)
  assert.match(sw, /SET_NOTIFICATION_TONE_PROFILE/)
})

test('only the matching profile receives the gentle notification body', () => {
  const sw = read('public/sw.js')

  assert.match(sw, /studentKey !== PERSONALIZED_STUDENT_KEY\) return body/)
  assert.match(sw, /☺️/)
  assert.match(sw, /잊지 않도록 알려 드릴게요/)
  assert.match(sw, /좋은 하루 보내세요/)
  assert.match(sw, /body: displayBody/)
})

test('routine push pause remains independent from notification tone personalization', () => {
  const sw = read('public/sw.js')
  const pauseBlock = sw.match(/function routinePushPaused[\s\S]*?\n}/)?.[0] || ''

  assert.match(pauseBlock, /normalizedTag\.includes\('meal'\)/)
  assert.match(pauseBlock, /normalizedTag\.includes\('next-class'\)/)
  assert.match(pauseBlock, /normalizedTag\.includes\('period-'\)/)
  assert.doesNotMatch(pauseBlock, /PERSONALIZED_STUDENT_KEY|readNotificationToneProfile/)
})
