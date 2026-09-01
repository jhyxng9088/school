const AI_BACKGROUND_CSS = `
/* Preview-only AI continuity: keep the one AI session alive while other stations are used. */
.preview-ai-persistent-host[hidden] {
  display: none !important;
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

.bottom-nav .nav-button[data-tab="ai"].is-ai-working::after {
  content: "";
  position: absolute;
  top: 8px;
  left: calc(50% + 9px);
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  pointer-events: none;
  animation: s-hub-ai-nav-working 1.55s ease-in-out infinite;
}

.bottom-nav .nav-button[data-tab="ai"].is-ai-working:not(.active) svg {
  animation: s-hub-ai-nav-orb-breathe 1.9s ease-in-out infinite;
  transform-origin: 50% 50%;
}

@keyframes s-hub-ai-nav-working {
  0%, 100% {
    opacity: .34;
    transform: scale(.78);
  }
  50% {
    opacity: .96;
    transform: scale(1.08);
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

@media (prefers-reduced-motion: reduce) {
  .preview-ai-persistent-host.is-active,
  .preview-station-page-host,
  .bottom-nav .nav-button[data-tab="ai"].is-ai-working::after,
  .bottom-nav .nav-button[data-tab="ai"].is-ai-working:not(.active) svg {
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI background marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchAISheet(source) {
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

function patchMain(source) {
  let next = String(source || '')
  if (next.includes('preview-ai-persistent-host')) return next

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

  next = replaceRequired(
    next,
    `        onOpenAI={() => setAiOpen(true)}`,
    `        onOpenAI={() => changeTab('ai')}`,
    'home launcher uses persistent AI station',
  )

  next = replaceRequired(
    next,
    `      <main\n        className={\`app-content tab-${'${activeTab}'}\`}\n        key={activeTab}\n        style={{ '--content-enter-x': \`${'${contentDirection * 16}px'}\` }}\n      >\n        {content[activeTab]}\n      </main>`,
    `      <main\n        className={\`app-content tab-${'${activeTab}'}\`}\n        style={{ '--content-enter-x': \`${'${contentDirection * 16}px'}\` }}\n      >\n        <div\n          className={\`preview-ai-persistent-host ${'${activeTab === \'ai\' ? \'is-active\' : \'is-background\'}'}\`}\n          hidden={activeTab !== 'ai'}\n          aria-hidden={activeTab !== 'ai'}\n        >\n          {content.ai}\n        </div>\n        {activeTab !== 'ai' ? (\n          <div className="preview-station-page-host" key={activeTab}>\n            {content[activeTab]}\n          </div>\n        ) : null}\n      </main>`,
    'persistent AI host',
  )

  next = replaceRequired(
    next,
    `            data-tab={tab.id}\n            className={\`nav-button ${'${activeTab === tab.id ? \'active\' : \'\'}'}\`}`,
    `            data-tab={tab.id}\n            className={[\n              'nav-button',\n              activeTab === tab.id ? 'active' : '',\n              tab.id === 'ai' && aiWorking ? 'is-ai-working' : '',\n            ].filter(Boolean).join(' ')}`,
    'AI nav working state',
  )

  return next
}

export function patchPreviewAIBackgroundSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheet(current)
  if (cleanId.endsWith('/main.jsx')) return patchMain(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview-only AI continuity: keep the one AI session alive')) return current
    return `${current}\n${AI_BACKGROUND_CSS}`
  }
  return current
}
