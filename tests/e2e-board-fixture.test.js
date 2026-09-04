import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { patchE2EBoardFixtureSource } from '../src/e2e-board-fixture-patch.js'

const LOAD_SIGNATURE = "export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {"
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function functionSlice(source, signature, nextSignature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `missing ${signature}`)
  const next = nextSignature ? source.indexOf(nextSignature, start + signature.length) : -1
  return source.slice(start, next >= 0 ? next : undefined)
}

function assertFixtureGuardBefore(source, signature, liveMarker, nextSignature) {
  const body = functionSlice(source, signature, nextSignature)
  const guard = body.indexOf('__S_HUB_E2E_BOARD_FIXTURE__')
  const live = body.indexOf(liveMarker)
  assert.ok(guard >= 0, `${signature} is missing the E2E fixture guard`)
  assert.ok(live >= 0, `${signature} is missing expected live path marker ${liveMarker}`)
  assert.ok(guard < live, `${signature} reaches the live path before the E2E fixture guard`)
}

test('E2E board fixture patch only touches supported board sources', () => {
  const untouched = 'export const value = 1\n'
  assert.equal(patchE2EBoardFixtureSource(untouched, '/src/main.jsx'), untouched)
})

test('E2E board fixture patch injects a fixture seam before live board loading', () => {
  const source = [
    'const sectionCache = new Map()',
    'let cachedSections = []',
    'let sectionsCachedAt = 0',
    'function uniquePosts(posts = []) { return posts }',
    LOAD_SIGNATURE,
    '  const includeSections = !cursor && (forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000)',
    '  return { includeSections }',
    '}',
  ].join('\n')

  const patched = patchE2EBoardFixtureSource(source, '/src/preview-board-client.js')
  assert.match(patched, /__S_HUB_E2E_BOARD_FIXTURE__/)
  assert.match(patched, /sectionCache\.set\(activeSectionId/)
  assert.match(patched, /posts: \[\.\.\.fixturePosts\]/)
  assert.match(patched, /const includeSections = !cursor/)
})

test('E2E fixture survives the production fast-cache loader prefix', () => {
  const transformedSource = [
    'const sectionCache = new Map()',
    'let cachedSections = []',
    'let sectionsCachedAt = 0',
    'function uniquePosts(posts = []) { return posts }',
    'function hydrateBoardCache() {}',
    LOAD_SIGNATURE,
    '  hydrateBoardCache()',
    '  const includeSections = !cursor && (forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000)',
    '  return { includeSections }',
    '}',
  ].join('\n')

  const patched = patchE2EBoardFixtureSource(transformedSource, '/src/preview-board-client.js')
  const fixtureIndex = patched.indexOf('__S_HUB_E2E_BOARD_FIXTURE__')
  const hydrateIndex = patched.indexOf('hydrateBoardCache()', patched.indexOf(LOAD_SIGNATURE))
  assert.ok(fixtureIndex > patched.indexOf(LOAD_SIGNATURE))
  assert.ok(hydrateIndex > fixtureIndex)
})

test('E2E board fixture blocks every board realtime/read-state production entry point', () => {
  const realtime = read('src/preview-board-realtime.js')
  const patched = patchE2EBoardFixtureSource(realtime, '/src/preview-board-realtime.js')

  assert.match(patched, /S_HUB_E2E_REALTIME_ISOLATION/)
  assertFixtureGuardBefore(
    patched,
    'export async function loadPreviewBoardEvents(since = null) {',
    'requestRealtimeConfig(since)',
    'export async function savePreviewBoardPostRead',
  )
  assertFixtureGuardBefore(
    patched,
    'export async function savePreviewBoardPostRead(postId, readCursor) {',
    'requestReadStateMutation(',
    'export async function savePreviewBoardSectionSeen',
  )
  assertFixtureGuardBefore(
    patched,
    'export async function savePreviewBoardSectionSeen(cursor) {',
    'requestReadStateMutation(',
    'function safePayload',
  )
  assertFixtureGuardBefore(
    patched,
    'export async function broadcastPreviewBoardRealtime(payload = {}) {',
    'dispatchPreviewBoardPostPush(',
    'function sendSocket',
  )
  assertFixtureGuardBefore(
    patched,
    'export async function subscribePreviewBoardRealtime(onChange) {',
    'listeners.add(onChange)',
    null,
  )

  assert.match(patched, /topic: 'e2e-board-fixture'/)
  assert.match(patched, /readState: \{ initialized: true, cursor: 0, seenCursor: 0, unread: \[\] \}/)
  assert.equal(
    patchE2EBoardFixtureSource(patched, '/src/preview-board-realtime.js'),
    patched,
    'realtime fixture transform should be idempotent',
  )
})
