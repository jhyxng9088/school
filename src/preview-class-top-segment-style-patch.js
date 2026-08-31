const CLASS_TOP_SEGMENT_STYLE_CSS = `
/* Preview-only visual refinement for the top class segmented control. */
.class-top-segment {
  height: 44px !important;
  margin: 2px auto 18px !important;
}

.class-top-segment-pill {
  background: var(--surface) !important;
  opacity: 1 !important;
  box-shadow: inset 0 0 0 0.5px var(--border) !important;
}

.class-top-segment-button {
  min-height: 34px !important;
}
`

export function patchPreviewClassTopSegmentStyleSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/styles.css')) return String(source || '')
  const current = String(source || '')
  if (current.includes('Preview-only visual refinement for the top class segmented control.')) return current
  return `${current}\n${CLASS_TOP_SEGMENT_STYLE_CSS}`
}
