import React from 'react'
import { createRoot } from 'react-dom/client'
import { prepareClientDataGeneration, readStudentProfile, saveStudentProfile } from './school-sync.js'
import { StudentSetup } from './student-setup.jsx'

const INSTALL_DONE_KEY = 'school.installGuideDone'
const USER_NAME_KEY = 'school.userName'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function startMainApp() {
  return import('./main.jsx')
}

prepareClientDataGeneration()

const standalone = isStandalone()
const profile = readStudentProfile()

// If this page is already running as an installed PWA, installation itself is
// the confirmation. Mark the legacy guide complete before deciding which first
// screen owns the session so new users cannot fall through to the old setup.
if (standalone && localStorage.getItem(INSTALL_DONE_KEY) !== 'true') {
  localStorage.setItem(INSTALL_DONE_KEY, 'true')
}

if (!profile && standalone) {
  const container = document.getElementById('root')
  const root = createRoot(container)
  const legacyName = localStorage.getItem(USER_NAME_KEY) || ''

  root.render(
    <React.StrictMode>
      <StudentSetup
        initialName={legacyName}
        onSave={(nextProfile) => {
          const saved = saveStudentProfile(nextProfile)
          if (!saved) return
          localStorage.setItem(USER_NAME_KEY, saved.name)
          root.unmount()
          startMainApp().catch((error) => console.error('S-Hub startup failed:', error))
        }}
      />
    </React.StrictMode>,
  )
} else {
  startMainApp().catch((error) => console.error('S-Hub startup failed:', error))
}
