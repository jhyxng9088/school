from pathlib import Path

path = Path('src/main.jsx')
text = path.read_text()
old = "                    {cellActivity ? <small className=\"activity-attribution week-cell-attribution\">{activityLabel(cellActivity)}</small> : null}\n"
if text.count(old) != 1:
    raise SystemExit(f'Expected exactly one timetable cell attribution render, found {text.count(old)}')
text = text.replace(old, '', 1)
path.write_text(text.rstrip() + '\n')
print('Removed only per-cell timetable attribution rendering')
