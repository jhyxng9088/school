from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


background_path = Path('src/preview-ai-background-patch.js')
background = background_path.read_text()
stage_path = Path('src/preview-ai-stage-motion-patch.js')
stage = stage_path.read_text()

# Fold the exact background continuity CSS into the existing AI presentation owner.
css_prefix = 'const AI_BACKGROUND_CSS = `'
css_start = background.index(css_prefix) + len(css_prefix)
css_end = background.index('`\n\nfunction replaceRequired', css_start)
background_css = background[css_start:css_end]
if 'Preview-only AI continuity: keep the one AI session alive while other stations are used.' not in background_css:
    raise SystemExit('AI background CSS marker missing')
stage = replace_once(
    stage,
    'const AI_STAGE_MOTION_CSS = `',
    f'const AI_BACKGROUND_CSS = `{background_css}`\n\nconst AI_STAGE_MOTION_CSS = `',
    'AI background CSS ownership',
)

# Reuse the stage owner's replaceRequired helper and fold the exact downstream
# background helpers into the stage owner without changing their behavior.
helpers_start = background.index('export function removeStalePreviewAIContentEntry(source) {')
helpers_end = background.index('\n\nexport function patchPreviewAIBackgroundSource', helpers_start)
helpers = background[helpers_start:helpers_end]
helpers = helpers.replace('export function removeStalePreviewAIContentEntry', 'function removeStalePreviewAIContentEntry', 1)
helpers = helpers.replace('function patchAISheet(source) {', 'function patchAIBackgroundSheet(source) {', 1)
helpers = helpers.replace('function patchMain(source) {', 'function patchAIBackgroundMain(source) {', 1)
stage = replace_once(
    stage,
    '\nexport function patchPreviewAIStageMotionSource(source, id = \'\') {',
    f'\n{helpers}\n\nexport function patchPreviewAIStageMotionSource(source, id = \'\') {{',
    'AI background helper ownership',
)

old_tail = """  next = patchAISpacingPolishSource(next, id)
  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAIContextLayoutSheet(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview AI context layout: reference tools first, composer last.')) next = `${next}\\n${AI_CONTEXT_LAYOUT_CSS}`
  }
  return next
}"""
new_tail = """  next = patchAISpacingPolishSource(next, id)
  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAIContextLayoutSheet(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview AI context layout: reference tools first, composer last.')) next = `${next}\\n${AI_CONTEXT_LAYOUT_CSS}`
  }

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {
    next = patchAIBackgroundSheet(next)
  } else if (cleanId.endsWith('/main.jsx')) {
    next = patchAIBackgroundMain(next)
  } else if (cleanId.endsWith('/s-hub-ai.css')) {
    if (!next.includes('Preview-only AI continuity: keep the one AI session alive')) next = `${next}\\n${AI_BACKGROUND_CSS}`
  }
  return next
}"""
stage = replace_once(stage, old_tail, new_tail, 'AI background execution ownership')
stage_path.write_text(stage)

# Retire the direct Vite leg.
vite_path = Path('vite.config.js')
vite = vite_path.read_text()
vite = replace_once(vite, "import { patchPreviewAIBackgroundSource } from './src/preview-ai-background-patch.js'\n", '', 'vite AI background import')
vite = replace_once(vite, '  next = patchPreviewAIBackgroundSource(next, cleanId)\n', '', 'vite AI background call')
vite = replace_once(vite, "        || cleanId.endsWith('/preview-ai-background-patch.js')\n", '', 'vite AI background exclusion')
vite_path.write_text(vite)

# Keep direct-effect inventory aligned with the remaining Vite graph.
build_effect_path = Path('tests/build-patch-effect.test.js')
build_effect = build_effect_path.read_text()
build_effect = replace_once(
    build_effect,
    "  ['patchPreviewAIBackgroundSource', 'preview-ai-background-patch.js'],\n",
    '',
    'build effect retired AI background owner',
)
build_effect_path.write_text(build_effect)

# Verify the consolidated owner directly.
background_test_path = Path('tests/preview-ai-background.test.js')
background_test_path.write_text("""import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

function builtSheet() {
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  return patchPreviewAIStageMotionSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
}

function representativeMain() {
  return `
function Home({ name, onOpenAI }) {
  return (
    <header className="home-topbar">
      <div className="home-top-actions">
        <span className="user-name">{name}</span>
        <button className="home-ai-trigger" type="button" aria-label="S-Hub AI 열기" onClick={onOpenAI}>
          <SHubAIOrb size={27} />
        </button>
      </div>
    </header>
  )
}

function PreviewAIPage({ now, context, conflictContext, onImportItems, requireOnline }) {
  return (
    <SchoolAISheet
      inline
      open={true}
      now={now}
      context={context}
      conflictContext={conflictContext}
      onImportItems={onImportItems}
      requireOnline={requireOnline}
    />
  )
}

function AppShell() {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
  const [aiOpen, setAiOpen] = useState(false)
  const content = {
    home: <Home onOpenAI={() => setAiOpen(true)} />,
    ai: (
      <PreviewAIPage
        now={now}
        context={aiContext}
        conflictContext={aiConflictContext}
        onImportItems={importAIItems}
        requireOnline={requireOnline}
      />
    ),
  }
  function changeTab(nextTab) { setActiveTab(nextTab) }
  return (
    <div className="app-shell">
      <main
        className={\`app-content tab-\${activeTab}\`}
        key={activeTab}
        style={{ '--content-enter-x': \`\${contentDirection * 16}px\` }}
      >
        {content[activeTab]}
      </main>
      <nav>
        {tabs.map((tab, index) => (
          <button
            ref={(node) => { buttonRefs.current[index] = node }}
            key={tab.id}
            type="button"
            data-tab={tab.id}
            className={\`nav-button \${activeTab === tab.id ? 'active' : ''}\`}
          >
            <Icon type={tab.id} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
`
}

test('inline AI tells students they may use other features but should keep the app open', () => {
  const source = builtSheet()
  assert.match(source, /onWorkingChange = null/)
  assert.match(source, /onWorkingChange\(Boolean\(working\)\)/)
  assert.match(source, /앱을 닫지 마세요\. 다른 기능은 계속 사용할 수 있어요\./)
  assert.match(source, /className="s-hub-ai-background-note"/)
})

test('AI working state is lifted to AppShell and the AI page stays mounted across station changes', () => {
  const source = patchPreviewAIStageMotionSource(representativeMain(), '/workspace/src/main.jsx')
  assert.match(source, /const \[aiWorking, setAiWorking\] = useState\(false\)/)
  assert.match(source, /onWorkingChange=\{setAiWorking\}/)
  assert.match(source, /className=\{`preview-ai-persistent-host/)
  assert.match(source, /hidden=\{activeTab !== 'ai'\}/)
  assert.match(source, /\{content\.ai\}/)
  assert.match(source, /activeTab !== 'ai' \? \(/)
  assert.doesNotMatch(source, /className=\{`app-content tab-\$\{activeTab\}`\}\s+key=\{activeTab\}/)
  assert.match(source, /className="preview-station-page-host" key=\{activeTab\}/)
})

test('home AI launcher is removed while the bottom AI station keeps background progress', () => {
  const source = patchPreviewAIStageMotionSource(representativeMain(), '/workspace/src/main.jsx')
  assert.doesNotMatch(source, /className="home-ai-trigger"/)
  assert.doesNotMatch(source, /aria-label="S-Hub AI 열기"/)
  assert.match(source, /tab\.id === 'ai' && aiWorking \? 'is-ai-working'/)
  assert.match(source, /tab\.id === 'ai' && aiWorking \? <span className="s-hub-ai-nav-progress"/)
})

test('persistent AI wrapper keeps viewport centering, nav clearance, and short-screen scroll safety', () => {
  const css = patchPreviewAIStageMotionSource('', '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.app-content\.tab-ai\s*\{[\s\S]*--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(css, /\.app-content\.tab-ai\s*\{[\s\S]*min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(css, /\.app-content\.tab-ai\s*\{[\s\S]*padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(css, /\.app-content\.tab-ai > \.preview-ai-persistent-host\.is-active > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*min-height:\s*100dvh/)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*margin-block:\s*0/)
})

test('background AI CSS keeps hidden sessions mounted and progress visible as a layered node', () => {
  const css = patchPreviewAIStageMotionSource('', '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.preview-ai-persistent-host\[hidden\]/)
  assert.match(css, /\.nav-button\[data-tab="ai"\] \.s-hub-ai-nav-progress/)
  assert.match(css, /z-index:\s*5/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('AI presentation owner directly owns background continuity', () => {
  const vite = read('vite.config.js')
  const stage = read('src/preview-ai-stage-motion-patch.js')
  assert.equal(exists('src/preview-ai-background-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewAIBackgroundSource/)
  assert.doesNotMatch(vite, /preview-ai-background-patch\.js/)
  assert.match(vite, /patchPreviewAIStageMotionSource\(next, cleanId\)/)
  assert.match(stage, /function patchAIBackgroundMain\(source\)/)
  assert.match(stage, /Preview-only AI continuity: keep the one AI session alive/)
})
""")

# Vertical-centering contract now reads the consolidated presentation output.
vertical_path = Path('tests/preview-ai-vertical-center.test.js')
vertical_path.write_text("""import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const aiCss = fs.readFileSync(new URL('../src/s-hub-ai.css', import.meta.url), 'utf8')
const presentationSource = patchPreviewAIStageMotionSource(aiCss, '/workspace/src/s-hub-ai.css')

test('preview AI page keeps the same center above the fixed nav while reserving scroll clearance', () => {
  assert.match(presentationSource, /--s-hub-ai-top-inset:\s*max\(32px, env\(safe-area-inset-top\)\)/)
  assert.match(presentationSource, /--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(presentationSource, /min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(presentationSource, /padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(presentationSource, /\.app-content:has\(> \.s-hub-ai-page\) > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
})

test('persistent AI host owns the same clearance and grows with long compose content', () => {
  assert.match(presentationSource, /\.app-content\.tab-ai\s*\{[\s\S]*--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(presentationSource, /\.app-content\.tab-ai\s*\{[\s\S]*min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(presentationSource, /\.app-content\.tab-ai\s*\{[\s\S]*padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(presentationSource, /\.preview-ai-persistent-host\.is-active\s*\{[\s\S]*flex:\s*1 0 auto;[\s\S]*min-height:\s*auto;/)

  const hostBlock = presentationSource.match(/\.app-content\.tab-ai > \.preview-ai-persistent-host\.is-active\s*\{([^}]*)\}/)?.[1] || ''
  assert.doesNotMatch(hostBlock, /justify-content:\s*center/)
  assert.doesNotMatch(hostBlock, /min-height:\s*0/)
})

test('short viewports fall back to the normal scroll-safe bottom clearance', () => {
  assert.match(presentationSource, /@media \(max-height: 760px\)/)
  assert.match(presentationSource, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(presentationSource, /margin-block:\s*0/)
})
""")

# Repository-level architecture guard.
final_path = Path('tests/final-runtime-owner.test.js')
final = final_path.read_text()
final = replace_once(
    final,
    "  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)\n",
    "  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)\n  assert.equal(exists('src/preview-ai-background-patch.js'), false)\n",
    'final retired AI background owner absence',
)
final = replace_once(
    final,
    "  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)\n",
    "  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)\n  assert.doesNotMatch(vite, /patchPreviewAIBackgroundSource/)\n  assert.doesNotMatch(vite, /preview-ai-background-patch\\.js/)\n",
    'final retired AI background Vite absence',
)
final_path.write_text(final)
