import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import {
  THEME_ACCENTS,
  THEME_MODES,
  initializeThemePreferences,
  readThemePreferences,
  saveThemePreferences,
} from './theme-preferences.js'

initializeThemePreferences()

function ThemeSettingsIsland() {
  const [open, setOpen] = useState(false)
  const [preferences, setPreferences] = useState(() => readThemePreferences())

  function updatePreferences(patch) {
    setPreferences((current) => saveThemePreferences({ ...current, ...patch }))
  }

  return (
    <>
      <button
        className="theme-settings-trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="테마 설정 열기"
      >
        테마
      </button>
      <UnifiedBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="테마"
        subtitle="S-Hub의 분위기를 선택해 주세요."
        ariaLabel="테마 설정"
      >
        <div className="theme-settings-panel">
          <section className="theme-settings-group" aria-labelledby="theme-mode-label">
            <p className="theme-settings-label" id="theme-mode-label">화면 모드</p>
            <div className="theme-mode-options" role="group" aria-label="화면 모드">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={preferences.mode === mode.id ? 'is-selected' : ''}
                  aria-pressed={preferences.mode === mode.id}
                  onClick={() => updatePreferences({ mode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </section>

          <section className="theme-settings-group" aria-labelledby="theme-accent-label">
            <p className="theme-settings-label" id="theme-accent-label">컬러</p>
            <div className="theme-accent-options" role="group" aria-label="테마 컬러">
              {THEME_ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  data-accent={accent.id}
                  className={`theme-accent-option ${preferences.accent === accent.id ? 'is-selected' : ''}`}
                  aria-pressed={preferences.accent === accent.id}
                  onClick={() => updatePreferences({ accent: accent.id })}
                >
                  <span className="theme-accent-swatch" aria-hidden="true" />
                  <span>{accent.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </UnifiedBottomSheet>
    </>
  )
}

const themeRoot = document.getElementById('theme-settings-root')
if (themeRoot) {
  createRoot(themeRoot).render(
    <React.StrictMode>
      <ThemeSettingsIsland />
    </React.StrictMode>,
  )
}
