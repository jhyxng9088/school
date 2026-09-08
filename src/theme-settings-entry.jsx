import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SHubIcon } from './s-hub-icon.jsx'
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
      <span className="theme-mode-label-layer" aria-hidden="true">
        {THEME_MODES.map((item) => (
          <span
            key={item.id}
            className={`theme-mode-visual-label ${mode === item.id ? 'is-active' : ''}`}
          >
            {item.label}
          </span>
        ))}
      </span>
      {THEME_MODES.map((item, index) => (
        <button
          ref={(node) => { spring.buttonRefs.current[index] = node }}
          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (mode === item.id ? 'is-active' : '')}
          aria-pressed={mode === item.id}
          onClick={() => onModeChange(item.id)}
        >
          <span className="theme-mode-label">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function DefaultThemeSwatch({ selected }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
      style={{ display: 'block' }}
    >
      <circle cx="16" cy="16" r="16" fill="#f5f5f7" />
      <path d="M16 0a16 16 0 0 1 0 32V0Z" fill="#1c1c1e" />
      {selected ? (
        <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
      ) : null}
    </svg>
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
        title="테마 설정"
      >
        <SHubIcon name="settings" size={17} />
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
              {THEME_ACCENTS.map((accent) => {
                const selected = preferences.accent === accent.id
                const isDefault = accent.id === 'default'

                return (
                  <button
                    key={accent.id}
                    type="button"
                    data-accent={accent.id}
                    className={`theme-accent-option ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => updatePreferences({ accent: accent.id })}
                  >
                    <span
                      className="theme-accent-swatch"
                      aria-hidden="true"
                      style={isDefault ? {
                        border: 0,
                        background: 'transparent',
                        boxShadow: 'none',
                        clipPath: 'none',
                        WebkitClipPath: 'none',
                        overflow: 'visible',
                      } : undefined}
                    >
                      {isDefault ? <DefaultThemeSwatch selected={selected} /> : null}
                    </span>
                    <span>{accent.label}</span>
                  </button>
                )
              })}
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