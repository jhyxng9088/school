from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 marker, found {count}')
    return text.replace(old, new, 1)


# Reminder: render our own centered visible value; keep native control transparent for picking.
p = 'src/todo-stage5-ai.jsx'
t = read(p)
helper_marker = "function parseDue(todo) {\n"
helpers = """function nativeDateDisplay(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${month}/${day}/${String(year).slice(-2)}`
}

function nativeTimeDisplay(value) {
  const [hourValue, minuteValue] = String(value || '').split(':').map(Number)
  if (!Number.isInteger(hourValue) || !Number.isInteger(minuteValue)) return ''
  const period = hourValue < 12 ? '오전' : '오후'
  const hour = hourValue % 12 || 12
  return `${period} ${hour}:${String(minuteValue).padStart(2, '0')}`
}

"""
if helper_marker not in t:
    raise SystemExit('todo helper insertion marker missing')
t = t.replace(helper_marker, helpers + helper_marker, 1)

date_old = '''                  <span className="todo-control-shell todo-date-shell">
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </span>'''
date_new = '''                  <span className="todo-control-shell todo-date-shell">
                    <span className="todo-native-control-value" aria-hidden="true">{nativeDateDisplay(draft.dueDate)}</span>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </span>'''
t = replace_once(t, date_old, date_new, 'todo date overlay')

time_old = '''                  <span className="todo-control-shell todo-time-shell">
                    <input
                      type="time"
                      value={draft.dueTime}
                      onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                    />
                  </span>'''
time_new = '''                  <span className="todo-control-shell todo-time-shell">
                    <span className="todo-native-control-value" aria-hidden="true">{nativeTimeDisplay(draft.dueTime)}</span>
                    <input
                      type="time"
                      value={draft.dueTime}
                      onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                    />
                  </span>'''
t = replace_once(t, time_old, time_new, 'todo time overlay')
write(p, t)

p = 'src/todo.css'
t = read(p)
css_marker = '.todo-sheet .todo-control-shell:focus-within {\n'
overlay_css = '''.todo-sheet .todo-native-control-value {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 0 12px;
  box-sizing: border-box;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}

'''
if css_marker not in t:
    raise SystemExit('todo control CSS marker missing')
t = t.replace(css_marker, overlay_css + css_marker, 1)
old_native = '''  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}'''
new_native = '''  z-index: 2;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: transparent;
  opacity: 0;
  font: inherit;
  font-size: 13px;
}'''
t = replace_once(t, old_native, new_native, 'todo transparent native controls')
write(p, t)


# Timetable: same mechanism for date only; period select stays native/visible.
p = 'src/main.jsx'
t = read(p)
helper_marker = 'function Icon({ type, size = 22 }) {'
helper = """function nativeDateDisplay(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${month}/${day}/${String(year).slice(-2)}`
}

"""
if helper_marker not in t:
    raise SystemExit('main date helper insertion marker missing')
t = t.replace(helper_marker, helper + helper_marker, 1)
main_date_old = '''              <span className="timetable-control-shell timetable-date-shell">
                <input
                  type="date"
                  value={changeDate}
                  min={todayKey}
                  onChange={(event) => {
                    setChangeDate(event.target.value)
                    setChangeSubject('')
                  }}
                />
              </span>'''
main_date_new = '''              <span className="timetable-control-shell timetable-date-shell">
                <span className="timetable-native-date-value" aria-hidden="true">{nativeDateDisplay(changeDate)}</span>
                <input
                  type="date"
                  value={changeDate}
                  min={todayKey}
                  onChange={(event) => {
                    setChangeDate(event.target.value)
                    setChangeSubject('')
                  }}
                />
              </span>'''
t = replace_once(t, main_date_old, main_date_new, 'timetable date overlay')
write(p, t)

p = 'src/timetable.css'
t = read(p)
css_marker = 'body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell:focus-within {\n'
overlay_css = '''body .unified-school-sheet.timetable-unified-sheet .timetable-native-date-value {
  position: absolute !important;
  z-index: 1 !important;
  inset: 0 !important;
  display: grid !important;
  place-items: center !important;
  min-width: 0 !important;
  padding: 0 12px !important;
  box-sizing: border-box !important;
  color: var(--text) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  text-align: center !important;
  white-space: nowrap !important;
  pointer-events: none !important;
}

'''
if css_marker not in t:
    raise SystemExit('timetable control CSS marker missing')
t = t.replace(css_marker, overlay_css + css_marker, 1)
# Only the date input becomes transparent. Keep the period select visible.
date_rule_marker = '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {
  padding-top: 0 !important;'''
if date_rule_marker not in t:
    raise SystemExit('timetable date rule marker missing')
t = t.replace(
    date_rule_marker,
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {
  z-index: 2 !important;
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  caret-color: transparent !important;
  opacity: 0 !important;
  padding-top: 0 !important;''',
    1,
)
write(p, t)

print('v108 native horizontal centering patch applied')
