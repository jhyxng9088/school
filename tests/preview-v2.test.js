import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('S-Hub v2 preview is isolated to the preview path and keeps exactly five grouped tabs', () => {
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

test('Vercel preview serves the isolated frontend without adding a thirteenth serverless function', () => {
  const config = text('push-backend-v2/vercel.json')
  assert.match(config, /SHUB_PREVIEW_BASE=\/preview\//)
  assert.match(config, /"source": "\/api\/preview-v2"/)
  assert.match(config, /"destination": "\/api\/class-roster"/)
  assert.doesNotMatch(config, /"api\/preview-v2\.js"/)
})

test('preview branch validation can run without deploying preview code to GitHub Pages', () => {
  const workflow = text('.github/workflows/deploy.yml')
  assert.match(workflow, /branches: \[main, preview\/s-hub-v2\]/)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /SHUB_PREVIEW_BASE=\/preview\/ npm run build/)
})
