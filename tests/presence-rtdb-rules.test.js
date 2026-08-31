import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rules = JSON.parse(fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'))

test('RTDB denies root access and exposes only authenticated presence reads', () => {
  assert.equal(rules.rules['.read'], false)
  assert.equal(rules.rules['.write'], false)
  assert.equal(rules.rules.presence.$classId['.read'], 'auth != null')
})

test('a Firebase user can write only their own presence uid node', () => {
  const uidRules = rules.rules.presence.$classId.$uid
  assert.equal(uidRules['.write'], 'auth != null && auth.uid === $uid')
  assert.equal(uidRules['.validate'], "newData.hasChildren(['connectedAt'])")
})

test('presence payload is numeric timestamp only', () => {
  const uidRules = rules.rules.presence.$classId.$uid
  assert.equal(uidRules.connectedAt['.validate'], 'newData.isNumber()')
  assert.equal(uidRules.$other['.validate'], false)
})
