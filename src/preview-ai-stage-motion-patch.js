import { patchPreviewAISpacingPolishSource } from './preview-ai-spacing-polish-patch.js'
import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'

const AI_STAGE_MOTION_CSS = `
/* Preview-only AI state motion: reuse the same content-in language as S-Hub pages. */
.s-hub-ai-page-stage {
  min-width: 0;
  animation: content-in 980ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: 50% 20%;
}

/* The whole AI stage now owns the transition, so result blocks must not animate twice. */
.s-hub-ai-page-stage .s-hub-ai-answer,
.s-hub-ai-page-stage .s-hub-ai-import,
.s-hub-ai-page-stage .s-hub-ai-save-result {
  animation: none;
}

html.school-mobile-compat .s-hub-ai-page-stage {
  animation-duration: 760ms;
}

@media (prefers-reduced-motion: reduce) {
  .s-hub-ai-page-stage {
    animation-duration: 0.01ms;
  }
}
`

function patchAISheet(source) {
  let next = String(source || '')
  if (next.includes('className="s-hub-ai-page-stage"')) return next

  const startMarker = `        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-capabilities"`
  if (!next.includes(startMarker)) {
    throw new Error('Preview AI stage motion start marker changed unexpectedly')
  }
  next = next.replace(
    startMarker,
    `        <div className="s-hub-ai-page-stage" key={working ? 'working' : state.mode}>\n${startMarker}`,
  )

  const endMarker = `          </div>\n        ) : null}\n      </section>\n    )`
  if (!next.includes(endMarker)) {
    throw new Error('Preview AI stage motion end marker changed unexpectedly')
  }
  next = next.replace(
    endMarker,
    `          </div>\n        ) : null}\n        </div>\n      </section>\n    )`,
  )

  return next
}

export function patchPreviewAIStageMotionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  let next = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAISheet(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview-only AI state motion')) next = `${next}\n${AI_STAGE_MOTION_CSS}`
  }

  next = patchPreviewAISpacingPolishSource(next, id)
  return patchPreviewAIContextLayoutSource(next, id)
}
