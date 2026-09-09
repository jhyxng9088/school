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

const profile = readStudentProfile()
const installDone = localStorage.getItem(INSTALL_DONE_KEY) === 'true'

if (!profile && installDone && isStandalone()) {
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
