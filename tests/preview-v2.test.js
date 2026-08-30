import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('S-Hub v2 preview source stays isolated and keeps exactly five grouped tabs', () => {
  const preview = text('src/preview-v2.js')
  assert.match(preview, /const PREVIEW_PATH = '\/preview\/'/)
  assert.match(preview, /\['home', '홈'\]/)
  assert.match(preview, /\['class', '우리 반'\]/)
  assert.match(preview, /\['ai', 'AI'\]/)
  assert.match(preview, /\['study', '공부'\]/)
  assert.match(preview, /\['schedule', '일정'\]/)
  assert.match(preview, /if \(inPreviewMode\(\)\) waitForApp\(\)/)
})

test('preview board and study data stay in isolated class collections behind authenticated backend routing', () => {
  const roster = text('push-backend-v2/api/class-roster.js')
  const service = text('push-backend-v2/lib/preview-v2-service.js')
  assert.match(roster, /handlePreviewV2, isPreviewV2Resource/)
  assert.match(roster, /isPreviewV2Resource\(previewResource\)/)
  assert.match(service, /collection\('previewV2Posts'\)/)
  assert.match(service, /collection\('previewV2StudyActive'\)/)
  assert.match(service, /collection\('previewV2StudyDaily'\)/)
  assert.equal(existsSync(resolve(root, 'push-backend-v2/api/preview-v2.js')), false)
})

test('Vercel preview remains backend-only without a thirteenth function or frontend build', () => {
  const config = text('push-backend-v2/vercel.json')
  assert.doesNotMatch(config, /buildCommand/)
  assert.doesNotMatch(config, /public\/preview/)
  assert.doesNotMatch(config, /"api\/preview-v2\.js"/)
  assert.match(config, /"api\/class-roster\.js"/)
})

test('preview branch validates the GitHub Pages build but never publishes production Pages itself', () => {
  const workflow = text('.github/workflows/deploy.yml')
  assert.match(workflow, /branches: \[preview\/s-hub-v2\]/)
  assert.match(workflow, /Patch preview hosting path only for the build/)
  assert.match(workflow, /SHUB_PREVIEW_BASE=\/school\/preview-v2\/ npm run build/)
  assert.doesNotMatch(workflow, /pages: write/)
  assert.doesNotMatch(workflow, /actions\/deploy-pages@v4/)
})
