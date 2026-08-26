import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, value) { fs.writeFileSync(path, value) }
function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return value.slice(0, first) + to + value.slice(first + from.length)
}

{
  const path = 'src/main.jsx'
  let value = read(path)
  value = replaceOnce(value,
`  function saveBaseSchedule() {
    onSaveWeekly(draft)
    recordClassActivity(profile, 'timetable', 'weekly', 'edited')
      .catch((error) => console.error('Timetable attribution save failed:', error))
    setEditing(false)
  }`,
`  function saveBaseSchedule() {
    const changedCells = WEEKDAYS.flatMap((day) =>
      getPeriodsForDay(day.id)
        .filter((period) => String(weeklySchedule?.[day.id]?.[period.number] || '').trim() !== String(draft?.[day.id]?.[period.number] || '').trim())
        .map((period) => ({ dayId: day.id, period: period.number })),
    )
    onSaveWeekly(draft)
    recordClassActivity(profile, 'timetable', 'weekly', 'edited')
      .catch((error) => console.error('Timetable attribution save failed:', error))
    changedCells.forEach(({ dayId, period }) => {
      recordClassActivity(profile, 'timetable', 'base-' + dayId + '-' + period, 'edited')
        .catch((error) => console.error('Timetable cell attribution save failed:', error))
    })
    setEditing(false)
  }`,
  'base timetable attribution')

  value = replaceOnce(value,
`                const item = daySchedule.find((entry) => entry.number === period.number)
                const isToday = dateKey(date) === todayKey`,
`                const item = daySchedule.find((entry) => entry.number === period.number)
                const cellActivity = item?.isOverride
                  ? activity?.[activityKey('timetable', dateKey(date) + '-' + period.number)] || null
                  : activity?.[activityKey('timetable', 'base-' + day.id + '-' + period.number)] || null
                const isToday = dateKey(date) === todayKey`,
  'timetable cell activity lookup')

  value = replaceOnce(value,
`                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                  </div>`,
`                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                    {cellActivity ? <small className="activity-attribution week-cell-attribution">{activityLabel(cellActivity)}</small> : null}
                  </div>`,
  'timetable cell attribution render')
  write(path, value)
}

{
  const path = 'src/timetable.css'
  let value = read(path)
  const anchor = `.week-cell.empty .subject {
  color: var(--text-tertiary);
  font-weight: 550;
}
`
  const addition = `${anchor}
.week-cell-attribution {
  width: 100%;
  margin-top: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: clamp(6.5px, 1.7vw, 8px);
  font-weight: 560;
  line-height: 1.1;
  letter-spacing: -0.04em;
  opacity: 0.7;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`
  value = replaceOnce(value, anchor, addition, 'timetable attribution css')
  write(path, value)
}

{
  const path = 'public/first-run-notice.js'
  let value = read(path)
  const from = '<a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer">@j.hyxng</a>'
  const to = '<a href="${INSTAGRAM_URL}">@j.hyxng</a>'
  value = replaceOnce(value, from, to, 'instagram universal link')
  write(path, value)
}

{
  const path = 'public/sw.js'
  let value = read(path)
  value = replaceOnce(value, `const CACHE_NAME = 'school-shell-v75'`, `const CACHE_NAME = 'school-shell-v76'`, 'service worker cache')
  write(path, value)
}

// Static runtime guards that bundling alone cannot catch.
{
  const main = read('src/main.jsx')
  if (!main.includes('function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData })')) throw new Error('Home academicData parameter missing')
  if (!main.includes('academicData={academicData}')) throw new Error('Home academicData prop missing')
  if (!main.includes('week-cell-attribution')) throw new Error('Timetable cell attribution missing')
  const academic = read('src/academic-shared.jsx')
  if (!academic.includes('creatorStudentKey === academicData.studentKey')) throw new Error('Academic creator delete guard missing')
  const notice = read('public/first-run-notice.js')
  if (!notice.includes('@j.hyxng')) throw new Error('Contact notice missing')
  const summary = read('src/reminder-summary.css')
  if (!summary.includes('reminder-quiet-dots') || !summary.includes('reminder-original-viewer.is-closing')) throw new Error('Reminder motion guards missing')
}

console.log('final collaboration hardening applied')
