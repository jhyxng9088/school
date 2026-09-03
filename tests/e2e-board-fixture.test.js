import assert from 'node:assert/strict'
import test from 'node:test'
import { patchE2EBoardFixtureSource } from '../src/e2e-board-fixture-patch.js'

const LOAD_SIGNATURE = "export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {"

test('E2E board fixture patch only touches preview board client source', () => {
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
