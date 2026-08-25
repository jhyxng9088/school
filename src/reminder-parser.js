const WEEKDAY_INDEX = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

function addDays(date, days) {
  const next = dayStart(date)
  next.setDate(next.getDate() + days)
  return next
}

function key(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mondayOfWeek(date) {
  const base = dayStart(date)
  const jsDay = base.getDay()
  return addDays(base, jsDay === 0 ? -6 : 1 - jsDay)
}

function validCalendarDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function futureMonthDay(now, month, day, explicitYear = null) {
  if (explicitYear) return validCalendarDate(explicitYear, month, day)
  let date = validCalendarDate(now.getFullYear(), month, day)
  if (!date) return null
  if (dayStart(date) < dayStart(now)) date = validCalendarDate(now.getFullYear() + 1, month, day)
  return date
}

function resolveDate(text, now) {
  const relative = [
    { regex: /(오늘)(?:까지|에)?/, days: 0, source: '오늘' },
    { regex: /(내일)(?:까지|에)?/, days: 1, source: '내일' },
    { regex: /(모레)(?:까지|에)?/, days: 2, source: '모레' },
    { regex: /(글피)(?:까지|에)?/, days: 3, source: '글피' },
  ]

  for (const item of relative) {
    const match = text.match(item.regex)
    if (match) {
      return {
        date: addDays(now, item.days),
        matched: match[0],
        source: item.source,
        assumed: false,
      }
    }
  }

  let match = text.match(/(다음\s*주)\s*([월화수목금토일])(?:요일)?(?:까지|에)?/)
  if (match) {
    const monday = addDays(mondayOfWeek(now), 7)
    const weekday = WEEKDAY_INDEX[match[2]]
    const offset = weekday === 0 ? 6 : weekday - 1
    return { date: addDays(monday, offset), matched: match[0], source: '다음 주', assumed: false }
  }

  match = text.match(/(이번\s*주)\s*([월화수목금토일])(?:요일)?(?:까지|에)?/)
  if (match) {
    const monday = mondayOfWeek(now)
    const weekday = WEEKDAY_INDEX[match[2]]
    const offset = weekday === 0 ? 6 : weekday - 1
    let date = addDays(monday, offset)
    if (date < dayStart(now)) date = addDays(date, 7)
    return { date, matched: match[0], source: '이번 주', assumed: false }
  }

  match = text.match(/([월화수목금토일])(?:요일)(?:까지|에)?/)
  if (match) {
    const target = WEEKDAY_INDEX[match[1]]
    const current = dayStart(now).getDay()
    const offset = (target - current + 7) % 7
    return {
      date: addDays(now, offset),
      matched: match[0],
      source: `${match[1]}요일`,
      assumed: false,
    }
  }

  match = text.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일(?:까지|에)?/)
  if (match) {
    const year = match[1] ? Number(match[1]) : null
    const date = futureMonthDay(now, Number(match[2]), Number(match[3]), year)
    if (date) return { date, matched: match[0], source: '날짜', assumed: false }
  }

  match = text.match(/(?:^|\s)(\d{1,2})\s*[/.]\s*(\d{1,2})(?:일)?(?:까지|에)?(?=\s|$)/)
  if (match) {
    const date = futureMonthDay(now, Number(match[1]), Number(match[2]))
    if (date) return { date, matched: match[0].trim(), source: '날짜', assumed: false }
  }

  return {
    date: dayStart(now),
    matched: '',
    source: '오늘',
    assumed: true,
  }
}

function normalizeTime(hour, minute, period = '') {
  let h = Number(hour)
  const m = Number(minute || 0)
  if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59) return ''

  if (period === '오전') {
    if (h < 1 || h > 12) return ''
    if (h === 12) h = 0
  } else if (period === '오후') {
    if (h < 1 || h > 12) return ''
    if (h !== 12) h += 12
  } else if (h < 0 || h > 23) {
    return ''
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function resolveTime(text) {
  let match = text.match(/(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분|\s*(반))?/)
  if (match) {
    const minute = match[4] ? 30 : Number(match[3] || 0)
    const value = normalizeTime(match[2], minute, match[1])
    if (value) return { value, matched: match[0] }
  }

  match = text.match(/(?:^|\s)(\d{1,2})시(?:\s*(\d{1,2})분|\s*(반))?(?:까지|에)?/)
  if (match) {
    const minute = match[3] ? 30 : Number(match[2] || 0)
    const value = normalizeTime(match[1], minute)
    if (value) return { value, matched: match[0].trim() }
  }

  match = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:까지|에)?(?=\s|$)/)
  if (match) {
    const value = normalizeTime(match[1], match[2])
    if (value) return { value, matched: match[0].trim() }
  }

  return { value: '', matched: '' }
}

function resolveType(text) {
  if (/(모의고사|전국연합|평가원|수능|시험|고사|중간고사|기말고사)/.test(text)) return 'exam'
  if (/(수행평가|수행|발표|프레젠테이션|PPT|피피티)/i.test(text)) return 'performance'
  if (/(준비물|챙기기|챙겨|가져가기|가져와|지참)/.test(text)) return 'material'
  return 'task'
}

function cleanTitle(text, dateMatched, timeMatched) {
  let title = String(text || '').trim()
  for (const matched of [dateMatched, timeMatched]) {
    if (matched) title = title.replace(matched, ' ')
  }

  title = title
    .replace(/^\s*(까지|에)\s*/g, '')
    .replace(/\s+(까지|에)\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,·.\-\s]+|[,·.\-\s]+$/g, '')
    .trim()

  return title || String(text || '').trim()
}

export function parseReminderText(input, now = new Date()) {
  const text = String(input || '').trim()
  if (!text) return null

  const dateResult = resolveDate(text, now)
  const timeResult = resolveTime(text)
  const title = cleanTitle(text, dateResult.matched, timeResult.matched).slice(0, 80)

  return {
    type: resolveType(text),
    title,
    dueDate: key(dateResult.date),
    dueTime: timeResult.value,
    assumedDate: dateResult.assumed,
    dateSource: dateResult.source,
    originalText: text,
  }
}

export function formatParsedDue(result, now = new Date()) {
  if (!result?.dueDate) return ''
  const [year, month, day] = result.dueDate.split('-').map(Number)
  const target = validCalendarDate(year, month, day)
  if (!target) return result.dueDate

  const today = key(now)
  const tomorrow = key(addDays(now, 1))
  let dateLabel = `${month}월 ${day}일`
  if (result.dueDate === today) dateLabel = '오늘'
  else if (result.dueDate === tomorrow) dateLabel = '내일'

  if (!result.dueTime) return dateLabel
  const [hour, minute] = result.dueTime.split(':').map(Number)
  const period = hour < 12 ? '오전' : '오후'
  const displayHour = hour % 12 || 12
  return `${dateLabel} · ${period} ${displayHour}:${String(minute).padStart(2, '0')}`
}
