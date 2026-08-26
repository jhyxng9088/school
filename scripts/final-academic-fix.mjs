import fs from 'node:fs'

function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return value.slice(0, first) + to + value.slice(first + from.length)
}

{
  const path = 'src/todo-stage5-ai.jsx'
  let value = fs.readFileSync(path, 'utf8')
  value = replaceOnce(value,
    'placeholder="예: 담주 화욜까지 영어 수헹 PPT"',
    'placeholder="예: 다음 주 화요일까지 영어 수행 PPT"',
    'natural reminder example typo')

  value = replaceOnce(value,
`              ) : attachmentFile ? null : (\n                <div className="reminder-natural-hint">\n                  <span>“내일 체육복 챙기기”</span>\n                  <span>“9월 2일 모의고사”</span>\n                  <span>“담주 화욜 영어 수헹 PPT”</span>\n                </div>\n              )}\n`,
`              ) : null}\n`,
    'extra reminder examples')

  value = replaceOnce(value,
    'placeholder="예: 영어 수행평가 PPT"',
    'placeholder="제목 입력"',
    'manual reminder example')
  fs.writeFileSync(path, value)
}

{
  const path = 'public/sw.js'
  let value = fs.readFileSync(path, 'utf8')
  value = replaceOnce(value, "const CACHE_NAME = 'school-shell-v78'", "const CACHE_NAME = 'school-shell-v79'", 'service worker cache')
  fs.writeFileSync(path, value)
}

const reminder = fs.readFileSync('src/todo-stage5-ai.jsx', 'utf8')
if ((reminder.match(/예:/g) || []).length !== 1) {
  throw new Error('Reminder editor must contain exactly one visible example')
}

const academic = fs.readFileSync('src/academic-shared.jsx', 'utf8')
for (const required of [
  'academic-sheet-backdrop',
  'academic-date-display',
  'academicData.saveEvent(draft)',
  'academicData.deleteEvent(draft.id)',
  'lastEditedByName',
]) {
  if (!academic.includes(required)) throw new Error(`Academic guard missing: ${required}`)
}

const sheet = fs.readFileSync('public/school-sheet.js', 'utf8')
if (!sheet.includes("const SHEET_SELECTOR = '.timetable-page .change-editor'")) {
  throw new Error('Timetable sheet manager is not isolated')
}
