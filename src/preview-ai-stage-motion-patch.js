const AI_SPACING_POLISH_CSS = `
/* Preview-only AI rhythm polish: clearer spacing without changing the information architecture. */
.s-hub-ai-page > .s-hub-ai-content .s-hub-ai-compose {
  gap: 13px;
}

.s-hub-ai-page > .s-hub-ai-content .s-hub-ai-compose-actions {
  padding: 0 2px;
}

.s-hub-ai-page-extra {
  gap: 23px;
  margin-top: 23px;
}

.s-hub-ai-page-extra > section {
  display: grid;
  gap: 9px;
}

.s-hub-ai-page-extra-head {
  display: grid;
  justify-content: start;
  align-items: start;
  gap: 3px;
  padding: 0 3px;
}

.s-hub-ai-page-extra-head strong {
  line-height: 1.22;
}

.s-hub-ai-page-extra-head span {
  max-width: 440px;
  line-height: 1.42;
  text-align: left;
}

.s-hub-ai-page-quick-grid {
  gap: 9px;
}

.s-hub-ai-page-quick {
  min-height: 50px;
  padding: 0 14px;
}

.s-hub-ai-page-context-item {
  min-height: 76px;
  padding: 14px 15px;
}

/* Quick questions should feel inserted, not teleported into the composer. */
.s-hub-ai-page .s-hub-ai-compose textarea.is-quick-fill {
  animation: s-hub-ai-quick-fill 440ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes s-hub-ai-quick-fill {
  0% {
    color: transparent;
    text-indent: 7px;
  }
  34% {
    color: color-mix(in srgb, var(--text) 38%, transparent);
  }
  100% {
    color: var(--text);
    text-indent: 0;
  }
}

@media (min-width: 700px) and (min-height: 820px) {
  .s-hub-ai-page-extra {
    gap: 25px;
    margin-top: 25px;
  }
}

@media (max-width: 560px) {
  .s-hub-ai-page > .s-hub-ai-content .s-hub-ai-compose {
    gap: 12px;
  }

  .s-hub-ai-page-extra {
    gap: 20px;
    margin-top: 20px;
  }

  .s-hub-ai-page-extra > section {
    gap: 8px;
  }

  .s-hub-ai-page-extra-head {
    padding: 0 2px;
  }

  .s-hub-ai-page-quick {
    min-height: 48px;
    padding: 0 13px;
  }

  .s-hub-ai-page-context-item {
    min-height: 69px;
    padding: 11px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .s-hub-ai-page .s-hub-ai-compose textarea.is-quick-fill {
    animation: none;
    color: var(--text);
    text-indent: 0;
  }
}
`

const AI_CONTEXT_LAYOUT_CSS = `
/* Preview AI context layout: reference tools first, composer last. */
.app-content:has(> .s-hub-ai-page) {
  --s-hub-ai-top-inset: max(32px, env(safe-area-inset-top));
  --s-hub-ai-nav-clearance: calc(64px + var(--nav-bottom) + 24px);
  /* Keep the same visual center above the fixed nav while reserving real
     scroll room after long AI content. Without this reserve, the composer can
     slide underneath the fixed bottom nav on tall iPhone layouts. */
  min-height: calc(100dvh + 24px - var(--s-hub-ai-top-inset));
  display: flex;
  flex-direction: column;
  padding-bottom: var(--s-hub-ai-nav-clearance);
}

.app-content:has(> .s-hub-ai-page) > .s-hub-ai-page {
  margin-block: auto;
}

.s-hub-ai-page .s-hub-ai-content {
  scroll-margin-bottom: var(--s-hub-ai-nav-clearance);
}

.s-hub-ai-page-extra {
  margin-top: 0;
  margin-bottom: 23px;
}

.s-hub-ai-page-context {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (min-width: 700px) and (min-height: 820px) {
  .s-hub-ai-page-extra {
    margin-top: 0;
    margin-bottom: 25px;
  }
}

@media (max-height: 760px) {
  .app-content:has(> .s-hub-ai-page) {
    min-height: 100dvh;
    display: block;
    padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  .app-content:has(> .s-hub-ai-page) > .s-hub-ai-page {
    margin-block: 0;
  }
}

@media (max-width: 560px) {
  .s-hub-ai-page-extra {
    margin-top: 0;
    margin-bottom: 20px;
  }

  .s-hub-ai-page-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .s-hub-ai-page-context-item:nth-child(3) {
    border-left: 0;
  }

  .s-hub-ai-page-context-item:nth-child(n + 3) {
    border-top: 1px solid var(--divider);
  }
}
`

const AI_BACKGROUND_CSS = `
/* Preview-only AI continuity: keep the one AI session alive while other stations are used. */
.preview-ai-persistent-host[hidden] {
  display: none !important;
}

/* The persistent wrapper is the direct app-content child. It must preserve the
   original visual centering when AI is short, but grow with long compose content
   so the fixed bottom nav never covers the real end of the page. */
.app-content.tab-ai {
  --s-hub-ai-top-inset: max(32px, env(safe-area-inset-top));
  --s-hub-ai-nav-clearance: calc(64px + var(--nav-bottom) + 24px);
  min-height: calc(100dvh + 24px - var(--s-hub-ai-top-inset));
  display: flex;
  flex-direction: column;
  padding-bottom: var(--s-hub-ai-nav-clearance);
}

.app-content.tab-ai > .preview-ai-persistent-host.is-active {
  width: 100%;
  flex: 1 0 auto;
  min-height: auto;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.app-content.tab-ai > .preview-ai-persistent-host.is-active > .s-hub-ai-page {
  width: 100%;
  margin-block: auto;
}

.app-content.tab-ai .s-hub-ai-content {
  scroll-margin-bottom: var(--s-hub-ai-nav-clearance);
}

.preview-ai-persistent-host.is-active,
.preview-station-page-host {
  animation: s-hub-ai-background-page-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes s-hub-ai-background-page-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0) scale(0.996);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.s-hub-ai-background-note {
  max-width: 430px !important;
  margin: 4px 0 0 !important;
  color: var(--text-tertiary) !important;
  font-size: 10.5px !important;
  font-weight: 560 !important;
  line-height: 1.38 !important;
  letter-spacing: -.012em !important;
  opacity: .76;
}

.bottom-nav .nav-button[data-tab="ai"] {
  position: relative;
}

.bottom-nav .nav-button[data-tab="ai"] .s-hub-ai-nav-progress {
  position: absolute;
  z-index: 5;
  top: 7px;
  left: calc(50% + 9px);
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--surface) 72%, transparent);
  pointer-events: none;
  animation: s-hub-ai-nav-working 1.55s ease-in-out infinite;
}

.bottom-nav .nav-button[data-tab="ai"].is-ai-working:not(.active) svg {
  animation: s-hub-ai-nav-orb-breathe 1.9s ease-in-out infinite;
  transform-origin: 50% 50%;
}

@keyframes s-hub-ai-nav-working {
  0%, 100% {
    opacity: .38;
    transform: scale(.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}

@keyframes s-hub-ai-nav-orb-breathe {
  0%, 100% { transform: scale(.96); }
  50% { transform: scale(1.055); }
}

html.school-mobile-compat .preview-ai-persistent-host.is-active,
html.school-mobile-compat .preview-station-page-host {
  animation-duration: 620ms;
}

@media (max-height: 760px) {
  .app-content.tab-ai {
    min-height: 100dvh;
    display: block;
    padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  .app-content.tab-ai > .preview-ai-persistent-host.is-active {
    display: block;
    min-height: 0;
  }

  .app-content.tab-ai > .preview-ai-persistent-host.is-active > .s-hub-ai-page {
    margin-block: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .preview-ai-persistent-host.is-active,
  .preview-station-page-host,
  .bottom-nav .nav-button[data-tab="ai"] .s-hub-ai-nav-progress,
  .bottom-nav .nav-button[data-tab="ai"].is-ai-working:not(.active) svg {
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
  }
}
`

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

function patchAISpacingPolishSheet(source) {
  let next = String(source || '')
  if (next.includes('quickFillNonce')) return next

  next = replaceRequired(
    next,
    `  const [input, setInput] = useState('')`,
    `  const [input, setInput] = useState('')\n  const [quickFillNonce, setQuickFillNonce] = useState(0)`,
    'quick fill state',
  )

  next = replaceRequired(
    next,
    `  function cancelAIRequest() {`,
    `  function applyQuickQuestion(value) {\n    setInput(value)\n    setQuickFillNonce((current) => current + 1)\n  }\n\n  function cancelAIRequest() {`,
    'quick fill handler',
  )

  next = replaceRequired(
    next,
    `            <textarea\n              className={hintFading ? 'is-hint-fading' : ''}`,
    `            <textarea\n              key={\`quick-fill-${'${quickFillNonce}'}\`}\n              className={[hintFading ? 'is-hint-fading' : '', quickFillNonce ? 'is-quick-fill' : ''].filter(Boolean).join(' ')}`,
    'composer animation class',
  )

  const quickQuestions = [
    ['이번 주에 뭐 제출해야 돼?', '이번 주 제출'],
    ['내일 시간표 뭐야?', '내일 시간표'],
    ['다음 시험 언제야?', '다가오는 시험'],
    ['이번 주 시간표 바뀐 거 있어?', '시간표 변경'],
  ]

  quickQuestions.forEach(([question, label]) => {
    next = replaceRequired(
      next,
      `onClick={() => setInput('${question}')}>${label}</button>`,
      `onClick={() => applyQuickQuestion('${question}')}>${label}</button>`,
      `quick question ${label}`,
    )
  })

  return next
}

function patchAISpacingPolishSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISpacingPolishSheet(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview-only AI rhythm polish')) return current
    return `${current}\n${AI_SPACING_POLISH_CSS}`
  }
  return current
}

function patchAIContextLayoutSheet(source) {
  let next = String(source || '')
  if (next.includes('Preview AI context layout: quick info before composer.')) return next

  const academicCardEnd = `                  <span className="s-hub-ai-page-context-copy"><strong>학사일정</strong><span>{context?.academic?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>`
  const withMealCard = `                  <span className="s-hub-ai-page-context-copy"><strong>학사일정</strong><span>{context?.academic?.length || 0}개 확인 가능</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4.5 4.5v6.2a3 3 0 0 0 3 3h.5"/><path d="M7.5 4.5v15"/><path d="M15.5 4.5v6.2M19.5 4.5v6.2M15.5 8.2h4M17.5 10.7v8.8"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>급식</strong><span>{context?.meals?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>`
  next = replaceRequired(next, academicCardEnd, withMealCard, 'meal context card')

  const contentThenExtra = `        {content}\n\n        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-extra">`
  const contentIndex = next.indexOf(contentThenExtra)
  if (contentIndex < 0) throw new Error('Preview AI context/layout marker missing: composer before quick info')

  const extraStart = contentIndex + `        {content}\n\n`.length
  const extraClose = `        ) : null}\n`
  const extraEndStart = next.indexOf(extraClose, extraStart)
  if (extraEndStart < 0) throw new Error('Preview AI context/layout marker missing: quick info close')
  const extraEnd = extraEndStart + extraClose.length
  const extraBlock = next.slice(extraStart, extraEnd)
  next = `${next.slice(0, contentIndex)}        {/* Preview AI context layout: quick info before composer. */}\n${extraBlock}\n        {content}\n${next.slice(extraEnd)}`
  return next
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
    `<div className="s-hub-ai-page-title">\n            <p className="eyebrow">S-Hub AI</p>\n            <h1>{working ? '처리 중' : 'AI'}</h1>\n            <p className={['s-hub-ai-page-hero-copy', working ? 'is-working-copy' : 'is-description', working && workingMessageFading ? 'is-fading' : ''].filter(Boolean).join(' ')}>\n              {working ? workingMessage : '학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S-Hub에 추가해.'}\n            </p>\n          </div>`,
    'minimal working copy',
  )

  next = replaceRequired(
    next,
    "            <SHubAIOrb size={56} active />\n            <p className={`s-hub-ai-thinking-copy ${workingMessageFading ? 'is-fading' : ''}`.trim()}>{workingMessage}</p>",
    "            {!inline ? <SHubAIOrb size={56} active /> : null}\n            {inline ? (\n              <span className=\"s-hub-ai-working-sr\">{workingMessage}</span>\n            ) : (\n              <p className={['s-hub-ai-thinking-copy', workingMessageFading ? 'is-fading' : ''].filter(Boolean).join(' ')}>{workingMessage}</p>\n            )}",
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

function removeStalePreviewAIContentEntry(source) {
  let next = String(source || '')
  const staleEntry = `    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n`
  if (!next.includes(staleEntry)) return next

  const hasEnhancedEntry = next.includes('onWorkingChange={setAiWorking}')
    || (next.includes('context={aiContext}') && next.includes('onImportItems={importAIItems}'))
  if (!hasEnhancedEntry) {
    throw new Error('Preview AI background found the stale AI entry before the enhanced AI station was wired')
  }

  return next.replace(staleEntry, '')
}

function patchAIBackgroundSheet(source) {
  let next = String(source || '')
  if (next.includes('Preview-only background AI continuity callback.')) return next

  next = replaceRequired(
    next,
    `  inline = false,\n  onClose,`,
    `  inline = false,\n  onWorkingChange = null,\n  onClose,`,
    'working callback prop',
  )

  next = replaceRequired(
    next,
    `  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items, state.selected])`,
    `  /* Preview-only background AI continuity callback. */\n  useEffect(() => {\n    if (typeof onWorkingChange === 'function') onWorkingChange(Boolean(working))\n  }, [working, onWorkingChange])\n\n  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items, state.selected])`,
    'working callback effect',
  )

  next = replaceRequired(
    next,
    `            </p>\n          </div>\n          {working ? <button type="button" className="s-hub-ai-page-stop" onClick={cancelAIRequest}>중지</button> : null}`,
    `            </p>\n            {working ? <p className="s-hub-ai-background-note">앱을 닫지 마세요. 다른 기능은 계속 사용할 수 있어요.</p> : null}\n          </div>\n          {working ? <button type="button" className="s-hub-ai-page-stop" onClick={cancelAIRequest}>중지</button> : null}`,
    'background usage note',
  )

  return next
}

function removeHomeAITrigger(source) {
  const triggerPattern = /[ \t]*<button className="home-ai-trigger" type="button" aria-label="S-Hub AI 열기" onClick=\{onOpenAI\}>\s*<SHubAIOrb size=\{27\} \/>\s*<\/button>\n?/
  if (!triggerPattern.test(source)) return source
  return source.replace(triggerPattern, '')
}

function patchAIBackgroundMain(source) {
  let next = String(source || '')
  if (next.includes('s-hub-ai-nav-progress')) return removeStalePreviewAIContentEntry(next)

  next = replaceRequired(
    next,
    `  const [aiOpen, setAiOpen] = useState(false)`,
    `  const [aiOpen, setAiOpen] = useState(false)\n  const [aiWorking, setAiWorking] = useState(false)`,
    'app AI working state',
  )

  next = replaceRequired(
    next,
    `function PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline }) {`,
    `function PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline, onWorkingChange }) {`,
    'persistent AI page callback prop',
  )

  next = replaceRequired(
    next,
    `      onImportItems={onImportItems}\n      requireOnline={requireOnline}\n    />`,
    `      onImportItems={onImportItems}\n      requireOnline={requireOnline}\n      onWorkingChange={onWorkingChange}\n    />`,
    'forward working callback',
  )

  next = replaceRequired(
    next,
    `        onImportItems={importAIItems}\n        requireOnline={requireOnline}\n      />`,
    `        onImportItems={importAIItems}\n        requireOnline={requireOnline}\n        onWorkingChange={setAiWorking}\n      />`,
    'station AI working callback',
  )

  // Another preview layer can remove this launcher first. In that combined state,
  // removal is already complete and must not abort the build.
  next = removeHomeAITrigger(next)

  const homeLauncherMarker = `onOpenAI={() => setAiOpen(true)}`
  if (next.includes(homeLauncherMarker)) {
    next = next.replace(homeLauncherMarker, `onOpenAI={() => changeTab('ai')}`)
  }

  next = replaceRequired(
    next,
    `      <main\n        className={\`app-content tab-${'${activeTab}'}\`}\n        key={activeTab}\n        style={{ '--content-enter-x': \`${'${contentDirection * 16}px'}\` }}\n      >\n        {content[activeTab]}\n      </main>`,
    `      <main\n        className={\`app-content tab-${'${activeTab}'}\`}\n        style={{ '--content-enter-x': \`${'${contentDirection * 16}px'}\` }}\n      >\n        <div\n          className={\`preview-ai-persistent-host ${'${activeTab === \'ai\' ? \'is-active\' : \'is-background\'}'}\`}\n          hidden={activeTab !== 'ai'}\n          aria-hidden={activeTab !== 'ai'}\n        >\n          {content.ai}\n        </div>\n        {activeTab !== 'ai' ? (\n          <div className="preview-station-page-host" key={activeTab}>\n            {content[activeTab]}\n          </div>\n        ) : null}\n      </main>`,
    'persistent AI host',
  )

  const plainNavMarker = `            data-tab={tab.id}\n            className={\`nav-button ${'${activeTab === tab.id ? \'active\' : \'\'}'}\`}`
  const boardUnreadNavMarker = `            data-tab={tab.id}\n            className={\`nav-button ${'${activeTab === tab.id ? \'active\' : \'\'}'} ${'${tab.id === \'class\' && boardUnread.hasUnread ? \'has-board-unread\' : \'\'}'}\`}`
  const hasBoardUnreadNav = next.includes(boardUnreadNavMarker)
  const navMarker = hasBoardUnreadNav ? boardUnreadNavMarker : plainNavMarker
  const boardUnreadClassLine = hasBoardUnreadNav
    ? `\n              tab.id === 'class' && boardUnread.hasUnread ? 'has-board-unread' : '',`
    : ''
  const navReplacement = `            data-tab={tab.id}\n            className={[\n              'nav-button',\n              activeTab === tab.id ? 'active' : '',\n              tab.id === 'ai' && aiWorking ? 'is-ai-working' : '',` + boardUnreadClassLine + `\n            ].filter(Boolean).join(' ')}`

  next = replaceRequired(
    next,
    navMarker,
    navReplacement,
    'AI nav working state',
  )

  next = replaceRequired(
    next,
    `            <Icon type={tab.id} />\n            <span>{tab.label}</span>`,
    `            <Icon type={tab.id} />\n            <span>{tab.label}</span>\n            {tab.id === 'ai' && aiWorking ? <span className="s-hub-ai-nav-progress" aria-hidden="true" /> : null}`,
    'AI nav progress node',
  )

  return removeStalePreviewAIContentEntry(next)
}

export function patchPreviewAIStageMotionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  let next = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAISheet(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview-only AI state motion. One persistent stage')) next = `${next}\n${AI_STAGE_MOTION_CSS}`
  }

  next = patchAISpacingPolishSource(next, id)
  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAIContextLayoutSheet(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview AI context layout: reference tools first, composer last.')) next = `${next}\n${AI_CONTEXT_LAYOUT_CSS}`
  }

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAIBackgroundSheet(next)
  } else if (cleanId.endsWith('/main.jsx')) {
    next = patchAIBackgroundMain(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview-only AI continuity: keep the one AI session alive')) next = `${next}\n${AI_BACKGROUND_CSS}`
  }
  return next
}
