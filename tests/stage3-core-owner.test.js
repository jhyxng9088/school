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

test('stage3 core does not retain legacy meal UI owners', () => {
  const core = text('src/stage3-core.js')
  assert.doesNotMatch(core, /export function MealPage\b/)
  assert.doesNotMatch(core, /export function MealPreview\b/)
  assert.doesNotMatch(core, /function mealForDate\b/)
})

test('stage3 core keeps only data-owner dependencies after UI retirement', () => {
  const core = text('src/stage3-core.js')
  assert.doesNotMatch(core, /react\/jsx-runtime/)
  assert.doesNotMatch(core, /WEEKDAY_LABELS/)
  assert.doesNotMatch(core, /function daysBetween\b/)
})

test('stage3 school identity stays inside the NEIS data owner and resolves from the student profile', () => {
  const core = text('src/stage3-core.js')
  assert.match(core, /import \{ LEGACY_SCHOOL_CONTEXT, schoolScopeKey \} from '\.\/school-directory\.js'/)
  assert.match(core, /function schoolContext\(profile\)/)
  assert.match(core, /const officeCode = String\(profile\?\.officeCode \|\| ''\)\.trim\(\)/)
  assert.match(core, /const schoolCode = String\(profile\?\.schoolCode \|\| ''\)\.trim\(\)/)
  assert.match(core, /return \{ \.\.\.LEGACY_SCHOOL_CONTEXT \}/)
  assert.doesNotMatch(core, /const SUJI_SCHOOL\s*=/)
  assert.doesNotMatch(core, /officeCode:\s*'J10'/)
  assert.doesNotMatch(core, /schoolCode:\s*'7530093'/)
})
