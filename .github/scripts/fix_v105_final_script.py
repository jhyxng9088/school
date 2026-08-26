from pathlib import Path

p = Path('.github/scripts/apply_v105_final.py')
t = p.read_text()
old = """                  onChange={(event) => setChangePeriod(Number(event.target.value))
                  disabled={!selectedDay || !availablePeriods.length}"""
new = """                  onChange={(event) => setChangePeriod(Number(event.target.value))}
                  disabled={!selectedDay || !availablePeriods.length}"""
count = t.count(old)
if count != 1:
    raise SystemExit(f'Expected one broken period onChange marker, found {count}')
p.write_text(t.replace(old, new, 1).rstrip() + '\n')
print('v105 patch JSX marker fixed')
