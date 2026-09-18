const SHARED_ACTIVE_PILL_CSS = `
/* V2 shared active-pill visual. The study ranking segment and bottom navigation
   must resolve to the same visible fill instead of maintaining lookalike values. */
:root {
  --s-hub-active-pill-surface: var(--surface);
  --s-hub-active-pill-edge: var(--border);
  --s-hub-active-pill-shadow: inset 0 0 0 0.5px var(--s-hub-active-pill-edge), 0 5px 18px rgba(0, 0, 0, .10);
  --nav-indicator-surface: var(--s-hub-active-pill-surface);
  --nav-indicator-edge: var(--s-hub-active-pill-edge);
  --nav-indicator-shadow: 0 5px 18px rgba(0, 0, 0, .10);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Matches the visible Study pill in the bottom navigation reference. */
    --s-hub-active-pill-surface: #2f2f31;
  }
}

html.school-samsung {
  /* Samsung dark-mode surfaces are intentionally opaque in S-Hub. Keep both
     pill locations on that same platform-specific surface. */
  --s-hub-active-pill-surface: var(--surface);
}

.nav-indicator {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-indicator {
  background: transparent !important;
  box-shadow: none !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-indicator::after {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

.class-top-segment-pill {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}
`

const STUDY_FINAL_CSS = `
/* Final V2 study UI alignment. This intentionally comes after the older study
   polish layer so the visible ranking pill is exactly the shared nav pill. */
.preview-study-ranking-pill,
html.school-samsung .preview-study-ranking-pill {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-total {
  margin-top: 2px;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-subject-heading {
  margin-top: 22px;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-note {
  margin-bottom: 4px;
}
`

export function patchPreviewStudyUnifiedUISource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/styles.css')) {
    if (current.includes('--s-hub-active-pill-surface')) return current
    return `${current}\n${SHARED_ACTIVE_PILL_CSS}`
  }

  if (cleanId.endsWith('/preview-study.css') || cleanId.endsWith('/preview-study-ranking.css')) {
    if (current.includes('Final V2 study UI alignment.')) return current
    return `${current}\n${STUDY_FINAL_CSS}`
  }

  return current
}
