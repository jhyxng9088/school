import { patchPreviewAISpacingPolishSource } from './preview-ai-spacing-polish-patch.js'
import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'

const AI_STAGE_MOTION_CSS = `
/* Preview-only AI state motion. Compose enters in the same stagger rhythm as Reminder. */
.s-hub-ai-page-stage {
  min-width: 0;
  transform-origin: 50% 20%;
}

.s-hub-ai-page-stage:not(.is-compose) {
  animation: content-in 980ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes s-hub-ai-piece-in {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0) scale(0.997);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.s-hub-ai-page-hero,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
  animation: s-hub-ai-piece-in 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Keep the Reminder-like cascade, but overlap adjacent pieces more visibly. */
.s-hub-ai-page-hero { animation-delay: 30ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability:nth-child(1) { animation-delay: 90ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability:nth-child(2) { animation-delay: 130ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability:nth-child(3) { animation-delay: 170ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section:nth-child(1) > .s-hub-ai-page-extra-head { animation-delay: 230ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick:nth-child(1) { animation-delay: 290ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick:nth-child(2) { animation-delay: 330ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick:nth-child(3) { animation-delay: 370ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick:nth-child(4) { animation-delay: 410ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section:nth-child(2) > .s-hub-ai-page-extra-head { animation-delay: 470ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(1) { animation-delay: 530ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(2) { animation-delay: 570ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(3) { animation-delay: 610ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(4) { animation-delay: 650ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-content { animation-delay: 710ms; }

/* State transitions own the result motion, so result blocks must not animate twice. */
.s-hub-ai-page-stage .s-hub-ai-answer,
.s-hub-ai-page-stage .s-hub-ai-import,
.s-hub-ai-page-stage .s-hub-ai-save-result {
  animation: none;
}

html.school-mobile-compat .s-hub-ai-page-stage:not(.is-compose) {
  animation-duration: 760ms;
}

html.school-mobile-compat .s-hub-ai-page-hero,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
  animation-duration: 620ms;
}

@media (prefers-reduced-motion: reduce) {
  .s-hub-ai-page-stage:not(.is-compose),
  .s-hub-ai-page-hero,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
  .s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
  .s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
  }
}
`

function patchAISheet(source) {
  let next = String(source || '')
  if (next.includes("className={'s-hub-ai-page-stage '")) return next

  const startMarker = `        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-capabilities"`
  if (!next.includes(startMarker)) {
    throw new Error('Preview AI stage motion start marker changed unexpectedly')
  }
  next = next.replace(
    startMarker,
    `        <div className={'s-hub-ai-page-stage ' + (working ? 'is-working' : 'is-' + state.mode)} key={working ? 'working' : state.mode}>\n${startMarker}`,
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
