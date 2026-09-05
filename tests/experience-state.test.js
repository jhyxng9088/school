import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPERIENCE_PRIMARY,
  EXPERIENCE_UI,
  INITIAL_EXPERIENCE_STATE,
  ExperienceStateOwner,
  classifyAcademicDayOff,
  deriveExperienceState,
  mapExperienceStateToUI,
} from '../src/experience-state.js'
import {
  createDefaultWeeklySchedule,
  getSchoolState,
} from '../src/timetable.js'

const monday = (hour, minute = 0) => new Date(2026, 8, 7, hour, minute, 0, 0)
const saturday = new Date(2026, 8, 5, 11, 0, 0, 0)
const classState = {
  kind: 'class',
  configured: true,
  current: { number: 2, subject: '정보', start: '10:10', end: '11:00' },
  next: { number: 3, subject: '역학', start: '11:10', end: '12:00' },
}

test('unit 1: initial state and every primary state have a stable UI mapping', () => {
  assert.equal(INITIAL_EXPERIENCE_STATE.primary, EXPERIENCE_PRIMARY.INITIALIZING)
  assert.equal(INITIAL_EXPERIENCE_STATE.secondary, null)
  for (const primary of Object.values(EXPERIENCE_PRIMARY)) {
    assert.ok(EXPERIENCE_UI[primary], `missing UI mapping for ${primary}`)
  }
  assert.deepEqual(mapExperienceStateToUI({ primary: EXPERIENCE_PRIMARY.CLASS }), EXPERIENCE_UI.CLASS)
})

test('unit 2: canonical timetable kinds map to before/class/break/lunch/after-school without reimplementing clock logic', () => {
  const cases = [
    ['before', EXPERIENCE_PRIMARY.BEFORE_SCHOOL],
    ['class', EXPERIENCE_PRIMARY.CLASS],
    ['break', EXPERIENCE_PRIMARY.BREAK],
    ['lunch', EXPERIENCE_PRIMARY.LUNCH],
    ['done', EXPERIENCE_PRIMARY.AFTER_SCHOOL],
  ]

  for (const [kind, expected] of cases) {
    const state = deriveExperienceState({ now: monday(10, 20), timetable: { ...classState, kind } })
    assert.equal(state.primary, expected)
    assert.equal(state.context.timetableKind, kind)
  }
})

test('unit 3: weekend wins over a stale class snapshot', () => {
  const state = deriveExperienceState({ now: saturday, timetable: classState })
  assert.equal(state.primary, EXPERIENCE_PRIMARY.WEEKEND)
  assert.equal(state.context.reason, 'weekend')
})

test('unit 4: public holiday from canonical academic events wins over a stale class snapshot', () => {
  const academic = {
    events: [{
      rawDate: '20260907',
      name: '대체공휴일',
      content: '',
      dayOffType: '휴업일',
    }],
  }
  const dayOff = classifyAcademicDayOff(monday(10, 20), academic.events)
  const state = deriveExperienceState({ now: monday(10, 20), timetable: classState, academic })

  assert.equal(dayOff?.type, 'holiday')
  assert.equal(state.primary, EXPERIENCE_PRIMARY.HOLIDAY)
  assert.equal(state.context.reason, 'holiday')
  assert.equal(state.context.dayOff?.event?.name, '대체공휴일')
})

test('unit 5: discretionary school closure is distinguished from a public holiday', () => {
  const academic = {
    events: [{
      rawDate: '20260907',
      name: '학교장 재량휴업일',
      content: '',
      dayOffType: '휴업일',
    }],
  }
  const state = deriveExperienceState({ now: monday(10, 20), timetable: classState, academic })

  assert.equal(state.primary, EXPERIENCE_PRIMARY.HOLIDAY)
  assert.equal(state.context.reason, 'discretionary')
  assert.equal(state.context.dayOff?.type, 'discretionary')
})

test('unit 6: an unconfigured canonical timetable becomes no-timetable state', () => {
  const state = deriveExperienceState({
    now: monday(8, 30),
    timetable: { kind: 'unconfigured', configured: false, current: null, next: null },
  })
  assert.equal(state.primary, EXPERIENCE_PRIMARY.NO_TIMETABLE)
  assert.equal(state.context.reason, 'no-timetable')
})

test('unit 7: active Study becomes primary while class remains secondary context', () => {
  const state = deriveExperienceState({
    now: monday(10, 20),
    timetable: classState,
    study: { active: true, session: { id: 'study-1' } },
  })
  assert.equal(state.primary, EXPERIENCE_PRIMARY.STUDY)
  assert.equal(state.secondary, EXPERIENCE_PRIMARY.CLASS)
  assert.equal(state.context.reason, 'study-active')
})

test('unit 8: urgent reminder has highest priority and offline is still explicit when no higher-priority activity exists', () => {
  const offline = deriveExperienceState({
    now: monday(10, 20),
    timetable: classState,
    network: { online: false },
  })
  assert.equal(offline.primary, EXPERIENCE_PRIMARY.OFFLINE)
  assert.equal(offline.secondary, EXPERIENCE_PRIMARY.CLASS)
  assert.equal(offline.context.online, false)

  const urgent = deriveExperienceState({
    now: monday(10, 20),
    timetable: classState,
    reminder: { urgentReminder: { id: 'todo-1', title: '오늘 제출' } },
    study: { active: true },
    network: { online: false },
  })
  assert.equal(urgent.primary, EXPERIENCE_PRIMARY.URGENT_REMINDER)
  assert.equal(urgent.secondary, EXPERIENCE_PRIMARY.STUDY)
  assert.equal(urgent.context.urgentReminder.id, 'todo-1')
})

test('integration 1: ExperienceStateOwner consumes getSchoolState output as the timetable owner snapshot', () => {
  const weeklySchedule = createDefaultWeeklySchedule()
  const now = monday(10, 20)
  const timetable = getSchoolState(now, weeklySchedule, {})
  const state = ExperienceStateOwner({ now, timetableState: timetable })

  assert.equal(timetable.kind, 'class')
  assert.equal(state.primary, EXPERIENCE_PRIMARY.CLASS)
  assert.equal(state.context.currentPeriod?.number, 2)
})

test('integration 2: canonical NEIS academic shape overrides getSchoolState for holiday and discretionary-day smoke scenarios', () => {
  const weeklySchedule = createDefaultWeeklySchedule()
  const now = monday(10, 20)
  const timetable = getSchoolState(now, weeklySchedule, {})
  assert.equal(timetable.kind, 'class')

  const holiday = ExperienceStateOwner({
    now,
    timetableState: timetable,
    schoolData: { academicEvents: [{ rawDate: '20260907', name: '대체공휴일', dayOffType: '휴업일' }] },
  })
  const discretionary = ExperienceStateOwner({
    now,
    timetableState: timetable,
    schoolData: { academicEvents: [{ rawDate: '20260907', name: '학교장 재량휴업일', dayOffType: '휴업일' }] },
  })

  assert.equal(holiday.primary, EXPERIENCE_PRIMARY.HOLIDAY)
  assert.equal(holiday.context.reason, 'holiday')
  assert.equal(discretionary.primary, EXPERIENCE_PRIMARY.HOLIDAY)
  assert.equal(discretionary.context.reason, 'discretionary')
})
