import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  ensureSignedIn,
  prepareClientDataGeneration,
  profileSignature,
  readStudentProfile,
  saveStudentProfile,
} from './school-sync.js'
import { StudentSetup } from './student-setup.jsx'
import { recoverStudentAuthForProfile } from './student-auth-migration.js'

const INSTALL_DONE_KEY = 'school.installGuideDone'
const USER_NAME_KEY = 'school.userName'
const STUDENT_PROFILE_KEY = 'school.studentProfile.v1'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function launchProgress(value) {
  window.__shubLaunch?.progress?.(value)
}

function refreshExistingServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => {})
}

function LaunchReady() {
  useEffect(() => {
    launchProgress(.9)
    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.__shubLaunch?.ready?.({ settleMs: 140 })
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return null
}

function preloadMainAppModule() {
  launchProgress(.62)
  return import('./main.jsx')
}

function hasExplicitSchoolSelection() {
  try {
    const stored = JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return false
    const requiredSchoolFields = [stored.officeCode, stored.schoolCode, stored.schoolName, stored.schoolKind]
    const grade = Number(stored.grade)
    return requiredSchoolFields.every((value) => String(value || '').trim())
      && Number.isInteger(grade)
      && grade >= 1
  } catch {
    return false
  }
}

async function startConfiguredApp(configuredProfile, forceAuthReset = false) {
  launchProgress(.44)
  try {
    const recovering = await recoverStudentAuthForProfile(
      profileSignature(configuredProfile),
      { force: forceAuthReset },
    )
    if (recovering) return
  } catch (error) {
    console.warn('S-Hub student auth migration skipped:', error)
  }

  launchProgress(.54)
  // Start the canonical Firebase auth + identity revalidation before the main
  // app module finishes loading. Every data owner still calls the same
  // ensureSignedIn promise; this only overlaps the unavoidable round trip.
  void ensureSignedIn().catch((error) => {
    console.warn('S-Hub auth warmup deferred to data owners:', error)
  })
  const mainModulePromise = preloadMainAppModule()

  // Mount the real app behind the launch surface immediately. The canonical
  // data owners in AppShell now perform their own first sync, so startup no
  // longer duplicates Firestore reads through a separate preload graph.
  try {
    const mainModule = await mainModulePromise
    launchProgress(.78)
    mainModule.mountMainApp()
  } catch (error) {
    console.error('S-Hub startup failed:', error)
  }
}

refreshExistingServiceWorker()
prepareClientDataGeneration()
launchProgress(.32)

const standalone = isStandalone()
const profile = readStudentProfile()
launchProgress(.38)
const previousProfileSignature = profileSignature(profile)
const schoolSelectionComplete = hasExplicitSchoolSelection()

// If this page is already running as an installed PWA, installation itself is
// the confirmation. Mark the legacy guide complete before deciding which first
// screen owns the session so new users cannot fall through to the old setup.
if (standalone && localStorage.getItem(INSTALL_DONE_KEY) !== 'true') {
  localStorage.setItem(INSTALL_DONE_KEY, 'true')
}

// A normalized legacy profile can contain the Suji compatibility context even
// when the user never chose a school. Only skip school onboarding when the raw
// stored profile itself contains an explicit school selection.
if (standalone && (!profile || !schoolSelectionComplete)) {
  const container = document.getElementById('root')
  const root = createRoot(container)
  const legacyName = profile?.name || localStorage.getItem(USER_NAME_KEY) || ''

  root.render(
    <React.StrictMode>
      <LaunchReady />
      <StudentSetup
        initialName={legacyName}
        onSave={async (nextProfile) => {
          const saved = saveStudentProfile(nextProfile)
          if (!saved) return
          localStorage.setItem(USER_NAME_KEY, saved.name)
          root.unmount()
          const savedSignature = profileSignature(saved)
          const schoolIdentityChanged = Boolean(
            previousProfileSignature && previousProfileSignature !== savedSignature,
          )
          await startConfiguredApp(saved, schoolIdentityChanged)
        }}
      />
    </React.StrictMode>,
  )
} else {
  void startConfiguredApp(profile)
}
