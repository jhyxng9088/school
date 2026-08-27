from pathlib import Path

p = Path('src/todo.jsx')
t = p.read_text()

old = """function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY
  const expiry = Date.parse(`${dueDate}T23:59:59.000+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}
"""

new = """function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = String(todo?.dueTime || '').trim()
  const expiryTime = /^([01]\\d|2[0-3]):[0-5]\\d$/.test(dueTime)
    ? `${dueTime}:00.000`
    : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}
"""

if new in t:
    print('Reminder due-time expiry is already applied')
    raise SystemExit(0)

count = t.count(old)
if count != 1:
    raise SystemExit(f'todoExpiryMs: expected 1 old marker, found {count}')

t = t.replace(old, new, 1)
p.write_text(t.rstrip() + '\n')
print('Reminder expiry now respects dueTime; date-only reminders still expire at end of day')
