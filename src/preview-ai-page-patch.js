const AI_PAGE_CSS = `
/* Preview-only full S-Hub AI page. Reuses the existing AI workflow; only the container changes. */
.s-hub-ai-page {
  width: min(100%, 720px);
  margin: 0 auto;
  padding: 2px 0 8px;
}

.s-hub-ai-page-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin: 0 0 14px;
}

.s-hub-ai-page-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: inset 0 1px 0 var(--specular-edge);
  color: var(--text);
}

.s-hub-ai-page-title {
  min-width: 0;
}

.s-hub-ai-page-title .eyebrow {
  margin: 0 0 3px;
}

.s-hub-ai-page-title h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(26px, 5vw, 34px);
  line-height: 1.05;
  letter-spacing: -.045em;
}

.s-hub-ai-page-title p:last-child {
  max-width: 520px;
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: -.018em;
}

.s-hub-ai-page-stop {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 680;
}

.s-hub-ai-page-capabilities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 12px;
}

.s-hub-ai-page-capability {
  min-width: 0;
  min-height: 78px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
}

.s-hub-ai-page-capability-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--surface-soft);
  color: var(--text-secondary);
}

.s-hub-ai-page-capability-icon svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.s-hub-ai-page-capability-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.s-hub-ai-page-capability-copy strong {
  color: var(--text);
  font-size: 12.5px;
  font-weight: 720;
  letter-spacing: -.02em;
}

.s-hub-ai-page-capability-copy span {
  color: var(--text-tertiary);
  font-size: 10.5px;
  line-height: 1.35;
}

.s-hub-ai-page > .s-hub-ai-content {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: inset 0 1px 0 var(--specular-edge), var(--shadow-soft);
}

.s-hub-ai-page > .s-hub-ai-content .s-hub-ai-compose textarea {
  min-height: 116px;
  background: var(--surface-soft);
}

.s-hub-ai-page > .s-hub-ai-content .s-hub-ai-thinking-stage {
  min-height: 188px;
}

@media (max-width: 560px) {
  .s-hub-ai-page-hero {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .s-hub-ai-page-stop {
    grid-column: 1 / -1;
    width: 100%;
  }

  .s-hub-ai-page-capabilities {
    grid-template-columns: 1fr;
  }

  .s-hub-ai-page-capability {
    min-height: 58px;
  }

  .s-hub-ai-page > .s-hub-ai-content {
    padding: 15px;
    border-radius: 21px;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI page marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview AI page range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function patchAISheetSource(source) {
  let next = String(source || '')
  if (next.includes('Preview-only inline S-Hub AI page mode.')) return next

  next = replaceRequired(
    next,
    `export function SchoolAISheet({\n  open,`,
    `export function SchoolAISheet({\n  open,\n  inline = false,`,
    'inline prop',
  )

  next = replaceRequired(
    next,
    `  function close() {\n    if (saving) return\n    cancelAIRequest()\n    onClose()\n  }`,
    `  function close() {\n    if (saving) return\n    cancelAIRequest()\n    if (inline) {\n      startOver()\n      return\n    }\n    onClose()\n  }`,
    'inline completion behavior',
  )

  const returnStartMarker = `  return (\n    <UnifiedBottomSheet`
  const contentStartMarker = `      <div className="s-hub-ai-content">`
  const returnEndMarker = `      </div>\n    </UnifiedBottomSheet>\n  )\n}`
  const returnStart = next.indexOf(returnStartMarker)
  const contentStart = next.indexOf(contentStartMarker, returnStart)
  const returnEnd = next.indexOf(returnEndMarker, contentStart)
  if (returnStart < 0 || contentStart < 0 || returnEnd < 0) {
    throw new Error('Preview AI page range missing: AI sheet render wrapper')
  }

  const bodyStart = contentStart + contentStartMarker.length
  const body = next.slice(bodyStart, returnEnd)
  const replacement = `  /* Preview-only inline S-Hub AI page mode. The exact same workflow powers sheet and page. */\n  const content = (\n    <div className={\`s-hub-ai-content ${'${inline ? \'is-page\' : \'\'}'}\`.trim()}>${body}    </div>\n  )\n\n  if (inline) {\n    return (\n      <section className="s-hub-ai-page" aria-label="S-Hub AI">\n        <header className="s-hub-ai-page-hero">\n          <div className="s-hub-ai-page-mark" aria-hidden="true"><SHubAIOrb size={42} active={working} /></div>\n          <div className="s-hub-ai-page-title">\n            <p className="eyebrow">S-Hub AI</p>\n            <h1>AI</h1>\n            <p>학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S-Hub에 추가해.</p>\n          </div>\n          {working ? <button type="button" className="s-hub-ai-page-stop" onClick={cancelAIRequest}>중지</button> : null}\n        </header>\n\n        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-capabilities" aria-label="S-Hub AI 기능">\n            <div className="s-hub-ai-page-capability">\n              <span className="s-hub-ai-page-capability-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"/><path d="M8 9.5h8M8 13h5"/></svg></span>\n              <span className="s-hub-ai-page-capability-copy"><strong>학교 정보 질문</strong><span>시간표·시험·리마인더를 바로 물어봐.</span></span>\n            </div>\n            <div className="s-hub-ai-page-capability">\n              <span className="s-hub-ai-page-capability-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/><path d="m9.5 16 2.2-2.2 1.8 1.8 2-2"/></svg></span>\n              <span className="s-hub-ai-page-capability-copy"><strong>공지·파일 분석</strong><span>사진, PDF와 파일을 최대 4개까지 확인해.</span></span>\n            </div>\n            <div className="s-hub-ai-page-capability">\n              <span className="s-hub-ai-page-capability-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M4 9h16M12 12v5M9.5 14.5h5"/></svg></span>\n              <span className="s-hub-ai-page-capability-copy"><strong>일정으로 바로 추가</strong><span>충돌을 확인하고 리마인더·시간표·학사일정에 저장해.</span></span>\n            </div>\n          </div>\n        ) : null}\n\n        {content}\n      </section>\n    )\n  }\n\n  return (\n    <UnifiedBottomSheet\n      open={open}\n      onClose={close}\n      closeDisabled={saving}\n      title="S-Hub AI"\n      subtitle="학교 정보를 물어보거나 공지 캡처를 넣어줘."\n      ariaLabel="S-Hub AI"\n      className="s-hub-ai-sheet"\n    >\n      {content}\n    </UnifiedBottomSheet>\n  )\n}`

  return `${next.slice(0, returnStart)}${replacement}${next.slice(returnEnd + returnEndMarker.length)}`
}

function patchMainSource(source) {
  let next = String(source || '')
  if (next.includes('Preview-only full AI station page.')) return next

  const pageComponent = `/* Preview-only full AI station page. */\nfunction PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline }) {\n  return (\n    <SchoolAISheet\n      inline\n      open={true}\n      now={now}\n      context={context}\n      conflictContext={conflictContext}\n      onImportItems={onImportItems}\n      requireOnline={requireOnline}\n    />\n  )\n}\n\n`

  next = spliceRequired(
    next,
    'function PreviewAIPage({ onOpenAI }) {',
    '/* Preview-only schedule segment: intentionally reuses useClassTopSegmentSpring. */',
    pageComponent,
    'AI station component',
  )

  next = replaceRequired(
    next,
    `    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,`,
    `    ai: (\n      <PreviewAIPage\n        now={now}\n        context={aiContext}\n        conflictContext={aiConflictContext}\n        onImportItems={importAIItems}\n        requireOnline={requireOnline}\n      />\n    ),`,
    'AI station props',
  )

  next = next.replace(/^[ \t]*if \(nextTab === 'ai'\) setAiOpen\(true\)\n/gm, '')
  return next
}

export function patchPreviewAIPageSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview-only full S-Hub AI page.')) return current
    return `${current}\n${AI_PAGE_CSS}`
  }
  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheetSource(current)
  if (cleanId.endsWith('/main.jsx')) return patchMainSource(current)
  return current
}
