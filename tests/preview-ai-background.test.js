import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'
import { patchPreviewAIBackgroundSource } from '../src/preview-ai-background-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function builtSheet() {
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIDensitySource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIStageMotionSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  return patchPreviewAIBackgroundSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
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
  const source = patchPreviewAIBackgroundSource(representativeMain(), '/workspace/src/main.jsx')
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
  const source = patchPreviewAIBackgroundSource(representativeMain(), '/workspace/src/main.jsx')
  assert.doesNotMatch(source, /className="home-ai-trigger"/)
  assert.doesNotMatch(source, /aria-label="S-Hub AI 열기"/)
  assert.match(source, /tab\.id === 'ai' && aiWorking \? 'is-ai-working'/)
  assert.match(source, /tab\.id === 'ai' && aiWorking \? <span className="s-hub-ai-nav-progress"/)
})

test('persistent AI wrapper restores viewport centering and keeps short screens scroll-safe', () => {
  const css = patchPreviewAIBackgroundSource('', '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.app-content\.tab-ai\s*\{[\s\S]*min-height:\s*calc\(100dvh - var\(--nav-bottom\) - 64px\)/)
  assert.match(css, /\.preview-ai-persistent-host\.is-active\s*\{[\s\S]*justify-content:\s*center/)
  assert.match(css, /\.preview-ai-persistent-host\.is-active > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*margin-block:\s*0/)
})

test('background AI CSS keeps hidden sessions mounted and progress visible as a layered node', () => {
  const css = patchPreviewAIBackgroundSource('', '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.preview-ai-persistent-host\[hidden\]/)
  assert.match(css, /\.nav-button\[data-tab="ai"\] \.s-hub-ai-nav-progress/)
  assert.match(css, /z-index:\s*5/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('vite applies background continuity after AI state motion', () => {
  const vite = read('vite.config.js')
  const motion = vite.indexOf('patchPreviewAIStageMotionSource(next, cleanId)')
  const background = vite.indexOf('patchPreviewAIBackgroundSource(next, cleanId)')
  assert.ok(motion >= 0)
  assert.ok(background > motion)
})
