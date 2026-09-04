import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/device-profile-sync.js', import.meta.url), 'utf8')

test('device profile sync coalesces repeated lifecycle scheduling', () => {
  assert.match(source, /let syncTimer = 0/)
  assert.match(source, /function scheduleSync\(\) \{[\s\S]*if \(syncTimer\) return/)
  assert.match(source, /syncTimer = window\.setTimeout\(\(\) => \{[\s\S]*syncTimer = 0[\s\S]*void syncDeviceProfile\(\)[\s\S]*\}, 1200\)/)
})

test('device profile sync keeps all existing lifecycle triggers', () => {
  assert.match(source, /window\.addEventListener\('online', scheduleSync\)/)
  assert.match(source, /window\.addEventListener\('school:student-profile-saved', scheduleSync\)/)
  assert.match(source, /window\.addEventListener\('focus', scheduleSync\)/)
  assert.match(source, /scheduleSync\(\)\s*$/)
})
