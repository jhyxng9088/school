const AI_BACKGROUND_CSS = String.raw`
/* Preview-only AI continuity: keep the one AI session alive while other stations are visible. */
.app-content.tab-ai {
  min-height: calc(100dvh - var(--nav-bottom) - 64px);
}

.preview-ai-persistent-host {
  width: 100%;
}

.preview-ai-persistent-host.is-active {
  min-height: inherit;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.preview-ai-persistent-host.is-active > .s-hub-ai-page {
  margin-block: auto;
}

.preview-ai-persistent-host[hidden] {
  display: none !important;
}

.s-hub-ai-background-note {
  margin: 5px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
}

.nav-button[data-tab="ai"] {
  position: relative;
}

.nav-button[data-tab="ai"] .s-hub-ai-nav-progress {
  position: absolute;
  z-index: 5;
  top: 6px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  pointer-events: none;
  animation: s-hub-ai-nav-progress-pulse 1.2s ease-in-out infinite;
}

.bottom-nav .nav-button[data-tab="ai"].is-ai-working:not(.active) svg {
  animation: s-hub-ai-nav-working 1.8s cubic-bezier(.16, 1, .3, 1) infinite;
  transform-origin: 50% 50%;
}

@keyframes s-hub-ai-nav-progress-pulse {
  0%, 100% { opacity: .28; transform: scale(.82); }
  50% { opacity: .9; transform: scale(1.08); }
}

@keyframes s-hub-ai-nav-working {
  0%, 100% { transform: scale(1); opacity: .72; }
  50% { transform: scale(1.08); opacity: 1; }
}

@media (max-height: 760px) {
  .app-content.tab-ai {
    min-height: 0;
    padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  .preview-ai-persistent-host.is-active {
    min-height: 0;
    justify-content: flex-start;
  }

  .preview-ai-persistent-host.is-active > .s-hub-ai-page {
    margin-block: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav .nav-button[data-tab="ai"] .s-hub-ai-nav-progress,
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
    `  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items])`,
    `  /* Preview-only background AI continuity callback. */\n  useEffect(() => {\n    if (typeof onWorkingChange === 'function') onWorkingChange(Boolean(working))\n  }, [working, onWorkingChange])\n\n  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items])`,
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

function patchMain(source) {
  let next = String(source || '')
  if (next.includes('s-hub-ai-nav-progress')) return next

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

  // The home launcher may already have been removed by another preview-only layer.
  // Treat that state as complete instead of failing the combined build.
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