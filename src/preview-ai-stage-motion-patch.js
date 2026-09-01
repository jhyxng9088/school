import { patchPreviewAISpacingPolishSource } from './preview-ai-spacing-polish-patch.js'
import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'

const AI_STAGE_MOTION_CSS = `
/* Preview-only AI state motion. One persistent stage flows from compose to working to result. */
.s-hub-ai-page-stage {
  min-width: 0;
  transform-origin: 50% 18%;
  transition:
    opacity 420ms ease,
    transform 720ms cubic-bezier(0.16, 1, 0.3, 1),
    min-height 720ms cubic-bezier(0.16, 1, 0.3, 1);
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

@keyframes s-hub-ai-working-flow-in {
  from {
    opacity: 0.72;
    transform: translate3d(0, 12px, 0) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes s-hub-ai-stream-in {
  from {
    opacity: 0;
    transform: translate3d(0, 15px, 0) scale(0.994);
  }
  56% {
    opacity: 1;
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.s-hub-ai-page-hero,
.s-hub-ai-page-mark,
.s-hub-ai-page-title,
.s-hub-ai-page-hero-copy,
.s-hub-ai-page-stop {
  transition:
    width 760ms cubic-bezier(0.16, 1, 0.3, 1),
    height 760ms cubic-bezier(0.16, 1, 0.3, 1),
    min-height 760ms cubic-bezier(0.16, 1, 0.3, 1),
    padding 760ms cubic-bezier(0.16, 1, 0.3, 1),
    margin 760ms cubic-bezier(0.16, 1, 0.3, 1),
    gap 760ms cubic-bezier(0.16, 1, 0.3, 1),
    border-radius 760ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 760ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 360ms ease,
    color 360ms ease,
    background 520ms ease,
    border-color 520ms ease,
    box-shadow 520ms ease;
}

.s-hub-ai-page-hero.is-working {
  min-height: 142px;
  gap: 20px;
  margin-bottom: 6px;
  padding-block: 13px;
}

.s-hub-ai-page-hero.is-working .s-hub-ai-page-mark {
  width: 108px;
  height: 108px;
  border-radius: 31px;
  transform: translate3d(0, 0, 0) scale(1.015);
  border-color: color-mix(in srgb, var(--text) 15%, var(--border));
  background: color-mix(in srgb, var(--surface) 94%, var(--text) 6%);
  box-shadow: inset 0 1px 0 var(--specular-edge), var(--shadow-soft);
}

.s-hub-ai-page-hero.is-working .s-hub-ai-page-title .eyebrow {
  opacity: 0.54;
}

.s-hub-ai-page-hero.is-working .s-hub-ai-page-title h1 {
  font-size: clamp(21px, 4vw, 26px);
  letter-spacing: -.035em;
}

.s-hub-ai-page-hero-copy {
  max-width: 520px;
  overflow: hidden;
}

.s-hub-ai-page-hero-copy.is-working-copy {
  margin-top: 5px !important;
  color: var(--text-secondary) !important;
  font-size: 12px !important;
  line-height: 1.35 !important;
  opacity: 0.74;
}

.s-hub-ai-page-hero-copy.is-working-copy.is-fading {
  opacity: 0.18;
  transform: translate3d(0, -2px, 0);
}

.s-hub-ai-page-hero.is-working .s-hub-ai-page-stop {
  opacity: 0.72;
}

/* Inline mode owns a single, enlarged hero orb. Keep the legacy sheet orb only in sheet mode. */
.s-hub-ai-working-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.s-hub-ai-page-stage.is-working {
  animation: s-hub-ai-working-flow-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.s-hub-ai-page-stage.is-working > .s-hub-ai-content {
  min-height: 24px;
  padding-block: 0;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  transition:
    min-height 700ms cubic-bezier(0.16, 1, 0.3, 1),
    padding 700ms cubic-bezier(0.16, 1, 0.3, 1),
    background 440ms ease,
    border-color 440ms ease,
    box-shadow 440ms ease;
}

.s-hub-ai-page-stage.is-working .s-hub-ai-thinking-stage {
  min-height: 24px !important;
  padding: 0 !important;
  margin: 0 !important;
  gap: 0 !important;
}

/* Compose keeps the familiar S-Hub cascade. */
.s-hub-ai-page-hero,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
.s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
  animation: s-hub-ai-piece-in 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

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

/* Results stream in from top to bottom rather than snapping in as one card. */
.s-hub-ai-page-stage.is-answer .s-hub-ai-answer,
.s-hub-ai-page-stage.is-import .s-hub-ai-answer,
.s-hub-ai-page-stage.is-import .s-hub-ai-result-head,
.s-hub-ai-page-stage.is-import .s-hub-ai-item,
.s-hub-ai-page-stage.is-import .s-hub-ai-save-result {
  animation: s-hub-ai-stream-in 760ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.s-hub-ai-page-stage.is-answer .s-hub-ai-answer { animation-delay: 45ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-answer { animation-delay: 35ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-result-head { animation-delay: 95ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(1) { animation-delay: 145ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(2) { animation-delay: 185ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(3) { animation-delay: 225ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(4) { animation-delay: 265ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(5) { animation-delay: 305ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(6) { animation-delay: 345ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-item:nth-child(n+7) { animation-delay: 385ms; }
.s-hub-ai-page-stage.is-import .s-hub-ai-save-result { animation-delay: 430ms; }

html.school-mobile-compat .s-hub-ai-page-hero.is-working .s-hub-ai-page-mark {
  width: 96px;
  height: 96px;
  border-radius: 29px;
}

html.school-mobile-compat .s-hub-ai-page-stage.is-working,
html.school-mobile-compat .s-hub-ai-page-stage.is-answer .s-hub-ai-answer,
html.school-mobile-compat .s-hub-ai-page-stage.is-import .s-hub-ai-answer,
html.school-mobile-compat .s-hub-ai-page-stage.is-import .s-hub-ai-result-head,
html.school-mobile-compat .s-hub-ai-page-stage.is-import .s-hub-ai-item,
html.school-mobile-compat .s-hub-ai-page-stage.is-import .s-hub-ai-save-result {
  animation-duration: 640ms;
}

html.school-mobile-compat .s-hub-ai-page-hero,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
html.school-mobile-compat .s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
  animation-duration: 620ms;
}

@media (max-width: 560px) {
  .s-hub-ai-page-hero.is-working {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 126px;
    gap: 15px;
    padding-block: 9px;
  }

  .s-hub-ai-page-hero.is-working .s-hub-ai-page-stop {
    grid-column: 1 / -1;
    min-height: 32px;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .s-hub-ai-page-stage,
  .s-hub-ai-page-hero,
  .s-hub-ai-page-mark,
  .s-hub-ai-page-title,
  .s-hub-ai-page-hero-copy,
  .s-hub-ai-page-stop,
  .s-hub-ai-page-stage.is-working,
  .s-hub-ai-page-stage.is-answer .s-hub-ai-answer,
  .s-hub-ai-page-stage.is-import .s-hub-ai-answer,
  .s-hub-ai-page-stage.is-import .s-hub-ai-result-head,
  .s-hub-ai-page-stage.is-import .s-hub-ai-item,
  .s-hub-ai-page-stage.is-import .s-hub-ai-save-result,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-capabilities > .s-hub-ai-page-capability,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-page-extra > section > .s-hub-ai-page-extra-head,
  .s-hub-ai-page-stage.is-compose .s-hub-ai-page-quick,
  .s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item,
  .s-hub-ai-page-stage.is-compose > .s-hub-ai-content {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI stage motion marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchAISheet(source) {
  let next = String(source || '')
  if (next.includes("className={'s-hub-ai-page-stage '")) return next

  next = replaceRequired(
    next,
    `<header className="s-hub-ai-page-hero">`,
    `<header className={'s-hub-ai-page-hero ' + (working ? 'is-working' : 'is-idle')}>`,
    'hero working class',
  )

  next = replaceRequired(
    next,
    `<div className="s-hub-ai-page-mark" aria-hidden="true"><SHubAIOrb size={42} active={working} /></div>`,
    `<div className="s-hub-ai-page-mark" aria-hidden="true"><SHubAIOrb size={working ? 96 : 42} active={working} /></div>`,
    'single morphing hero orb',
  )

  next = replaceRequired(
    next,
    `<div className="s-hub-ai-page-title">\n            <p className="eyebrow">S-Hub AI</p>\n            <h1>AI</h1>\n            <p>학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S-Hub에 추가해.</p>\n          </div>`,
    `<div className="s-hub-ai-page-title">\n            <p className="eyebrow">S-Hub AI</p>\n            <h1>{working ? '처리 중' : 'AI'}</h1>\n            <p className={\`s-hub-ai-page-hero-copy ${working ? 'is-working-copy' : 'is-description'} ${working && workingMessageFading ? 'is-fading' : ''}\`.trim()}>\n              {working ? workingMessage : '학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S-Hub에 추가해.'}\n            </p>\n          </div>`,
    'minimal working copy',
  )

  next = replaceRequired(
    next,
    `            <SHubAIOrb size={56} active />\n            <p className={\`s-hub-ai-thinking-copy ${workingMessageFading ? 'is-fading' : ''}\`.trim()}>{workingMessage}</p>`,
    `            {!inline ? <SHubAIOrb size={56} active /> : null}\n            {inline ? (\n              <span className="s-hub-ai-working-sr">{workingMessage}</span>\n            ) : (\n              <p className={\`s-hub-ai-thinking-copy ${workingMessageFading ? 'is-fading' : ''}\`.trim()}>{workingMessage}</p>\n            )}`,
    'remove duplicate inline working orb',
  )

  const startMarker = `        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-capabilities"`
  if (!next.includes(startMarker)) {
    throw new Error('Preview AI stage motion start marker changed unexpectedly')
  }
  next = next.replace(
    startMarker,
    `        <div className={'s-hub-ai-page-stage ' + (working ? 'is-working' : 'is-' + state.mode)}>\n${startMarker}`,
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
    if (!next.includes('Preview-only AI state motion. One persistent stage')) next = `${next}\n${AI_STAGE_MOTION_CSS}`
  }

  next = patchPreviewAISpacingPolishSource(next, id)
  return patchPreviewAIContextLayoutSource(next, id)
}
