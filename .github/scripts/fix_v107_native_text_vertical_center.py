from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')

# Reminder date/time controls: center Safari's internal native value vertically and horizontally.
p = 'src/todo.css'
t = read(p)
marker = '@media (max-width: 430px) {\n  .todo-due-grid {'
if marker not in t:
    raise SystemExit('todo media marker missing')
css = '''.todo-sheet .todo-control-shell > input[type="date"],
.todo-sheet .todo-control-shell > input[type="time"] {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 50px !important;
  text-align: center !important;
  text-align-last: center !important;
}

.todo-sheet .todo-control-shell > input[type="date"]::-webkit-date-and-time-value,
.todo-sheet .todo-control-shell > input[type="time"]::-webkit-date-and-time-value {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: normal !important;
  text-align: center !important;
}

.todo-sheet .todo-control-shell > input[type="date"]::-webkit-datetime-edit,
.todo-sheet .todo-control-shell > input[type="time"]::-webkit-datetime-edit,
.todo-sheet .todo-control-shell > input[type="date"]::-webkit-datetime-edit-fields-wrapper,
.todo-sheet .todo-control-shell > input[type="time"]::-webkit-datetime-edit-fields-wrapper {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: normal !important;
  text-align: center !important;
}

'''
if 'todo-control-shell > input[type="time"]::-webkit-date-and-time-value' not in t:
    t = t.replace(marker, css + marker, 1)
write(p, t)

# Timetable date control: same Safari-internal vertical centering, preserving the current shell geometry.
p = 'src/timetable.css'
t = read(p)
marker = 'body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {'
if marker not in t:
    raise SystemExit('timetable date marker missing')
# Strengthen existing date input block with vertical line box centering.
t = t.replace(
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {
  text-align: center !important;
  text-align-last: center !important;
}''',
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 46px !important;
  text-align: center !important;
  text-align-last: center !important;
}''',
    1,
)
t = t.replace(
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-date-and-time-value {
  width: 100% !important;
  min-width: 0 !important;
  text-align: center !important;
}''',
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-date-and-time-value {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: normal !important;
  text-align: center !important;
}''',
    1,
)
t = t.replace(
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-datetime-edit {
  display: flex !important;
  justify-content: center !important;
  width: 100% !important;
  padding: 0 !important;
  text-align: center !important;
}''',
    '''body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-datetime-edit,
body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-datetime-edit-fields-wrapper {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: normal !important;
  text-align: center !important;
}''',
    1,
)
write(p, t)

print('v107 native control text centering patch applied')
