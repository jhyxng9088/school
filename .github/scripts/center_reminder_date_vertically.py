from pathlib import Path

path = Path('src/todo-stage5.css')
text = path.read_text()
old_actions = '''.todo-stage5 .todo-row-actions {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
  padding: 0 16px 0 10px;
  white-space: nowrap;
}
'''
new_actions = '''.todo-stage5 .todo-row-actions {
  grid-column: 3;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
  padding: 0 16px 0 10px;
  white-space: nowrap;
}
'''
old_date = '''.todo-stage5 .todo-date-text {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: -0.015em;
  font-variant-numeric: tabular-nums;
}
'''
new_date = '''.todo-stage5 .todo-date-text {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: -0.015em;
  font-variant-numeric: tabular-nums;
}
'''
if text.count(old_actions) != 1:
    raise SystemExit(f'Expected one todo-row-actions block, found {text.count(old_actions)}')
if text.count(old_date) != 1:
    raise SystemExit(f'Expected one todo-date-text block, found {text.count(old_date)}')
text = text.replace(old_actions, new_actions, 1).replace(old_date, new_date, 1)
path.write_text(text.rstrip() + '\n')
print('Centered reminder date text vertically without changing row geometry')
