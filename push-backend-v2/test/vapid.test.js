import test from 'node:test'
import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import { vapidKeyPairMatches } from '../lib/vapid.js'

function pair() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    publicKey: ecdh.getPublicKey(null, 'uncompressed').toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  }
}

test('matching P-256 VAPID key pair is accepted', () => {
  const keys = pair()
  assert.equal(vapidKeyPairMatches(keys.publicKey, keys.privateKey), true)
})

test('mismatched VAPID key pair is rejected', () => {
  const first = pair()
  const second = pair()
  assert.equal(vapidKeyPairMatches(first.publicKey, second.privateKey), false)
})

test('missing or malformed keys are rejected', () => {
  assert.equal(vapidKeyPairMatches('', ''), false)
  assert.equal(vapidKeyPairMatches('bad', 'bad'), false)
})
