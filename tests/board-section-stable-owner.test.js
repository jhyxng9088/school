import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardAllSource } from '../src/preview-board-all-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function transformedClient() {
  return patchPreviewBoardAllSource(
    read('src/preview-board-client.js'),
    '/workspace/src/preview-board-client.js',
  )
}

test('board sections use the stable student ownership service', () => {
  const source = transformedClient()

  assert.match(source, /BOARD_SECTION_API_URL = 'https:\/\/elhlsqhzjmsfhmawrpqu\.supabase\.co\/functions\/v1\/class-board-sections'/)
  assert.match(source, /async function requestBoardSections\(/)
  assert.match(source, /stableSectionBody = await requestBoardSections\(\{ signal \}\)/)
  assert.match(source, /const responseSections = Array\.isArray\(stableSectionBody\?\.sections\)/)

  assert.match(source, /export async function createPreviewBoardSection[\s\S]*?const response = await requestBoardSections\(\{/)
  assert.match(source, /export async function editPreviewBoardSection[\s\S]*?const response = await requestBoardSections\(\{/)
  assert.match(source, /export async function deletePreviewBoardSection[\s\S]*?const response = await requestBoardSections\(\{/)
})

test('stable section routing does not take over post APIs and remains idempotent', () => {
  const source = transformedClient()

  assert.match(source, /export async function createPreviewBoardPost[\s\S]*?const response = await requestBoard\(\{/)
  assert.match(source, /export async function addPreviewBoardComment[\s\S]*?const response = await requestBoard\(\{/)
  assert.equal(
    patchPreviewBoardAllSource(source, '/workspace/src/preview-board-client.js'),
    source,
  )
})
