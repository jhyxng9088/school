import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useSHubSegmentSpring } from './s-hub-segment-spring.js'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import {
  THEME_ACCENTS,
  THEME_MODES,
  initializeThemePreferences,
  readThemePreferences,
  saveThemePreferences,
} from './theme-preferences.js'

initializeThemePreferences()

function ThemeModeSegment({ mode, onModeChange }) {
  const activeIndex = Math.max(0, THEME_MODES.findIndex((item) => item.id === mode))
  const spring = useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--segment-padding',
    shellScaleProperty: '--segment-shell-scale-x',
    shellShiftProperty: '--segment-shell-shift-x',
    fallbackPadding: 5,
  })

  return (
    <div
      ref={spring.containerRef}
      className="class-top-segment schedule-top-segment theme-mode-segment"
      role="group"
      aria-label="화면 모드"
    >
      <span ref={spring.indicatorRef} className="class-top-segment-pill" aria-hidden="true" />
      {THEME_MODES.map((item, index) => (
        <button
          ref={(node) => { spring.buttonRefs.current[index] = node }}
          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (mode === item.id ? 'is-active' : '')}
          aria-pressed={mode === item.id}
          onClick={() => onModeChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

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
            <ThemeModeSegment
              mode={preferences.mode}
              onModeChange={(mode) => updatePreferences({ mode })}
            />
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
