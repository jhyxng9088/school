const AI_DENSITY_CSS = `
/* Preview-only useful density below the AI composer. */
.s-hub-ai-page-extra {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.s-hub-ai-page-extra-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 0 2px;
}

.s-hub-ai-page-extra-head strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 720;
  letter-spacing: -.025em;
}

.s-hub-ai-page-extra-head span {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.35;
  text-align: right;
}

.s-hub-ai-page-quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.s-hub-ai-page-quick {
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: -.02em;
  text-align: left;
  cursor: pointer;
  transition: transform 220ms var(--motion-ease), background-color 260ms var(--motion-soft), color 260ms var(--motion-soft);
}

.s-hub-ai-page-quick::after {
  content: '›';
  flex: none;
  color: var(--text-tertiary);
  font-size: 17px;
  font-weight: 400;
  line-height: 1;
  transform: translateY(-1px);
}

.s-hub-ai-page-quick:active {
  transform: scale(.985);
  background: var(--surface-soft);
}

.s-hub-ai-page-context {
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: inset 0 1px 0 var(--specular-edge);
}

.s-hub-ai-page-context-item {
  min-width: 0;
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
}

.s-hub-ai-page-context-item + .s-hub-ai-page-context-item {
  border-left: 1px solid var(--divider);
}

.s-hub-ai-page-context-icon {
  width: 31px;
  height: 31px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--surface-soft);
  color: var(--text-secondary);
}

.s-hub-ai-page-context-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.s-hub-ai-page-context-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.s-hub-ai-page-context-copy strong {
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s-hub-ai-page-context-copy span {
  color: var(--text-tertiary);
  font-size: 10.5px;
  line-height: 1.3;
}

@media (min-width: 700px) and (min-height: 820px) {
  .s-hub-ai-page-extra {
    margin-top: 20px;
    gap: 16px;
  }

  .s-hub-ai-page-context-item {
    min-height: 80px;
  }
}

@media (max-width: 560px) {
  .s-hub-ai-page-extra {
    margin-top: 14px;
    gap: 12px;
  }

  .s-hub-ai-page-extra-head span {
    display: none;
  }

  .s-hub-ai-page-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .s-hub-ai-page-quick {
    min-height: 46px;
    padding: 0 12px;
  }

  .s-hub-ai-page-context-item {
    min-height: 68px;
    gap: 7px;
    padding: 10px 9px;
  }

  .s-hub-ai-page-context-icon {
    width: 27px;
    height: 27px;
    border-radius: 9px;
  }

  .s-hub-ai-page-context-icon svg {
    width: 14px;
    height: 14px;
  }

  .s-hub-ai-page-context-copy strong {
    font-size: 11px;
  }

  .s-hub-ai-page-context-copy span {
    font-size: 9.5px;
  }
}
`

function patchAISheet(source) {
  const current = String(source || '')
  if (current.includes('s-hub-ai-page-extra')) return current

  const marker = `        {content}\n      </section>`
  if (!current.includes(marker)) {
    throw new Error('Preview AI density marker changed unexpectedly')
  }

  const replacement = `        {content}\n\n        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-extra">\n            <section aria-label="빠른 질문">\n              <div className="s-hub-ai-page-extra-head">\n                <strong>빠른 질문</strong>\n                <span>자주 확인하는 학교 정보를 바로 입력할 수 있어요.</span>\n              </div>\n              <div className="s-hub-ai-page-quick-grid">\n                <button type="button" className="s-hub-ai-page-quick" onClick={() => setInput('이번 주에 뭐 제출해야 돼?')}>이번 주 제출</button>\n                <button type="button" className="s-hub-ai-page-quick" onClick={() => setInput('내일 시간표 뭐야?')}>내일 시간표</button>\n                <button type="button" className="s-hub-ai-page-quick" onClick={() => setInput('다음 시험 언제야?')}>다가오는 시험</button>\n                <button type="button" className="s-hub-ai-page-quick" onClick={() => setInput('이번 주 시간표 바뀐 거 있어?')}>시간표 변경</button>\n              </div>\n            </section>\n\n            <section aria-label="AI가 참고하는 정보">\n              <div className="s-hub-ai-page-extra-head">\n                <strong>AI가 참고하는 정보</strong>\n                <span>현재 S-Hub에 저장된 정보를 기준으로 답변합니다.</span>\n              </div>\n              <div className="s-hub-ai-page-context">\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M8 3v3M16 3v3M4 9h16M8 13h3M8 16.5h6"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>시간표</strong><span>{context?.timetable?.length || 0}일 확인 가능</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z"/><path d="M8 3v4M16 3v4M8 11h8M8 15h5"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>리마인더</strong><span>{context?.reminders?.length || 0}개 예정</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>학사일정</strong><span>{context?.academic?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>\n            </section>\n          </div>\n        ) : null}\n      </section>`

  return current.replace(marker, replacement)
}

export function patchPreviewAIDensitySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheet(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview-only useful density below the AI composer.')) return current
    return `${current}\n${AI_DENSITY_CSS}`
  }
  return current
}
