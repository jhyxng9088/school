import fs from 'node:fs'

function once(text, before, after, label) {
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`)
  return text.replace(before, after)
}

function regexOnce(text, regex, after, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const matches = [...text.matchAll(new RegExp(regex.source, flags))]
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`)
  return text.replace(regex, after)
}

let sync = fs.readFileSync('src/school-sync.js', 'utf8')
sync = once(sync,
`  getCountFromServer,
  getDoc,
  getFirestore,
  onSnapshot,`,
`  getCountFromServer,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  onSnapshot,`, 'firestore imports')

sync = once(sync,
`const auth = getAuth(syncApp)
const db = getFirestore(syncApp)
`,
`const auth = getAuth(syncApp)
const samsungInternet = /SamsungBrowser/i.test(navigator.userAgent)
const db = initializeFirestore(syncApp, samsungInternet
  ? { experimentalForceLongPolling: true }
  : { experimentalAutoDetectLongPolling: true })
`, 'firestore transport init')

sync = once(sync,
`  return authPromise
}

function classTodosCollection(profile) {`,
`  return authPromise
}

function installServerRevalidation(refresh) {
  const handle = () => {
    if (!document.hidden) refresh()
  }
  document.addEventListener('visibilitychange', handle)
  window.addEventListener('focus', handle)
  window.addEventListener('online', handle)
  return () => {
    document.removeEventListener('visibilitychange', handle)
    window.removeEventListener('focus', handle)
    window.removeEventListener('online', handle)
  }
}

function classTodosCollection(profile) {`, 'resume refresh helper')

sync = once(sync,
`export function listenClassTodos(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(
        classTodosCollection(profile),
        (snapshot) => {
          const todos = snapshot.docs
            .map((item) => safeSharedTodo({ id: item.id, ...item.data() }))
            .filter(Boolean)
          onValue(todos)
        },
        onError,
      )
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
  }
}
`,
`function sharedTodosFromSnapshot(snapshot) {
  return snapshot.docs
    .map((item) => safeSharedTodo({ id: item.id, ...item.data() }))
    .filter(Boolean)
}

export function listenClassTodos(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  let removeRevalidation = () => {}
  let generation = 0

  const applySnapshot = (snapshot) => {
    if (stopped) return
    generation += 1
    onValue(sharedTodosFromSnapshot(snapshot))
  }

  const refreshFromServer = async () => {
    const startedAtGeneration = generation
    try {
      const snapshot = await getDocsFromServer(classTodosCollection(profile))
      if (stopped || generation !== startedAtGeneration) return
      applySnapshot(snapshot)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }

  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(classTodosCollection(profile), applySnapshot, onError)
      removeRevalidation = installServerRevalidation(refreshFromServer)
      refreshFromServer()
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
    removeRevalidation()
  }
}
`, 'class reminder listener')

sync = once(sync,
`export function listenStudentTodoState(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(
        personalTodoStateCollection(profile),
        (snapshot) => {
          const state = {}
          snapshot.docs.forEach((item) => {
            const value = item.data() || {}
            state[item.id] = {
              completed: Boolean(value.completed),
              hidden: Boolean(value.hidden),
              updatedAt: Number(value.updatedAt || 0),
            }
          })
          onValue(state)
        },
        onError,
      )
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
  }
}
`,
`function personalTodoStateFromSnapshot(snapshot) {
  const state = {}
  snapshot.docs.forEach((item) => {
    const value = item.data() || {}
    state[item.id] = {
      completed: Boolean(value.completed),
      hidden: Boolean(value.hidden),
      updatedAt: Number(value.updatedAt || 0),
    }
  })
  return state
}

export function listenStudentTodoState(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  let removeRevalidation = () => {}
  let generation = 0

  const applySnapshot = (snapshot) => {
    if (stopped) return
    generation += 1
    onValue(personalTodoStateFromSnapshot(snapshot))
  }

  const refreshFromServer = async () => {
    const startedAtGeneration = generation
    try {
      const snapshot = await getDocsFromServer(personalTodoStateCollection(profile))
      if (stopped || generation !== startedAtGeneration) return
      applySnapshot(snapshot)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }

  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(personalTodoStateCollection(profile), applySnapshot, onError)
      removeRevalidation = installServerRevalidation(refreshFromServer)
      refreshFromServer()
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
    removeRevalidation()
  }
}
`, 'personal reminder listener')

sync = once(sync,
`export function useSharedTimetable(profile, now) {
  const initialWeeklyRef = useRef(null)
  const initialOverridesRef = useRef(null)
  if (initialWeeklyRef.current === null) initialWeeklyRef.current = loadWeeklySchedule()
  if (initialOverridesRef.current === null) initialOverridesRef.current = loadOverrides()

  const [weeklySchedule, setWeeklySchedule] = useState(initialWeeklyRef.current)
  const [overrides, setOverrides] = useState(initialOverridesRef.current)
`,
`export function useSharedTimetable(profile, now) {
  const [weeklySchedule, setWeeklySchedule] = useState(() => normalizeWeeklySchedule(null))
  const [overrides, setOverrides] = useState({})
`, 'server-first timetable state')

sync = regexOnce(sync,
/useEffect\(\(\) => \{\n    if \(!signature\) return undefined\n    let stopped = false\n    let unsubscribe = \(\) => \{\}\n\n    ensureSignedIn\(\)[\s\S]*?\n  \}, \[signature\]\)\n\n  const commitWeeklySchedule/,
`useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped) return
      generation += 1
      if (!snapshot.exists()) {
        const nextWeekly = normalizeWeeklySchedule(null)
        const nextOverrides = {}
        saveWeeklySchedule(nextWeekly)
        saveOverrides(nextOverrides)
        setWeeklySchedule(nextWeekly)
        setOverrides(nextOverrides)
        return
      }

      const data = snapshot.data() || {}
      const nextWeekly = normalizeWeeklySchedule(data.weeklySchedule)
      const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data.overrides), new Date())
      saveWeeklySchedule(nextWeekly)
      saveOverrides(nextOverrides)
      setWeeklySchedule(nextWeekly)
      setOverrides(nextOverrides)
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocFromServer(timetableRef(profile))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Timetable server revalidation failed:', error)
      }
    }

    ensureSignedIn()
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          timetableRef(profile),
          applySnapshot,
          (error) => console.error('Timetable realtime sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
        refreshFromServer()
      })
      .catch((error) => console.error('Timetable cloud connection failed:', error))

    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  const commitWeeklySchedule`, 'timetable listener')

sync = sync.replace("import { useCallback, useEffect, useRef, useState } from 'react'", "import { useCallback, useEffect, useState } from 'react'")
sync = sync.replace("  loadOverrides,\n  loadWeeklySchedule,\n", '')
fs.writeFileSync('src/school-sync.js', sync)

let activity = fs.readFileSync('src/class-activity.js', 'utf8')
activity = once(activity,
`  getDoc,
  getFirestore,
  onSnapshot,`,
`  getDoc,
  getDocsFromServer,
  getFirestore,
  onSnapshot,`, 'activity server import')

activity = once(activity,
`function currentProfile(profile) {`,
`function installServerRevalidation(refresh) {
  const handle = () => {
    if (!document.hidden) refresh()
  }
  document.addEventListener('visibilitychange', handle)
  window.addEventListener('focus', handle)
  window.addEventListener('online', handle)
  return () => {
    document.removeEventListener('visibilitychange', handle)
    window.removeEventListener('focus', handle)
    window.removeEventListener('online', handle)
  }
}

function currentProfile(profile) {`, 'activity resume helper')

activity = regexOnce(activity,
/useEffect\(\(\) => \{\n    if \(!signature\) return undefined\n    let stopped = false\n    let unsubscribe = \(\) => \{\}\n    ensureIdentity\(normalized\)[\s\S]*?\n  \}, \[signature\]\)\n\n  return activity/,
`useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped) return
      generation += 1
      const next = {}
      snapshot.docs.forEach((item) => {
        const value = item.data() || {}
        if (!value.entityType || !value.entityId || !value.actorName) return
        next[activityKey(value.entityType, value.entityId)] = {
          entityType: String(value.entityType),
          entityId: String(value.entityId),
          actorName: String(value.actorName).slice(0, 20),
          actorStudentKey: String(value.actorStudentKey || ''),
          action: value.action === 'added' ? 'added' : 'edited',
          updatedAt: Number(value.updatedAt || 0),
        }
      })
      setActivity(next)
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocsFromServer(activityCollection(normalized))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Class activity server revalidation failed:', error)
      }
    }

    ensureIdentity(normalized)
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          activityCollection(normalized),
          applySnapshot,
          (error) => console.error('Class activity sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
        refreshFromServer()
      })
      .catch((error) => console.error('Class activity connection failed:', error))
    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  return activity`, 'activity listener')

activity = once(activity,
`function newAcademicId() {
  return \`academic-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`
}
`,
`function academicEventsFromSnapshot(snapshot) {
  return snapshot.docs
    .map((item) => safeAcademicEvent({ id: item.id, ...item.data() }))
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
}

function newAcademicId() {
  return \`academic-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`
}
`, 'academic snapshot helper')

activity = regexOnce(activity,
/useEffect\(\(\) => \{\n    if \(!signature\) return undefined\n    let stopped = false\n    let unsubscribe = \(\) => \{\}\n    ensureIdentity\(normalized\)[\s\S]*?\n  \}, \[signature\]\)\n\n  const saveEvent/,
`useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped) return
      generation += 1
      setEvents(academicEventsFromSnapshot(snapshot))
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocsFromServer(academicCollection(normalized))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Academic schedule server revalidation failed:', error)
      }
    }

    ensureIdentity(normalized)
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          academicCollection(normalized),
          applySnapshot,
          (error) => console.error('Academic schedule sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
        refreshFromServer()
      })
      .catch((error) => console.error('Academic schedule connection failed:', error))
    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  const saveEvent`, 'academic listener')

fs.writeFileSync('src/class-activity.js', activity)

let sw = fs.readFileSync('public/sw.js', 'utf8')
if (!sw.includes('school-shell-v91')) throw new Error('unexpected service worker version')
sw = sw.replace('school-shell-v91', 'school-shell-v92')
fs.writeFileSync('public/sw.js', sw)

const verifySync = fs.readFileSync('src/school-sync.js', 'utf8')
const verifyActivity = fs.readFileSync('src/class-activity.js', 'utf8')
if (!verifySync.includes('experimentalForceLongPolling: true')) throw new Error('Samsung long polling missing')
if (!verifySync.includes('getDocsFromServer(classTodosCollection(profile))')) throw new Error('reminder server refresh missing')
if (!verifySync.includes('getDocFromServer(timetableRef(profile))')) throw new Error('timetable server refresh missing')
if (verifySync.includes('initialWeeklyRef')) throw new Error('local timetable first render still active')
if (!verifyActivity.includes('getDocsFromServer(academicCollection(normalized))')) throw new Error('academic server refresh missing')
