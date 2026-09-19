import { preloadClassPresence, preloadTimetable } from './school-sync.js'
import { preloadTodos } from './todo.jsx'
import { preloadSharedAcademic } from './class-activity.js'
import { preloadSchoolData } from './stage3-core.js'
import { preloadPreviewBoard } from './preview-board-client.js'
import { preloadPreviewStudy } from './preview-study-client.js'
import { preloadClassRoster } from './class-roster-ui-v2.js'
import { preloadThemePreferences } from './theme-sync.js'

const LAUNCH_PRELOAD_TIMEOUT_MS = 6500

function launchProgress(value) {
  window.__shubLaunch?.progress?.(value)
}

async function retryFresh(task) {
  const delays = [0, 220]
  let lastError = null
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (navigator.onLine === false || error?.name === 'AbortError') throw error
    }
  }
  throw lastError
}

export async function preloadConfiguredAppData(profile) {
  if (!profile || navigator.onLine === false) {
    launchProgress(.9)
    return { offline: true, timedOut: false, failures: [] }
  }

  const controller = new AbortController()
  const tasks = [
    {
      label: 'presence-roster',
      run: () => Promise.all([
        preloadClassPresence(profile, { signal: controller.signal }),
        preloadClassRoster(),
      ]),
    },
    { label: 'timetable', run: () => preloadTimetable(profile) },
    { label: 'reminders', run: () => preloadTodos(profile) },
    { label: 'academic-shared', run: () => preloadSharedAcademic(profile) },
    { label: 'school-neis', run: () => preloadSchoolData(profile, new Date(), { signal: controller.signal }) },
    { label: 'board', retry: false, run: () => preloadPreviewBoard({ signal: controller.signal }) },
    { label: 'study', run: () => preloadPreviewStudy({ signal: controller.signal }) },
    { label: 'theme', retry: false, run: () => preloadThemePreferences({ signal: controller.signal }) },
  ]

  let completed = 0
  const wrapped = tasks.map(({ label, run, retry = true }) => (retry ? retryFresh(run) : run())
    .then((value) => ({ label, status: 'fulfilled', value }))
    .catch((error) => ({ label, status: 'rejected', error }))
    .finally(() => {
      completed += 1
      launchProgress(.58 + (.34 * completed / tasks.length))
    }))

  const allTasks = Promise.all(wrapped)
  let timeoutId = 0
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => {
      controller.abort()
      resolve(null)
    }, LAUNCH_PRELOAD_TIMEOUT_MS)
  })

  const result = await Promise.race([allTasks, timeout])
  if (timeoutId) window.clearTimeout(timeoutId)

  if (!result) {
    console.warn('S-Hub launch preload reached the safety timeout; continuing with completed fresh data and local caches.')
    launchProgress(.94)
    return { offline: false, timedOut: true, failures: ['timeout'] }
  }

  const failures = result
    .filter((entry) => entry.status === 'rejected')
    .map((entry) => entry.label)

  if (failures.length) {
    console.warn('S-Hub launch preload could not refresh every source:', failures)
  }
  launchProgress(failures.length ? .94 : .97)

  return {
    offline: false,
    timedOut: false,
    failures,
  }
}
