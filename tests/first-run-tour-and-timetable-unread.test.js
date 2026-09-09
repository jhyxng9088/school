import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('first-run feature tour appears only after a new profile and can resume once', () => {
  const source = read('public/first-run-notice.js')

  assert.match(source, /school\.featureTour\.v1/)
  assert.match(source, /school\.featureTourStep\.v1/)
  assert.match(source, /school:student-profile-saved/)
  assert.match(source, /hadProfileAtBoot/)
  assert.match(source, /state === 'pending'/)
  assert.match(source, /localStorage\.setItem\(TOUR_KEY, 'done'\)/)
  assert.match(source, /localStorage\.removeItem\(TOUR_STEP_KEY\)/)
})

test('feature tour has five product cards, a creator finish card, and polite copy', () => {
  const source = read('public/first-run-notice.js')
  const css = read('public/first-run-notice.css')

  assert.match(source, /학교생활, 궁금한 건 물어보세요\./)
  assert.match(source, /공지는 AI가 읽어드려요\./)
  assert.match(source, /일정까지 바로 정리해요\./)
  assert.match(source, /학교 정보를 한곳에서 확인해요\./)
  assert.match(source, /우리 반과 함께 업데이트해요\./)
  assert.match(source, /title: '@j\.hyxng'/)
  assert.doesNotMatch(source, /학교생활을 조금 더 간단하게/)
  assert.match(source, /pointerdown/)
  assert.match(source, /pointermove/)
  assert.match(source, /S-Hub 시작하기/)

  assert.match(css, /\.feature-tour-track/)
  assert.match(css, /transform 720ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /\.feature-tour-slide\.is-active/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('feature tour next button starts centered and makes room for a fixed-width back button smoothly', () => {
  const source = read('public/first-run-notice.js')
  const css = read('public/first-run-notice.css')

  assert.match(source, /const actions = layer\.querySelector\('\.feature-tour-actions'\)/)
  assert.match(source, /actions\?\.classList\.toggle\('has-back', index > 0\)/)
  assert.match(css, /\.feature-tour-actions \{[\s\S]*position: relative;[\s\S]*height: 52px;/)
  assert.match(css, /\.feature-tour-back \{[\s\S]*width: 84px;/)
  assert.match(css, /\.feature-tour-next \{[\s\S]*left: 0;[\s\S]*width: 100%;/)
  assert.match(css, /\.feature-tour-actions\.has-back \.feature-tour-next \{[\s\S]*left: 96px;[\s\S]*width: calc\(100% - 96px\);/)
  assert.match(css, /left 620ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /width 620ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
})

test('timetable unread dot ignores historical and stale override activity', () => {
  const source = read('src/unread-store.js')

  assert.match(source, /timetableOverrides: \{\}/)
  assert.match(source, /timetableReady: false/)
  assert.match(source, /function timetableActivityStillRelevant\(store, activity\)/)
  assert.match(source, /date < todayDateKey\(\)/)
  assert.match(source, /store\.state\.timetableOverrides\?\.\[date\]/)
  assert.match(source, /seenVersion\(store, NAV_STATE_IDS\.timetable\) <= 0/)
  assert.match(source, /!store\.state\.activityReady \|\| !store\.state\.seenReady \|\| !store\.state\.timetableReady/)
  assert.match(source, /subscribeClassLiveData\('timetable', store\.classId/)
})

test('reminder unread baseline waits for the real reminder snapshot and repairs the old baseline generation', () => {
  const source = read('src/unread-store.js')

  assert.match(source, /reminder_rows_v3/)
  assert.match(source, /todosReady: false/)
  assert.match(source, /!store\.state\.activityReady \|\| !store\.state\.seenReady \|\| !store\.state\.todosReady/)
  assert.match(source, /seenVersion\(store, REMINDER_ROW_BASELINE_ID\) <= 0/)
  assert.match(source, /store\.state\.todosReady = true/)
  assert.match(source, /subscribeClassLiveData\('todos', store\.classId/)
})

test('academic unread dot establishes a fresh baseline and ignores finished schedules', () => {
  const source = read('src/unread-store.js')

  assert.match(source, /academic_v2/)
  assert.match(source, /academicReady: false/)
  assert.match(source, /function academicEventStillRelevant\(value\)/)
  assert.match(source, /endDate >= todayDateKey\(\)/)
  assert.match(source, /seenVersion\(store, ACADEMIC_BASELINE_ID\) <= 0/)
  assert.match(source, /Math\.max\(seenVersion\(store, NAV_STATE_IDS\.academic\), seenVersion\(store, ACADEMIC_BASELINE_ID\)\)/)
  assert.match(source, /startDate: String\(value\.startDate \|\| ''\)/)
  assert.match(source, /endDate: String\(value\.endDate \|\| value\.startDate \|\| ''\)/)
  assert.match(source, /store\.state\.academicReady = true/)
})