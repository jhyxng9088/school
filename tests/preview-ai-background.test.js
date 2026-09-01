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

test('inline AI tells students they may use other features but should keep the app open', () => {
  const source = builtSheet()
  assert.match(source, /onWorkingChange = null/)
  assert.match(source, /onWorkingChange\(Boolean\(working\)\)/)
  assert.match(source, /앱을 닫지 마세요\. 다른 기능은 계속 사용할 수 있어요\./)
  assert.match(source, /className="s-hub-ai-background-note"/)
})

test('AI working state is lifted to AppShell and the AI page stays mounted across station changes', () => {
  const representative = `
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
  const source = patchPreviewAIBackgroundSource(representative, '/workspace/src/main.jsx')
  assert.match(source, /const \[aiWorking, setAiWorking\] = useState\(false\)/)
  assert.match(source, /onWorkingChange=\{setAiWorking\}/)
  assert.match(source, /className=\{`preview-ai-persistent-host/)
  assert.match(source, /hidden=\{activeTab !== 'ai'\}/)
  assert.match(source, /\{content\.ai\}/)
  assert.match(source, /activeTab !== 'ai' \? \(/)
  assert.doesNotMatch(source, /key=\{activeTab\}[\s\S]{0,120}\{content\[activeTab\]\}/)
})

test('home AI launcher reuses the persistent station and background work is visible in nav', () => {
  const representative = `
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
  return (
    <div>
      <main
        className={\`app-content tab-\${activeTab}\`}
        key={activeTab}
        style={{ '--content-enter-x': \`\${contentDirection * 16}px\` }}
      >
        {content[activeTab]}
      </main>
      <button
        data-tab={tab.id}
        className={\`nav-button \${activeTab === tab.id ? 'active' : ''}\`}
      >x</button>
    </div>
  )
}
`
  const source = patchPreviewAIBackgroundSource(representative, '/workspace/src/main.jsx')
  assert.match(source, /onOpenAI=\{\(\) => changeTab\('ai'\)\}/)
  assert.match(source, /tab\.id === 'ai' && aiWorking \? 'is-ai-working'/)
})

test('background AI CSS keeps hidden sessions mounted and motion accessible', () => {
  const css = patchPreviewAIBackgroundSource('', '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.preview-ai-persistent-host\[hidden\]/)
  assert.match(css, /\.nav-button\[data-tab="ai"\]\.is-ai-working::after/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('vite applies background continuity after AI state motion', () => {
  const vite = read('vite.config.js')
  const motion = vite.indexOf('patchPreviewAIStageMotionSource(next, cleanId)')
  const background = vite.indexOf('patchPreviewAIBackgroundSource(next, cleanId)')
  assert.ok(motion >= 0)
  assert.ok(background > motion)
})
