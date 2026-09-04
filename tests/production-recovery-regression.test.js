import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { patchProductionRecoverySource } from '../src/production-recovery-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function recover(relativePath, source = read(relativePath)) {
  return patchProductionRecoverySource(source, path.join(root, relativePath))
}

test('production presence keeps RTDB opt-in until its client path is explicitly configured', () => {
  const source = recover('src/presence-rtdb.js')
  assert.match(source, /VITE_FIREBASE_DATABASE_URL \|\| ''/)
  assert.doesNotMatch(source, /VITE_FIREBASE_DATABASE_URL \|\| DEFAULT_DATABASE_URL/)
})

test('home presence control is source-owned and its recovery owner is retired', () => {
  const raw = read('src/main.jsx')
  const recovery = read('src/production-recovery-patch.js')
  const source = recover('src/main.jsx')
  assert.equal(source, raw)
  assert.match(raw, /presence\.online > 0 \|\| presence\.total > 0/)
  assert.match(raw, /presence\.total > 0 \? `\$\{presence\.online\}\/\$\{presence\.total\}` : presence\.online > 0 \? `\$\{presence\.online\}명`/)
  assert.match(raw, /<button[\s\S]*type="button"[\s\S]*class-presence-count is-roster-button/)
  assert.match(raw, /onClick=\{\(event\) => openClassRoster\(\{ keyboard: event\.detail === 0 \}\)\}/)
  assert.doesNotMatch(raw, /<span[^>]*class-presence-count/)
  assert.doesNotMatch(recovery, /patchMainPresence/)
  assert.doesNotMatch(recovery, /endsWith\('\/src\/main\.jsx'\)/)
  assert.match(recovery, /patchTodoSectionSubmit/)
  assert.match(recovery, /patchStudentIdentitySync/)
})

test('section edits use only the production backend and never reload the PWA on save failure', () => {
  const source = recover('src/reminder-section-client.js')
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

test('section editor pending-sync recovery is migration-safe and keeps the current sheet open', () => {
  const id = path.join(root, 'src/todo-stage5-ai.jsx')
  const previewSource = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), id)
  const source = patchProductionRecoverySource(previewSource, id)
  const repeated = patchProductionRecoverySource(source, id)
  assert.equal(repeated, source)
  assert.match(source, /const result = await saveReminderSectionChange/)
  assert.match(source, /if \(result\?\.pendingSync\)/)
  assert.match(source, /서버 사용량 제한으로 이 기기에 임시 저장했어요/)
})

test('study class label recovery accepts the future source-owned normalization', () => {
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
  const canonicalSource = raw.replace(legacyLabel, canonicalLabel)
  assert.notEqual(canonicalSource, raw)

  const previewPage = patchPreviewStudySource(canonicalSource, pageId)
  const page = patchProductionRecoverySource(previewPage, pageId)
  assert.ok(page.includes(canonicalLabel))
})

test('study ranking waits for a completed tap and keeps vertical scrolling available', () => {
  const pageId = path.join(root, 'src/preview-study.jsx')
  const previewPage = patchPreviewStudySource(read('src/preview-study.jsx'), pageId)
  const page = patchProductionRecoverySource(previewPage, pageId)
  assert.doesNotMatch(page, /onPointerDown=/)
  assert.doesNotMatch(page, /touchIntentRef/)
  assert.doesNotMatch(page, /performance\.now\(\) - intent\.at/)
  assert.match(page, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(page, /onClick=\{\(\) => selectScope\('school'\)\}/)

  const rankingStyleId = path.join(root, 'src/preview-study-ranking.css')
  const previewRankingStyle = patchPreviewStudySource(read('src/preview-study-ranking.css'), rankingStyleId)
  const rankingStyle = patchProductionRecoverySource(previewRankingStyle, rankingStyleId)
  const repeatedRankingStyle = patchProductionRecoverySource(rankingStyle, rankingStyleId)
  assert.equal(repeatedRankingStyle, rankingStyle)
  assert.doesNotMatch(rankingStyle, /touch-action: manipulation/)
  assert.equal((rankingStyle.match(/touch-action: pan-y;/g) || []).length, 2)

  const rawPageStyle = read('src/preview-study.css')
  const pageStyle = recover('src/preview-study.css')
  const recovery = read('src/production-recovery-patch.js')
  assert.equal(pageStyle, rawPageStyle)
  assert.match(rawPageStyle, /\.preview-study-page \{[\s\S]*?touch-action: pan-y;/)
  assert.doesNotMatch(recovery, /patchStudyPageTouchAction/)
  assert.doesNotMatch(recovery, /endsWith\('\/src\/preview-study\.css'\)/)
})

test('student identity sync survives transient Firestore outages without weakening hard identity mismatches', () => {
  const source = recover('src/school-sync.js')
  assert.match(source, /STUDENT_IDENTITY_SYNC_KEY = 'school\.studentIdentitySync\.v1'/)
  assert.match(source, /identitySyncMarkerMatches\(cacheKey\)/)
  assert.match(source, /code === 'resource-exhausted' \|\| code === 'unavailable' \|\| code === 'deadline-exceeded'/)
  assert.match(source, /if \(transientIdentityReadError\(error\)\) \{[\s\S]*?return user/)
  assert.match(source, /rememberIdentitySync\(cacheKey\)/)
  assert.match(source, /저장된 학생 정보와 로그인 정보가 달라/)
  assert.doesNotMatch(source.slice(source.indexOf('function transientIdentityReadError'), source.indexOf('async function ensureStoredProfileIdentity')), /permission-denied/)
})
