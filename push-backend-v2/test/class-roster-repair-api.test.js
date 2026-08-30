import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const apiSource = readFileSync(new URL('../api/class-roster.js', import.meta.url), 'utf8')
const serviceSource = readFileSync(new URL('../lib/class-roster-repair-service.js', import.meta.url), 'utf8')
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')

test('roster repair keeps its public URL while sharing the authenticated roster function', () => {
  assert.match(vercel, /"source": "\/api\/class-roster-repair"/)
  assert.match(vercel, /"destination": "\/api\/class-roster\?mode=repair"/)
  assert.match(apiSource, /const repairMode = String\(req\.query\?\.mode \|\| ''\)\.trim\(\) === 'repair'/)
  assert.match(apiSource, /req\.method !== 'POST'/)
  assert.match(apiSource, /verifyIdToken\(token\)/)
  assert.match(apiSource, /collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(apiSource, /const classId = String\(identity\.data\(\)\?\.classId/)
  assert.match(apiSource, /repairClassRoster\(\{ db, classId \}\)/)
})

test('preview reminder-section route stays preview-only and preserves retry-safe restore provenance', () => {
  assert.match(vercel, /"source": "\/api\/reminder-sections"/)
  assert.match(vercel, /"destination": "\/api\/class-roster\?mode=reminder-sections"/)
  assert.match(apiSource, /const reminderSectionMode = String\(req\.query\?\.mode \|\| ''\)\.trim\(\) === 'reminder-sections'/)
  assert.match(apiSource, /function isPreviewClassId/)
  assert.match(apiSource, /if \(!isPreviewClassId\(classId\)\)/)
  assert.match(apiSource, /reminder-section\/preview-class-required/)
  assert.match(apiSource, /collection\('reminderSectionArchives'\)/)
  assert.match(apiSource, /todoIds/)
  assert.match(apiSource, /action === 'restore'/)
  assert.match(apiSource, /restoreArchivedReminderSectionTodos/)
  assert.match(apiSource, /action === 'restore'[\s\S]*?restoreArchivedReminderSectionTodos\(db, classRef, section\.id\)[\s\S]*?collection\('reminderCategories'\)\.doc\(section\.id\)\.set\(section\)[\s\S]*?restored\.archiveRef\.delete\(\)/)
})

test('roster repair checks every remaining identity signal before archiving', () => {
  assert.match(serviceSource, /collection\('pushSubscriptions'\)\.get\(\)/)
  assert.match(serviceSource, /collection\('todoState'\)/)
  assert.match(serviceSource, /recoverClassRosterUsers\(\{/)
  assert.match(serviceSource, /classifyRosterOrphans\(\{/)
})

test('roster repair archives before deleting an unresolved active member record', () => {
  assert.match(serviceSource, /collection\('rosterArchive'\)\.doc\(item\.studentKey\)/)
  assert.match(serviceSource, /reason: 'unresolved_legacy_member'/)
  assert.match(serviceSource, /batch\.delete\(classRef\.collection\('members'\)\.doc\(item\.studentKey\)\)/)
  assert.match(serviceSource, /await batch\.commit\(\)/)
})

test('Vercel stays within the Hobby twelve-function limit without removing shared routes', () => {
  const apiDirectory = resolve(process.cwd(), 'api')
  const functionFiles = readdirSync(apiDirectory).filter((name) => name.endsWith('.js'))
  assert.equal(functionFiles.length, 12)
  assert.equal(existsSync(resolve(apiDirectory, 'class-roster-repair.js')), false)
  assert.equal(existsSync(resolve(apiDirectory, 'reminder-sections.js')), false)
})