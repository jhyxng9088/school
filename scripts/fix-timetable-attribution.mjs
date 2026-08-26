import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}

{
  const path = 'src/class-activity.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `  onSnapshot,\n  setDoc,\n} from 'firebase/firestore'`,
    `  onSnapshot,\n  setDoc,\n  writeBatch,\n} from 'firebase/firestore'`,
    'writeBatch import',
  )
  text = replaceOnce(
    text,
    `let authPromise = null\n`,
    `let authPromise = null\nconst identityPromises = new Map()\n`,
    'identity cache declaration',
  )
  const oldEnsure = `async function ensureIdentity(profile) {\n  const normalized = currentProfile(profile)\n  if (!normalized) throw new Error('학생 정보가 없어.')\n  const user = await ensureSignedIn()\n  const payload = {\n    classId: classKeyFor(normalized),\n    studentKey: studentKeyFor(normalized),\n    name: normalized.name,\n    updatedAt: Date.now(),\n  }\n  const ref = identityRef(user.uid)\n  const snapshot = await getDoc(ref)\n  await setDoc(ref, {\n    ...payload,\n    createdAt: snapshot.exists() ? Number(snapshot.data()?.createdAt || Date.now()) : Date.now(),\n  }, { merge: true })\n  return { ...payload, uid: user.uid, profile: normalized }\n}\n`
  const newEnsure = `async function ensureIdentity(profile) {\n  const normalized = currentProfile(profile)\n  if (!normalized) throw new Error('학생 정보가 없어.')\n  const user = await ensureSignedIn()\n  const cacheKey = \`${'${user.uid}'}|${'${profileSignature(normalized)}'}\`\n  if (identityPromises.has(cacheKey)) return identityPromises.get(cacheKey)\n\n  const pending = (async () => {\n    const payload = {\n      classId: classKeyFor(normalized),\n      studentKey: studentKeyFor(normalized),\n      name: normalized.name,\n      updatedAt: Date.now(),\n    }\n    const ref = identityRef(user.uid)\n    const snapshot = await getDoc(ref)\n    await setDoc(ref, {\n      ...payload,\n      createdAt: snapshot.exists() ? Number(snapshot.data()?.createdAt || Date.now()) : Date.now(),\n    }, { merge: true })\n    return { ...payload, uid: user.uid, profile: normalized }\n  })().catch((error) => {\n    identityPromises.delete(cacheKey)\n    throw error\n  })\n\n  identityPromises.set(cacheKey, pending)\n  return pending\n}\n`
  text = replaceOnce(text, oldEnsure, newEnsure, 'ensureIdentity')

  const oldRecord = `export async function recordClassActivity(profile, entityType, entityId, action = 'edited') {\n  const normalized = currentProfile(profile)\n  if (!normalized || !entityType || !entityId) return\n  const identity = await ensureIdentity(normalized)\n  await setDoc(activityRef(normalized, entityType, entityId), {\n    entityType: String(entityType).slice(0, 30),\n    entityId: String(entityId).slice(0, 120),\n    actorName: identity.profile.name,\n    actorStudentKey: identity.studentKey,\n    action: action === 'added' ? 'added' : 'edited',\n    updatedAt: Date.now(),\n  })\n}\n`
  const newRecord = `export async function recordClassActivities(profile, entries) {\n  const normalized = currentProfile(profile)\n  const items = Array.isArray(entries) ? entries.filter((entry) => entry?.entityType && entry?.entityId) : []\n  if (!normalized || !items.length) return\n\n  const identity = await ensureIdentity(normalized)\n  const batch = writeBatch(db)\n  const updatedAt = Date.now()\n\n  items.forEach((entry) => {\n    const entityType = String(entry.entityType).slice(0, 30)\n    const entityId = String(entry.entityId).slice(0, 120)\n    batch.set(activityRef(normalized, entityType, entityId), {\n      entityType,\n      entityId,\n      actorName: identity.profile.name,\n      actorStudentKey: identity.studentKey,\n      action: entry.action === 'added' ? 'added' : 'edited',\n      updatedAt,\n    })\n  })\n\n  await batch.commit()\n}\n\nexport function recordClassActivity(profile, entityType, entityId, action = 'edited') {\n  return recordClassActivities(profile, [{ entityType, entityId, action }])\n}\n`
  text = replaceOnce(text, oldRecord, newRecord, 'activity batching')
  fs.writeFileSync(path, text)
}

{
  const path = 'src/main.jsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `import { activityKey, activityLabel, recordClassActivity, useClassActivity, useSharedAcademic } from './class-activity'`,
    `import { activityKey, activityLabel, recordClassActivities, useClassActivity, useSharedAcademic } from './class-activity'`,
    'main activity import',
  )

  const oldSaveBase = `  function saveBaseSchedule() {\n    const changedCells = WEEKDAYS.flatMap((day) =>\n      getPeriodsForDay(day.id)\n        .filter((period) => String(weeklySchedule?.[day.id]?.[period.number] || '').trim() !== String(draft?.[day.id]?.[period.number] || '').trim())\n        .map((period) => ({ dayId: day.id, period: period.number })),\n    )\n    onSaveWeekly(draft)\n    recordClassActivity(profile, 'timetable', 'weekly', 'edited')\n      .catch((error) => console.error('Timetable attribution save failed:', error))\n    changedCells.forEach(({ dayId, period }) => {\n      recordClassActivity(profile, 'timetable', 'base-' + dayId + '-' + period, 'edited')\n        .catch((error) => console.error('Timetable cell attribution save failed:', error))\n    })\n    setEditing(false)\n  }\n`
  const newSaveBase = `  function saveBaseSchedule() {\n    const changedCells = WEEKDAYS.flatMap((day) =>\n      PERIODS\n        .filter((period) => period.number <= day.regularPeriodCount)\n        .filter((period) => String(weeklySchedule?.[day.id]?.[period.number] || '').trim() !== String(draft?.[day.id]?.[period.number] || '').trim())\n        .map((period) => ({ dayId: day.id, period: period.number })),\n    )\n\n    if (!changedCells.length) {\n      setEditing(false)\n      return\n    }\n\n    onSaveWeekly(draft)\n    recordClassActivities(profile, [\n      { entityType: 'timetable', entityId: 'weekly', action: 'edited' },\n      ...changedCells.map(({ dayId, period }) => ({\n        entityType: 'timetable',\n        entityId: 'base-' + dayId + '-' + period,\n        action: 'edited',\n      })),\n    ]).catch((error) => console.error('Timetable attribution save failed:', error))\n    setEditing(false)\n  }\n`
  text = replaceOnce(text, oldSaveBase, newSaveBase, 'base timetable save')

  text = replaceOnce(
    text,
    `    recordClassActivity(profile, 'timetable', \`${'${changeDate}-${changePeriod}'}\`, activityAction)\n      .catch((error) => console.error('Timetable change attribution save failed:', error))`,
    `    recordClassActivities(profile, [{\n      entityType: 'timetable',\n      entityId: \`${'${changeDate}-${changePeriod}'}\`,\n      action: activityAction,\n    }]).catch((error) => console.error('Timetable change attribution save failed:', error))`,
    'temporary timetable activity save',
  )

  const oldGrid = `              {WEEKDAYS.map((day, dayIndex) => {\n                if (period.number > day.periodCount) {\n                  return <div className="week-cell not-applicable" key={\`${'${day.id}-${period.number}'}\`}>—</div>\n                }\n\n                if (editing) {\n                  return (\n                    <div className="week-cell editor-cell" key={\`${'${day.id}-${period.number}'}\`}>\n                      <input\n                        aria-label={\`${'${day.label}'}요일 ${'${period.number}'}교시\`}\n                        value={draft?.[day.id]?.[period.number] || ''}\n                        onChange={(event) => updateDraft(day.id, period.number, event.target.value)}\n                        placeholder="—"\n                        maxLength={20}\n                        autoComplete="off"\n                      />\n                    </div>\n                  )\n                }\n\n                const date = weekDates[dayIndex]\n                const daySchedule = getScheduleForDate(date, weeklySchedule, overrides)\n                const item = daySchedule.find((entry) => entry.number === period.number)\n`
  const newGrid = `              {WEEKDAYS.map((day, dayIndex) => {\n                const date = weekDates[dayIndex]\n                const daySchedule = getScheduleForDate(date, weeklySchedule, overrides)\n                const item = daySchedule.find((entry) => entry.number === period.number)\n                const outsideBaseSchedule = period.number > day.regularPeriodCount\n\n                if (editing) {\n                  if (outsideBaseSchedule) {\n                    return <div className="week-cell not-applicable" key={\`${'${day.id}-${period.number}'}\`}>—</div>\n                  }\n                  return (\n                    <div className="week-cell editor-cell" key={\`${'${day.id}-${period.number}'}\`}>\n                      <input\n                        aria-label={\`${'${day.label}'}요일 ${'${period.number}'}교시\`}\n                        value={draft?.[day.id]?.[period.number] || ''}\n                        onChange={(event) => updateDraft(day.id, period.number, event.target.value)}\n                        placeholder="—"\n                        maxLength={20}\n                        autoComplete="off"\n                      />\n                    </div>\n                  )\n                }\n\n                if (outsideBaseSchedule && !item?.isOverride) {\n                  return <div className="week-cell not-applicable" key={\`${'${day.id}-${period.number}'}\`}>—</div>\n                }\n`
  text = replaceOnce(text, oldGrid, newGrid, 'timetable grid base/override separation')
  fs.writeFileSync(path, text)
}

{
  const path = 'src/timetable.css'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `  font-size: clamp(6.5px, 1.7vw, 8px);\n  font-weight: 560;`,
    `  font-size: clamp(7.5px, 1.7vw, 9px);\n  font-weight: 600;`,
    'week cell attribution sizing',
  )
  const legacy = `/* Row 7 is displayed across the week, but Mon/Tue/Thu are empty unless a date override adds a class. */\n.week-grid > .week-cell:nth-child(44):not(.is-override),\n.week-grid > .week-cell:nth-child(45):not(.is-override),\n.week-grid > .week-cell:nth-child(47):not(.is-override) {\n  background: color-mix(in srgb, var(--surface-soft) 28%, transparent);\n}\n\n.week-grid > .week-cell:nth-child(44):not(.is-override) .subject,\n.week-grid > .week-cell:nth-child(45):not(.is-override) .subject,\n.week-grid > .week-cell:nth-child(47):not(.is-override) .subject {\n  visibility: hidden;\n}\n\n.week-grid > .editor-cell:nth-child(44) input,\n.week-grid > .editor-cell:nth-child(45) input,\n.week-grid > .editor-cell:nth-child(47) input {\n  visibility: hidden;\n  pointer-events: none;\n}\n\n`
  text = replaceOnce(text, legacy, '', 'legacy hidden seventh-period css')
  text = replaceOnce(
    text,
    `.change-item-main .activity-attribution {\n  margin-top: 4px;\n  font-size: 9px;\n  opacity: 0.7;\n}`,
    `.change-item-main .activity-attribution {\n  display: block;\n  margin-top: 4px;\n  color: var(--text-secondary);\n  font-size: 9px;\n  font-weight: 600;\n  line-height: 1.2;\n  opacity: 0.7;\n}`,
    'temporary change attribution visibility',
  )
  fs.writeFileSync(path, text)
}

{
  const path = 'public/sw.js'
  let text = fs.readFileSync(path, 'utf8')
  text = text.replace(/const CACHE_NAME = 'school-shell-v(\d+)'/, (_, version) => `const CACHE_NAME = 'school-shell-v${Number(version) + 1}'`)
  fs.writeFileSync(path, text)
}

const main = fs.readFileSync('src/main.jsx', 'utf8')
if (main.includes('recordClassActivity(profile')) throw new Error('Old per-write timetable attribution remains')
if (!main.includes('outsideBaseSchedule && !item?.isOverride')) throw new Error('Seventh-period rendering guard missing')
const activity = fs.readFileSync('src/class-activity.js', 'utf8')
if (!activity.includes('export async function recordClassActivities')) throw new Error('Batched activity writer missing')
if (!activity.includes('const identityPromises = new Map()')) throw new Error('Identity cache missing')
