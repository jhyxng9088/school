import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const recoveryPath = path.join(root, 'src/production-recovery-patch.js')

test('production presence keeps RTDB opt-in until its client path is explicitly configured', () => {
  const source = read('src/presence-rtdb.js')
  assert.match(source, /VITE_FIREBASE_DATABASE_URL \|\| ''/)
  assert.doesNotMatch(source, /VITE_FIREBASE_DATABASE_URL \|\| DEFAULT_DATABASE_URL/)
})

test('home presence control is source-owned and the production recovery layer is absent', () => {
  const source = read('src/main.jsx')
  assert.equal(fs.existsSync(recoveryPath), false)
  assert.match(source, /presence\.online > 0 \|\| presence\.total > 0/)
  assert.match(source, /presence\.total > 0 \? `\$\{presence\.online\}\/\$\{presence\.total\}` : presence\.online > 0 \? `\$\{presence\.online\}명`/)
  assert.match(source, /<button[\s\S]*type="button"[\s\S]*class-presence-count is-roster-button/)
  assert.match(source, /onClick=\{\(event\) => openClassRoster\(\{ keyboard: event\.detail === 0 \}\)\}/)
  assert.doesNotMatch(source, /<span[^>]*class-presence-count/)
})

test('section edits use only the production backend and never reload the PWA on save failure', () => {
  const source = read('src/reminder-section-client.js')
  assert.doesNotMatch(source, /REMINDER_SECTION_FALLBACK_API_URL/)
  assert.doesNotMatch(source, /window\.location\.reload/)
  assert.match(source, /code === 'reminder-section\/quota-exhausted'/)

  const queueable = source.slice(
    source.indexOf('function queueableUpdateError'),
    source.indexOf('async function postSectionChange'),
  )
  assert.doesNotMatch(queueable, /reminder-section\/network/)
  assert.doesNotMatch(queueable, /preview-backend-pending/)
})

test('section editor pending-sync is owned by the upstream reminder UI transform', () => {
  const id = path.join(root, 'src/todo-stage5-ai.jsx')
  const source = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), id)
  assert.equal(fs.existsSync(recoveryPath), false)
  assert.match(source, /const result = await saveReminderSectionChange/)
  assert.match(source, /if \(result\?\.pendingSync\)/)
  assert.match(source, /서버 사용량 제한으로 이 기기에 임시 저장했어요/)
  assert.match(source, /서버 제한이 풀리면 자동으로 다시 반영돼요/)
})

test('study class label is source-owned without a downstream recovery rewrite', () => {
  const pageId = path.join(root, 'src/preview-study.jsx')
  const legacyLabel = `function classLabel(classId) {
  const match = /^preview-class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  const canonicalLabel = `function classLabel(classId) {
  const match = /^(?:preview-)?class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  const raw = read('src/preview-study.jsx')
  assert.equal(fs.existsSync(recoveryPath), false)
  assert.ok(raw.includes(canonicalLabel))
  assert.ok(!raw.includes(legacyLabel))

  const previewPage = patchPreviewStudySource(raw, pageId)
  const classLabelBlock = /function classLabel\(classId\) \{[\s\S]*?\n\}/
  assert.equal(previewPage.match(classLabelBlock)?.[0], canonicalLabel)
  assert.doesNotMatch(previewPage, /touchIntentRef/)
  assert.doesNotMatch(previewPage, /onPointerDown=/)
  assert.match(previewPage, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(previewPage, /onClick=\{\(\) => selectScope\('school'\)\}/)
})

test('study ranking click owner is direct and keeps vertical scrolling available', () => {
  const pageId = path.join(root, 'src/preview-study.jsx')
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), pageId)
  assert.equal(fs.existsSync(recoveryPath), false)
  assert.doesNotMatch(page, /onPointerDown=/)
  assert.doesNotMatch(page, /touchIntentRef/)
  assert.doesNotMatch(page, /performance\.now\(\) - intent\.at/)
  assert.match(page, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(page, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.match(page, /useStudyRankingScopeSpring/)
  assert.match(page, /data-direction=\{stageDirection\}/)

  const rankingStyleId = path.join(root, 'src/preview-study-ranking.css')
  const rankingStyle = patchPreviewStudySource(read('src/preview-study-ranking.css'), rankingStyleId)
  assert.doesNotMatch(rankingStyle, /touch-action: manipulation/)
  assert.equal((rankingStyle.match(/touch-action: pan-y;/g) || []).length, 2)

  const pageStyle = read('src/preview-study.css')
  assert.match(pageStyle, /\.preview-study-page \{[\s\S]*?touch-action: pan-y;/)
})

test('student identity sync is source-owned and keeps transient fallback semantics', () => {
  const source = read('src/school-sync.js')
  assert.equal(fs.existsSync(recoveryPath), false)
  assert.match(source, /STUDENT_IDENTITY_SYNC_KEY = 'school\.studentIdentitySync\.v1'/)
  assert.match(source, /identitySyncMarkerMatches\(cacheKey\)/)
  assert.match(source, /code === 'resource-exhausted' \|\| code === 'unavailable' \|\| code === 'deadline-exceeded'/)
  assert.match(source, /if \(transientIdentityReadError\(error\)\) \{[\s\S]*?return user/)
  assert.match(source, /rememberIdentitySync\(cacheKey\)/)
  assert.match(source, /저장된 학생 정보와 로그인 정보가 달라/)
  assert.doesNotMatch(source.slice(source.indexOf('function transientIdentityReadError'), source.indexOf('async function ensureStoredProfileIdentity')), /permission-denied/)
})
