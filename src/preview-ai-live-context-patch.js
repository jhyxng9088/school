const LIVE_CONTEXT_CSS = `
/* Preview AI live sources: six truthful S-Hub data cards. */
.s-hub-ai-page-context {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.s-hub-ai-page-context-item + .s-hub-ai-page-context-item {
  border-left: 0;
}

.s-hub-ai-page-context-item:not(:nth-child(3n + 1)) {
  border-left: 1px solid var(--divider);
}

.s-hub-ai-page-context-item:nth-child(n + 4) {
  border-top: 1px solid var(--divider);
}

.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(5) { animation-delay: 690ms; }
.s-hub-ai-page-stage.is-compose .s-hub-ai-page-context-item:nth-child(6) { animation-delay: 730ms; }
.s-hub-ai-page-stage.is-compose > .s-hub-ai-content { animation-delay: 790ms; }

@media (max-width: 560px) {
  .s-hub-ai-page-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .s-hub-ai-page-context-item:not(:nth-child(3n + 1)) {
    border-left: 0;
  }

  .s-hub-ai-page-context-item:nth-child(n + 4) {
    border-top: 0;
  }

  .s-hub-ai-page-context-item:nth-child(even) {
    border-left: 1px solid var(--divider);
  }

  .s-hub-ai-page-context-item:nth-child(n + 3) {
    border-top: 1px solid var(--divider);
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI live context marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchMain(source) {
  let next = String(source || '')
  if (!next.includes("loadPreviewAIContext")) {
    next = replaceRequired(
      next,
      "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n",
      "import { buildSchoolAIContext } from './s-hub-ai-core.js'\nimport { loadPreviewAIContext } from './preview-ai-live-context.js'\n",
      'main live context import',
    )
  }

  next = next.replace(
    `function PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline }) {`,
    `function PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline, loadContext }) {`,
  )
  next = next.replace(
    `      context={context}\n      conflictContext={conflictContext}`,
    `      context={context}\n      loadContext={loadContext}\n      conflictContext={conflictContext}`,
  )
  next = next.replaceAll(
    `        context={aiContext}\n        conflictContext={aiConflictContext}`,
    `        context={aiContext}\n        loadContext={loadPreviewAIContext}\n        conflictContext={aiConflictContext}`,
  )
  return next
}

function patchAISheet(source) {
  let next = String(source || '')
  if (!next.includes('loadContext = null')) {
    next = replaceRequired(
      next,
      `  context,\n  conflictContext = context,`,
      `  context,\n  loadContext = null,\n  conflictContext = context,`,
      'AI sheet live context prop',
    )
  }

  if (!next.includes('async function resolveQuestionContext(')) {
    next = replaceRequired(
      next,
      `  async function askAttachmentQuestion() {`,
      `  async function resolveQuestionContext(question, signal) {\n    if (typeof loadContext !== 'function') return context\n    try {\n      return await loadContext({ question, context, signal })\n    } catch (requestError) {\n      if (signal?.aborted || requestError?.name === 'AbortError') throw requestError\n      console.warn('S-Hub AI live context fallback:', requestError)\n      return context\n    }\n  }\n\n  async function askAttachmentQuestion() {`,
      'live context resolver',
    )
  }

  next = replaceRequired(
    next,
    `      const result = await answerAndAnalyzeSchoolAttachments({ question, files, context, conflictContext, now, signal: controller.signal })`,
    `      const questionContext = await resolveQuestionContext(question, controller.signal)\n      if (requestSequenceRef.current !== requestId) return\n      const result = await answerAndAnalyzeSchoolAttachments({ question, files, context: questionContext, conflictContext, now, signal: controller.signal })`,
    'attachment live context',
  )

  next = replaceRequired(
    next,
    `      const result = await askSchoolHub({ question, context, now, signal: controller.signal })`,
    `      const questionContext = await resolveQuestionContext(question, controller.signal)\n      if (requestSequenceRef.current !== requestId) return\n      const result = await askSchoolHub({ question, context: questionContext, now, signal: controller.signal })`,
    'question live context',
  )

  if (!next.includes('<strong>스터디</strong><span>실시간 조회</span>')) {
    next = replaceRequired(
      next,
      `                  <span className="s-hub-ai-page-context-copy"><strong>급식</strong><span>{context?.meals?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>`,
      `                  <span className="s-hub-ai-page-context-copy"><strong>급식</strong><span>{context?.meals?.length || 0}개 확인 가능</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 18.5h14M7 15l3-3 2.4 2.2L17 9.5"/><path d="M7 5.5h10a2 2 0 0 1 2 2v11H5v-11a2 2 0 0 1 2-2Z"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>스터디</strong><span>실시간 조회</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h5"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>게시판</strong><span>실시간 조회</span></span>\n                </div>\n              </div>`,
      'study and board context cards',
    )
  }
  return next
}

function patchAIEngine(source) {
  let next = String(source || '')
  if (!next.includes('study.class.students의 rank는')) {
    next = replaceRequired(
      next,
      `SCHOOL_DATA에 없는 일정, 날짜, 과목, 준비물, 시험을 추측하거나 만들어내지 마라.\n찾을 수 없으면 반드시 'S-Hub에 등록된 정보에서는 찾을 수 없어.'라고 분명히 말해라.`,
      `SCHOOL_DATA에 없는 일정, 날짜, 과목, 준비물, 시험을 추측하거나 만들어내지 마라.\nstudy.class.students의 rank는 현재 S-Hub 스터디 화면과 같은 오늘 우리반 순위이며, totalSeconds에는 진행 중인 공부 시간도 반영되어 있다.\nstudy.school이 있으면 전교 스터디 순위다. board.posts는 현재 학생이 S-Hub 게시판에서 볼 수 있는 같은 반 게시글이다.\nliveSources의 값이 unavailable이면 해당 정보가 없는 것으로 단정하지 말고 '현재 해당 S-Hub 정보를 불러오지 못했어.'라고 설명해라.\n필요한 liveSources가 ok인데도 해당 데이터에서 찾을 수 없을 때만 'S-Hub에 등록된 정보에서는 찾을 수 없어.'라고 말해라.`,
      'question live source rules',
    )
  }

  if (!next.includes('스터디·게시판처럼 실시간으로 바뀌는 질문')) {
    next = replaceRequired(
      next,
      `  return /(?:지금|현재|몇\\s*시|몇\\s*분|다음\\s*교시|곧|방금)/i.test(text) ? '' : 'school-question'`,
      `  return /(?:지금|현재|몇\\s*시|몇\\s*분|다음\\s*교시|곧|방금|스터디|공부|랭킹|순위|\\d+\\s*등|게시판|게시글|댓글)/i.test(text)\n    ? '' // 스터디·게시판처럼 실시간으로 바뀌는 질문은 응답 캐시를 사용하지 않는다.\n    : 'school-question'`,
      'dynamic question cache scope',
    )
  }

  if (!next.includes('liveSources가 unavailable인 경우')) {
    next = replaceRequired(
      next,
      `- 필요한 정보가 없으면 무엇을 확인할 수 없는지 분명하게 말한다.`,
      `- 필요한 정보가 없으면 무엇을 확인할 수 없는지 분명하게 말한다.\n- liveSources가 unavailable인 경우 데이터가 없다고 단정하지 말고 현재 불러오지 못했다고 설명한다.\n- study와 board가 있으면 첨부 질문에서도 기존 S-Hub의 스터디·게시판 정보로 함께 취급한다.`,
      'attachment live source rules',
    )
  }
  return next
}

export function patchPreviewAILiveContextSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/main.jsx')) return patchMain(current)
  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheet(current)
  if (cleanId.endsWith('/s-hub-ai-engine.js')) return patchAIEngine(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview AI live sources: six truthful S-Hub data cards.')) return current
    return `${current}\n${LIVE_CONTEXT_CSS}`
  }
  return current
}
