import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('stage3 core does not retain legacy academic UI owners', () => {
  const core = text('src/stage3-core.js')
  assert.doesNotMatch(core, /export function AcademicPage\b/)
  assert.doesNotMatch(core, /export function AcademicPreview\b/)
  assert.doesNotMatch(core, /function groupAcademicEvents\b/)
  assert.doesNotMatch(core, /function academicDateRange\b/)
})
