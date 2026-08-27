from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    write(path, text.replace(old, new, 1))

sheet = 'src/s-hub-ai-sheet.jsx'
css = 'src/s-hub-ai.css'

# Keep the working orb present but not oversized: larger than the earlier 38px draft,
# still comfortably below the old intrusive 64px treatment.
replace_once(sheet, '<SHubAIOrb size={38} active />', '<SHubAIOrb size={48} active />')
replace_once('tests/reminder-original-scroll-ai-orb.test.js', "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{38\\} active/)", "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{48\\} active/)")
replace_once('tests/s-hub-ai-working-stage.test.js', "assert.match(sheet, /<SHubAIOrb size=\\{38\\} active/)", "assert.match(sheet, /<SHubAIOrb size=\\{48\\} active/)")

replace_once(sheet,
"  const [workingMessageFading, setWorkingMessageFading] = useState(false)\n",
"  const [workingMessageFading, setWorkingMessageFading] = useState(false)\n  const [workingFinishing, setWorkingFinishing] = useState(false)\n")

replace_once(sheet,
"    setWorkingMessageFading(false)\n  }, [open])\n",
"    setWorkingMessageFading(false)\n    setWorkingFinishing(false)\n  }, [open])\n")

replace_once(sheet,
"    setWorking(false)\n    setWorkingMessageFading(false)\n  }\n\n  function showWorkingMode(mode) {\n    setWorkingMode(mode)\n    setWorkingMessageIndex(0)\n    setWorkingMessageFading(false)\n  }\n",
"    setWorking(false)\n    setWorkingMessageFading(false)\n    setWorkingFinishing(false)\n  }\n\n  function showWorkingMode(mode) {\n    setWorkingMode(mode)\n    setWorkingMessageIndex(0)\n    setWorkingMessageFading(false)\n    setWorkingFinishing(false)\n  }\n\n  async function finishWorkingStage(requestId) {\n    if (requestSequenceRef.current !== requestId) return false\n    setWorkingFinishing(true)\n    setWorkingMessageFading(true)\n    await new Promise((resolve) => window.setTimeout(resolve, 240))\n    return requestSequenceRef.current === requestId\n  }\n")

# Empty-result completion still gets the same visual handoff.
replace_once(sheet,
"      if (!result.items.length) {\n        setState((current) => ({ ...current, mode: 'import', items: [], selected: {}, conflicts: {}, resolutions: {} }))\n",
"      if (!result.items.length) {\n        if (!await finishWorkingStage(requestId)) return\n        setState((current) => ({ ...current, mode: 'import', items: [], selected: {}, conflicts: {}, resolutions: {} }))\n")

# Successful notice analysis: finish the working visual before revealing the review result.
replace_once(sheet,
"      if (requestSequenceRef.current !== requestId) return\n      const choices = applyConflictSelection(items, conflicts)\n",
"      if (requestSequenceRef.current !== requestId) return\n      if (!await finishWorkingStage(requestId)) return\n      const choices = applyConflictSelection(items, conflicts)\n")

# Question answer gets the same handoff.
replace_once(sheet,
"      if (requestSequenceRef.current !== requestId) return\n      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))\n",
"      if (requestSequenceRef.current !== requestId) return\n      if (!await finishWorkingStage(requestId)) return\n      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))\n")

# Ensure the finishing class is driven by state and then cleared when the request fully resolves.
replace_once(sheet,
"          <div className=\"s-hub-ai-thinking-stage\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\">\n",
"          <div className={`s-hub-ai-thinking-stage ${workingFinishing ? 'is-finishing' : ''}`.trim()} role=\"status\" aria-live=\"polite\" aria-atomic=\"true\">\n")

# There are two request finally blocks; both should clear the finishing state when their active request ends.
text = read(sheet)
old = "        setWorking(false)\n        if (requestControllerRef.current === controller) requestControllerRef.current = null\n"
count = text.count(old)
if count != 2:
    raise SystemExit(f'{sheet}: expected two active-request finalizers, found {count}')
text = text.replace(old, "        setWorking(false)\n        setWorkingFinishing(false)\n        if (requestControllerRef.current === controller) requestControllerRef.current = null\n")
write(sheet, text)

replace_once(css,
"  min-height: 118px;\n",
"  min-height: 128px;\n")

append_css = """

.s-hub-ai-thinking-stage .s-hub-ai-orb {
  opacity: 1;
  transform: scale(1);
  transition: opacity 240ms var(--motion-soft), transform 240ms var(--motion-soft);
}

.s-hub-ai-thinking-stage.is-finishing .s-hub-ai-orb {
  opacity: 0.34;
  transform: scale(0.72);
}

.s-hub-ai-thinking-stage.is-finishing .s-hub-ai-thinking-copy {
  opacity: 0;
  transform: translate3d(0, 2px, 0);
}

.s-hub-ai-answer,
.s-hub-ai-import,
.s-hub-ai-save-result {
  animation: s-hub-ai-result-reveal 380ms var(--motion-ease) both;
}

@keyframes s-hub-ai-result-reveal {
  from {
    opacity: 0;
    transform: translate3d(0, 7px, 0) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .s-hub-ai-thinking-stage .s-hub-ai-orb,
  .s-hub-ai-thinking-copy {
    transition: none;
  }

  .s-hub-ai-answer,
  .s-hub-ai-import,
  .s-hub-ai-save-result {
    animation: none;
  }
}
"""
css_text = read(css)
if 's-hub-ai-result-reveal' in css_text:
    raise SystemExit('result reveal CSS already exists')
write(css, css_text.rstrip() + append_css + '\n')

# Strengthen the new regression guard for the visual handoff.
test_path = 'tests/s-hub-ai-working-stage.test.js'
test_text = read(test_path)
addition = """

test('working stage contracts before completed AI results reveal smoothly', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /workingFinishing/)
  assert.match(sheet, /finishWorkingStage\(requestId\)/)
  assert.match(sheet, /window\.setTimeout\(resolve, 240\)/)
  assert.match(sheet, /s-hub-ai-thinking-stage \$\{workingFinishing \? 'is-finishing' : ''\}/)
  assert.match(css, /\.s-hub-ai-thinking-stage\.is-finishing \.s-hub-ai-orb/)
  assert.match(css, /@keyframes s-hub-ai-result-reveal/)
  assert.match(css, /\.s-hub-ai-answer,[\s\S]*?\.s-hub-ai-import,[\s\S]*?animation: s-hub-ai-result-reveal 380ms/)
})
"""
if 'working stage contracts before completed AI results reveal smoothly' in test_text:
    raise SystemExit('working transition regression test already exists')
write(test_path, test_text.rstrip() + addition + '\n')

print('S-Hub AI result transition refinement applied')
