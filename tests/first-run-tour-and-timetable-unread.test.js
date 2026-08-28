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

test('timetable unread dot ignores historical and stale override activity', () => {
  const source = read('src/unread-indicators-v2.js')

  assert.match(source, /timetableOverrides: \{\}/)
  assert.match(source, /timetableReady: false/)
  assert.match(source, /function timetableActivityStillRelevant\(activity\)/)
  assert.match(source, /date < todayDateKey\(\)/)
  assert.match(source, /state\.timetableOverrides\?\.\[date\]/)
  assert.match(source, /function ensureTimetableBaseline\(\)/)
  assert.match(source, /seenVersion\(NAV_STATE_IDS\.timetable\) > 0/)
  assert.match(source, /!state\.activityReady \|\| !state\.seenReady \|\| !state\.timetableReady/)
  assert.match(source, /doc\(db, 'classes', classId, 'settings', 'timetable'\)/)
})

test('reminder unread baseline waits for the real reminder snapshot and repairs the old baseline generation', () => {
  const source = read('src/unread-indicators-v2.js')

  assert.match(source, /reminder_rows_v3/)
  assert.match(source, /todosReady: false/)
  assert.match(source, /!state\.activityReady \|\| !state\.seenReady \|\| !state\.todosReady/)
  assert.match(source, /function ensureReminderBaseline\(\)/)
  assert.match(source, /state\.todosReady = true/)
  assert.match(source, /state\.todosReady = false/)
})

test('academic unread dot establishes a fresh baseline and ignores finished schedules', () => {
  const source = read('src/unread-indicators-v2.js')

  assert.match(source, /academic_v2/)
  assert.match(source, /academicReady: false/)
  assert.match(source, /function academicEventStillRelevant\(value\)/)
  assert.match(source, /endDate >= todayDateKey\(\)/)
  assert.match(source, /function ensureAcademicBaseline\(\)/)
  assert.match(source, /Math\.max\(seenVersion\(NAV_STATE_IDS\.academic\), seenVersion\(ACADEMIC_BASELINE_ID\)\)/)
  assert.match(source, /startDate: String\(value\.startDate \|\| ''\)/)
  assert.match(source, /endDate: String\(value\.endDate \|\| value\.startDate \|\| ''\)/)
  assert.match(source, /state\.academicReady = true/)
})
