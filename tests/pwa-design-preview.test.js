import assert from 'node:assert/strict'
import test from 'node:test'
import { isLocalDesignPreview } from '../src/pwa-design-preview.js'

test('local browser design preview is limited to Vite development on loopback', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1']) {
    assert.equal(isLocalDesignPreview({ isDevelopment: true, hostname }), true)
    assert.equal(isLocalDesignPreview({ isDevelopment: false, hostname }), false)
  }
})

test('development builds cannot bypass PWA installation on non-loopback hosts', () => {
  for (const hostname of ['example.com', 'school.github.io', '192.168.1.9', 'localhost.evil.com', '']) {
    assert.equal(isLocalDesignPreview({ isDevelopment: true, hostname }), false)
  }
})

test('absent and non-boolean development flags never grant preview access', () => {
  assert.equal(isLocalDesignPreview({ hostname: 'localhost' }), false)
  assert.equal(isLocalDesignPreview({ isDevelopment: 'true', hostname: 'localhost' }), false)
})
