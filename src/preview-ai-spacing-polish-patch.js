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

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI spacing marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchAISheet(source) {
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

export function patchPreviewAISpacingPolishSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheet(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview-only AI rhythm polish')) return current
    return `${current}\n${AI_SPACING_POLISH_CSS}`
  }
  return current
}
