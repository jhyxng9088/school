from pathlib import Path

path = Path('src/main.jsx')
text = path.read_text()

def replace_once(old, new):
    global text
    if old not in text:
        raise SystemExit(f'anchor missing: {old[:120]!r}')
    text = text.replace(old, new, 1)

replace_once(
"""    if (timetableItems.length) {
      const nextOverrides = { ...overrides }
      const applied = []
      const activities = []
""",
"""    if (timetableItems.length) {
      const movingClass = Number(profile?.classNumber) >= 7 && Number(profile?.classNumber) <= 15
      const sourceOverrides = movingClass ? personalOverrides : overrides
      const nextOverrides = { ...sourceOverrides }
      const applied = []
      const activities = []
""",
)

replace_once(
"""          const committed = await commitOverrides(nextOverrides)
          if (!committed) throw new Error('시간표 변경을 저장하지 못했어.')
          applied.forEach((item) => saved.push({ item, id: `${item.date}-${item.period}` }))
          recordClassActivities(profile, activities)
            .catch((error) => console.error('AI timetable attribution save failed:', error))
""",
"""          const committed = movingClass
            ? await commitPersonalOverrides(nextOverrides)
            : await commitOverrides(nextOverrides)
          if (!committed) throw new Error('시간표 변경을 저장하지 못했어.')
          applied.forEach((item) => saved.push({ item, id: `${item.date}-${item.period}` }))
          if (!movingClass) recordClassActivities(profile, activities)
            .catch((error) => console.error('AI timetable attribution save failed:', error))
""",
)

replace_once(
"""  useEffect(() => {
    if (navigator.onLine === false) return
    const pruned = pruneExpiredOverrides(overrides, now)
    if (JSON.stringify(pruned) === JSON.stringify(overrides)) return
    commitOverrides(pruned)
  }, [now, overrides, commitOverrides])
""",
"""  useEffect(() => {
    if (navigator.onLine === false) return
    const pruned = pruneExpiredOverrides(sharedOverrides, now)
    if (JSON.stringify(pruned) === JSON.stringify(sharedOverrides)) return
    commitOverrides(pruned)
  }, [now, sharedOverrides, commitOverrides])

  useEffect(() => {
    const movingClass = Number(profile?.classNumber) >= 7 && Number(profile?.classNumber) <= 15
    if (!movingClass || navigator.onLine === false) return
    const pruned = pruneExpiredOverrides(personalOverrides, now)
    if (JSON.stringify(pruned) === JSON.stringify(personalOverrides)) return
    commitPersonalOverrides(pruned)
  }, [now, profile?.classNumber, personalOverrides, commitPersonalOverrides])
""",
)

path.write_text(text)
