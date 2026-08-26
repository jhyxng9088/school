from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 marker, found {count}')
    return text.replace(old, new, 1)


# Reminder manual date/time inputs use isolated visual shells, matching the timetable fix.
p = 'src/todo-stage5-ai.jsx'
t = read(p)
old = '''              <div className="todo-due-grid">
                <label className="change-field">
                  <span>마감일</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  />
                </label>
                <label className="change-field todo-time-field">
                  <span>시간 · 선택</span>
                  <input
                    type="time"
                    value={draft.dueTime}
                    onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                  />
                </label>
              </div>'''
new = '''              <div className="todo-due-grid">
                <label className="change-field todo-date-field">
                  <span>마감일</span>
                  <span className="todo-control-shell todo-date-shell">
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </span>
                </label>
                <label className="change-field todo-time-field">
                  <span>시간 · 선택</span>
                  <span className="todo-control-shell todo-time-shell">
                    <input
                      type="time"
                      value={draft.dueTime}
                      onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                    />
                  </span>
                </label>
              </div>'''
t = replace_once(t, old, new, 'reminder due controls markup')
write(p, t)


# Reminder shell owns geometry; native date/time controls no longer own border/radius/width.
p = 'src/todo.css'
t = read(p)
old_css = '''.todo-due-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr);
  gap: 10px;
  min-width: 0;
}

.todo-due-grid > .change-field,
.todo-time-field,
.todo-time-field input[type="time"],
.todo-due-grid input[type="date"] {
  min-width: 0;
  max-width: 100%;
}'''
new_css = '''.todo-due-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(132px, .75fr);
  gap: 10px;
  min-width: 0;
  align-items: end;
}

.todo-due-grid > .change-field,
.todo-date-field,
.todo-time-field {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  justify-self: stretch;
}

.todo-sheet .todo-control-shell {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  height: 50px;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface-soft);
}

.todo-sheet .todo-control-shell:focus-within {
  border-color: color-mix(in srgb, var(--text) 24%, var(--border));
}

.todo-sheet .todo-control-shell > input[type="date"],
.todo-sheet .todo-control-shell > input[type="time"] {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  max-width: none;
  margin: 0;
  padding: 0 14px;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  outline: 0;
  overflow: visible;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.todo-sheet .todo-control-shell > input[type="date"]:focus,
.todo-sheet .todo-control-shell > input[type="time"]:focus {
  border: 0;
  outline: 0;
}

@media (max-width: 430px) {
  .todo-due-grid {
    grid-template-columns: minmax(0, 1fr) 112px;
    gap: 9px;
  }
}'''
t = replace_once(t, old_css, new_css, 'reminder due controls css')
write(p, t)


# Center the timetable date text in all engines, including WebKit native date internals.
p = 'src/timetable.css'
t = read(p)
marker = '''body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > input:focus,
body .unified-school-sheet.timetable-unified-sheet .timetable-control-shell > select:focus {
  border: 0 !important;
  outline: 0 !important;
}
'''
if marker not in t:
    raise SystemExit('timetable control focus marker missing')
center_css = '''
body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"] {
  text-align: center !important;
  text-align-last: center !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-date-and-time-value {
  width: 100% !important;
  min-width: 0 !important;
  text-align: center !important;
}

body .unified-school-sheet.timetable-unified-sheet .timetable-date-shell > input[type="date"]::-webkit-datetime-edit {
  display: flex !important;
  justify-content: center !important;
  width: 100% !important;
  padding: 0 !important;
  text-align: center !important;
}
'''
t = t.replace(marker, marker + center_css, 1)
write(p, t)

print('v106 native date/time control patch applied')
