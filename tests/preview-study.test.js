import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview study replaces the station placeholder without changing production main source', () => {
  const original = read('src/main.jsx')
  const station = patchPreviewStationNavSource(original, '/workspace/src/main.jsx')
  const patched = patchPreviewStudySource(station, '/workspace/src/main.jsx')

  assert.doesNotMatch(original, /preview-study\.jsx/)
  assert.match(patched, /import \{ PreviewStudyPage as PreviewStudyFeaturePage \} from '\.\/preview-study\.jsx'/)
  assert.match(patched, /function PreviewStudyPage\(\{ requireOnline \}\)/)
  assert.match(patched, /study: <PreviewStudyPage requireOnline=\{requireOnline\} \/>/)
  assert.doesNotMatch(patched, /스터디 기능을 넣을 자리만 먼저 확보했어/)
})

test('preview build preserves the board placeholder until board wiring finishes', () => {
  const config = read('vite.config.js')
  const boardAt = config.indexOf('next = patchPreviewBoardSource(next, cleanId)')
  const studyAt = config.indexOf('next = patchPreviewStudySource(next, cleanId)')
  assert.ok(boardAt >= 0, 'board patch must remain in preview pipeline')
  assert.ok(studyAt > boardAt, 'study must replace its placeholder only after board wiring uses that marker')
})

test('preview study client is isolated to the dedicated study endpoint and supports pause lifecycle', () => {
  const client = read('src/preview-study-client.js')
  assert.match(client, /functions\/v1\/class-study/)
  assert.match(client, /ensureSignedIn/)
  assert.match(client, /cache: 'no-store'/)
  assert.match(client, /export async function pausePreviewStudy/)
  assert.match(client, /requestStudyTransition\('pause'/)
  assert.match(client, /export async function resumePreviewStudy/)
  assert.match(client, /requestStudyTransition\('resume'/)
})

test('study transitions reconcile stale server state before the page reloads its snapshot', () => {
  const client = read('src/preview-study-client.js')

  assert.match(client, /async function requestStudyTransition\(action, reconciledCodes = \[\]\)/)
  assert.match(client, /return \{ ok: true, reconciled: true, code, generatedAt: Date\.now\(\) \}/)
  assert.match(client, /requestStudyTransition\('pause',[\s\S]*'study\/not-active'[\s\S]*'study\/already-paused'[\s\S]*'study\/state-changed'/)
  assert.match(client, /requestStudyTransition\('resume',[\s\S]*'study\/not-active'[\s\S]*'study\/not-paused'[\s\S]*'study\/state-changed'/)
  assert.match(client, /requestStudyTransition\('stop', \['study\/not-active'\]\)/)
})

test('preview study client supports class and school snapshots with subject totals', () => {
  const client = read('src/preview-study-client.js')
  assert.match(client, /scope === 'school'/)
  assert.match(client, /scope=\$\{encodeURIComponent\(normalizedScope\)\}/)
  assert.match(client, /classId/)
  assert.match(client, /subjectTotals/)
  assert.match(client, /preview-study-ranking\.css/)
})

test('preview study realtime reuses the authenticated class topic and broadcasts a school-wide signal', () => {
  const realtime = read('src/preview-study-realtime.js')
  assert.match(realtime, /functions\/v1\/board-realtime/)
  assert.match(realtime, /SCHOOL_STUDY_TOPIC = 'preview-study-school-v1'/)
  assert.match(realtime, /events\/study_changed/)
  assert.match(realtime, /broadcast\?\.event !== 'study_changed'/)
  assert.match(realtime, /broadcast: \{ ack: false, self: false \}/)
  assert.match(realtime, /subscribePreviewStudyRealtime\(onClassChange, onSchoolChange/)
})

test('study page includes start, pause, resume, stop, class presence and today ranking', () => {
  const page = read('src/preview-study.jsx')
  assert.match(page, /공부 시작/)
  assert.match(page, /일시정지/)
  assert.match(page, /계속하기/)
  assert.match(page, /공부 종료/)
  assert.match(page, /현재 스터디/)
  assert.match(page, /오늘 공부 랭킹/)
  assert.match(page, /runningTodaySeconds/)
  assert.match(page, /activeSessionSeconds/)
})

test('study ranking separates class and school and opens a student detail sheet', () => {
  const page = read('src/preview-study.jsx')
  const style = read('src/preview-study-ranking.css')

  assert.match(page, />\s*우리반\s*</)
  assert.match(page, />\s*전교\s*</)
  assert.match(page, /loadPreviewStudy\(\{ scope: 'school' \}\)/)
  assert.match(page, /StudyStudentSheet/)
  assert.match(page, /role="dialog"/)
  assert.match(page, /과목별 공부 시간/)
  assert.match(page, /studentSubjectTotals/)
  assert.match(page, /subjectTotals/)
  assert.match(style, /preview-study-ranking-tabs/)
  assert.match(style, /preview-study-sheet-backdrop/)
  assert.match(style, /@keyframes preview-study-sheet-up/)
})

test('one-second study timer ticks locally without a one-second API reload loop', () => {
  const page = read('src/preview-study.jsx')
  assert.match(page, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/)
  assert.doesNotMatch(page, /setInterval\([^)]*loadPreviewStudy/)
  assert.doesNotMatch(page, /setInterval\([^)]*load\(/)
})

test('study UI uses neutral polite copy instead of casual second-person copy', () => {
  const page = read('src/preview-study.jsx')
  const client = read('src/preview-study-client.js')
  assert.doesNotMatch(page, /할 거야\?|학생이 없어\.|못했어\.|보여주고 있어|· 나/)
  assert.doesNotMatch(client, /못했어요|올바르지 않아요|사용할 수 있어요/)
  assert.match(page, /공부할 과목을 선택해 주세요\./)
  assert.match(page, /학생이 없습니다\./)
})

test('new study presence rows animate in and respect reduced motion', () => {
  const style = read('src/preview-study.css')
  assert.match(style, /animation: preview-study-person-enter/)
  assert.match(style, /@keyframes preview-study-person-enter/)
  assert.match(style, /prefers-reduced-motion: reduce/)
  assert.match(style, /animation: none !important/)
})

test('study action buttons morph smoothly between idle, running and paused states', () => {
  const page = read('src/preview-study.jsx')
  const style = read('src/preview-study.css')

  assert.match(page, /preview-study-action-dock/)
  assert.match(page, /data-study-control-state/)
  assert.match(page, /preview-study-morph-primary/)
  assert.match(page, /preview-study-morph-stop/)
  assert.match(page, /preview-study-action-label/)
  assert.match(page, /actionKind === 'pause'/)
  assert.match(page, /actionKind === 'resume'/)
  assert.match(page, /actionKind === 'stop'/)

  assert.match(style, /\.preview-study-action-dock\.is-active/)
  assert.match(style, /width 520ms cubic-bezier/)
  assert.match(style, /@keyframes preview-study-action-label-enter/)
  assert.match(style, /preview-study-control-content-enter/)
  assert.match(style, /prefers-reduced-motion: reduce/)
})
