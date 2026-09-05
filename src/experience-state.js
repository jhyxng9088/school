const PRIMARY = {
  INITIALIZING: 'INITIALIZING',
  BEFORE_SCHOOL: 'BEFORE_SCHOOL',
  CLASS: 'CLASS',
  BREAK: 'BREAK',
  LUNCH: 'LUNCH',
  AFTER_SCHOOL: 'AFTER_SCHOOL',
  WEEKEND: 'WEEKEND',
  HOLIDAY: 'HOLIDAY',
  NO_TIMETABLE: 'NO_TIMETABLE',
  STUDY: 'STUDY',
  URGENT_REMINDER: 'URGENT_REMINDER',
  OFFLINE: 'OFFLINE',
}

export const EXPERIENCE_PRIMARY = Object.freeze(PRIMARY)

export const EXPERIENCE_UI = Object.freeze({
  [PRIMARY.INITIALIZING]: Object.freeze({ label: '준비 중', tone: 'neutral', surface: 'status' }),
  [PRIMARY.BEFORE_SCHOOL]: Object.freeze({ label: '등교 전', tone: 'calm', surface: 'school' }),
  [PRIMARY.CLASS]: Object.freeze({ label: '수업 중', tone: 'focus', surface: 'school' }),
  [PRIMARY.BREAK]: Object.freeze({ label: '쉬는 시간', tone: 'calm', surface: 'school' }),
  [PRIMARY.LUNCH]: Object.freeze({ label: '점심시간', tone: 'meal', surface: 'school' }),
  [PRIMARY.AFTER_SCHOOL]: Object.freeze({ label: '수업 종료', tone: 'calm', surface: 'school' }),
  [PRIMARY.WEEKEND]: Object.freeze({ label: '주말', tone: 'rest', surface: 'day-off' }),
  [PRIMARY.HOLIDAY]: Object.freeze({ label: '휴일', tone: 'rest', surface: 'day-off' }),
  [PRIMARY.NO_TIMETABLE]: Object.freeze({ label: '시간표 없음', tone: 'neutral', surface: 'school' }),
  [PRIMARY.STUDY]: Object.freeze({ label: '공부 중', tone: 'focus', surface: 'study' }),
  [PRIMARY.URGENT_REMINDER]: Object.freeze({ label: '긴급 리마인더', tone: 'urgent', surface: 'reminder' }),
  [PRIMARY.OFFLINE]: Object.freeze({ label: '오프라인', tone: 'offline', surface: 'status' }),
})

export const INITIAL_EXPERIENCE_STATE = Object.freeze({
  primary: PRIMARY.INITIALIZING,
  secondary: null,
  context: Object.freeze({
    reason: 'initializing',
    online: true,
    dayOff: null,
    timetableKind: null,
    currentPeriod: null,
    nextPeriod: null,
    urgentReminder: null,
    study: null,
    meal: null,
    presence: null,
    board: null,
  }),
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function eventDateKey(event) {
  const raw = String(event?.rawDate || '').trim()
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  const date = event?.date
  if (date instanceof Date) return localDateKey(date)
  const start = String(event?.startDate || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : ''
}

const DISCRETIONARY_DAY = /재량\s*휴업|재량휴업|학교장\s*재량|학교\s*재량/
const PUBLIC_HOLIDAY = /공휴일|대체\s*공휴|대체공휴|삼일절|3[·.\s-]*1절|어린이날|부처님\s*오신\s*날|석가탄신일|현충일|광복절|개천절|한글날|추석|설날|성탄절|크리스마스|신정/
const DAY_OFF_TYPE = /휴업|공휴/

export function classifyAcademicDayOff(now, academicEvents = []) {
  const today = localDateKey(now)
  if (!today) return null

  const todayEvents = (Array.isArray(academicEvents) ? academicEvents : [])
    .filter((event) => eventDateKey(event) === today)

  const classified = todayEvents.map((event) => {
    const name = String(event?.name || event?.title || '').trim()
    const dayOffType = String(event?.dayOffType || '').trim()
    const text = `${name} ${dayOffType}`.trim()
    if (DISCRETIONARY_DAY.test(text)) return { type: 'discretionary', event }
    if (PUBLIC_HOLIDAY.test(text)) return { type: 'holiday', event }
    if (DAY_OFF_TYPE.test(dayOffType) && !/토요휴업/.test(name)) return { type: 'holiday', event }
    return null
  }).filter(Boolean)

  return classified.find((item) => item.type === 'discretionary')
    || classified.find((item) => item.type === 'holiday')
    || null
}

function temporalState(now, timetable, academicEvents) {
  const dayOff = classifyAcademicDayOff(now, academicEvents)
  if (dayOff) {
    return {
      primary: PRIMARY.HOLIDAY,
      reason: dayOff.type,
      dayOff,
    }
  }

  if (now instanceof Date && (now.getDay() === 0 || now.getDay() === 6)) {
    return {
      primary: PRIMARY.WEEKEND,
      reason: 'weekend',
      dayOff: null,
    }
  }

  switch (timetable?.kind) {
    case 'before':
      return { primary: PRIMARY.BEFORE_SCHOOL, reason: 'before-school', dayOff: null }
    case 'class':
      return { primary: PRIMARY.CLASS, reason: 'class-active', dayOff: null }
    case 'break':
      return { primary: PRIMARY.BREAK, reason: 'break', dayOff: null }
    case 'lunch':
      return { primary: PRIMARY.LUNCH, reason: 'lunch', dayOff: null }
    case 'done':
      return { primary: PRIMARY.AFTER_SCHOOL, reason: 'after-school', dayOff: null }
    case 'unconfigured':
      return { primary: PRIMARY.NO_TIMETABLE, reason: 'no-timetable', dayOff: null }
    case 'off':
      return { primary: PRIMARY.WEEKEND, reason: 'weekend', dayOff: null }
    default:
      return { primary: PRIMARY.NO_TIMETABLE, reason: 'no-timetable', dayOff: null }
  }
}

function urgentReminderFrom(reminder) {
  if (reminder?.urgentReminder) return reminder.urgentReminder
  const items = Array.isArray(reminder?.items) ? reminder.items : []
  return items.find((item) => item?.urgent === true || item?.isUrgent === true || item?.urgency === 'urgent') || null
}

function studyIsActive(study) {
  return Boolean(study?.active === true || study?.isActive === true || study?.session?.active === true)
}

export function deriveExperienceState({
  now = new Date(),
  timetable = null,
  reminder = null,
  academic = null,
  meal = null,
  presence = null,
  board = null,
  study = null,
  network = null,
} = {}) {
  const academicEvents = Array.isArray(academic)
    ? academic
    : Array.isArray(academic?.events)
      ? academic.events
      : []

  const base = temporalState(now, timetable, academicEvents)
  const urgentReminder = urgentReminderFrom(reminder)
  const activeStudy = studyIsActive(study)
  const online = network?.online !== false

  let primary = base.primary
  let secondary = null
  let reason = base.reason

  if (!online) {
    primary = PRIMARY.OFFLINE
    secondary = base.primary
    reason = 'offline'
  }
  if (activeStudy) {
    primary = PRIMARY.STUDY
    secondary = base.primary
    reason = 'study-active'
  }
  if (urgentReminder) {
    primary = PRIMARY.URGENT_REMINDER
    secondary = activeStudy ? PRIMARY.STUDY : base.primary
    reason = 'urgent-reminder'
  }

  return {
    primary,
    secondary,
    context: {
      reason,
      online,
      dayOff: base.dayOff,
      timetableKind: timetable?.kind || null,
      currentPeriod: timetable?.current || null,
      nextPeriod: timetable?.next || null,
      urgentReminder,
      study: study || null,
      meal: meal || null,
      presence: presence || null,
      board: board || null,
    },
  }
}


export function experienceSourcesFromCanonicalOwners({
  now = new Date(),
  timetableState = null,
  todoData = null,
  schoolData = null,
  presence = null,
  boardData = null,
  studyData = null,
  online = true,
} = {}) {
  return {
    now,
    timetable: timetableState,
    reminder: {
      urgentReminder: todoData?.urgentReminder || null,
      items: Array.isArray(todoData?.todos) ? todoData.todos : [],
    },
    academic: {
      events: Array.isArray(schoolData?.academicEvents) ? schoolData.academicEvents : [],
    },
    meal: schoolData || null,
    presence,
    board: boardData,
    study: studyData,
    network: { online },
  }
}

export function mapExperienceStateToUI(state = INITIAL_EXPERIENCE_STATE) {
  return EXPERIENCE_UI[state?.primary] || EXPERIENCE_UI[PRIMARY.INITIALIZING]
}

export function ExperienceStateOwner(owners = {}) {
  const canonicalShape = Object.prototype.hasOwnProperty.call(owners, 'timetableState')
    || Object.prototype.hasOwnProperty.call(owners, 'todoData')
    || Object.prototype.hasOwnProperty.call(owners, 'schoolData')
    || Object.prototype.hasOwnProperty.call(owners, 'boardData')
    || Object.prototype.hasOwnProperty.call(owners, 'studyData')
  return deriveExperienceState(canonicalShape ? experienceSourcesFromCanonicalOwners(owners) : owners)
}
