import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
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

function startMainApp() {
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
  try {
    const recovering = await recoverStudentAuthForProfile(
      profileSignature(configuredProfile),
      { force: forceAuthReset },
    )
    if (recovering) return
  } catch (error) {
    console.warn('S-Hub student auth migration skipped:', error)
  }
  startMainApp().catch((error) => console.error('S-Hub startup failed:', error))
}

prepareClientDataGeneration()

const standalone = isStandalone()
const profile = readStudentProfile()
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
      <StudentSetup
        initialName={legacyName}
        onSave={async (nextProfile) => {
          const saved = saveStudentProfile(nextProfile)
          if (!saved) return
          localStorage.setItem(USER_NAME_KEY, saved.name)
          root.unmount()
          await startConfiguredApp(saved, true)
        }}
      />
    </React.StrictMode>,
  )
} else {
  void startConfiguredApp(profile)
}
