import test from 'node:test'
import assert from 'node:assert/strict'
import { saveThemePreferences } from '../src/theme-preferences.js'

function fakeRoot() {
  const styleValues = new Map()
  return {
    dataset: {},
    style: {
      get transitionProperty() { return styleValues.get('transition-property') || '' },
      set transitionProperty(value) { styleValues.set('transition-property', value) },
      removeProperty(name) { styleValues.delete(name) },
    },
  }
}

function fakeStorage() {
  return { setItem() {} }
}

test('theme changes remove --bg from the active transition for one painted frame', () => {
  const root = fakeRoot()
  const frames = []
  const previousGetComputedStyle = globalThis.getComputedStyle
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame

  globalThis.getComputedStyle = () => ({
    transitionProperty: '--bg, --surface, --text, --border',
  })
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback)
    return frames.length
  }

  try {
    saveThemePreferences({ mode: 'dark', accent: 'blue' }, fakeStorage(), root)

    assert.equal(root.dataset.themeMode, 'dark')
    assert.equal(root.dataset.themeAccent, 'blue')
    assert.equal(root.style.transitionProperty, '--surface, --text, --border')

    frames.shift()()
    assert.equal(root.style.transitionProperty, '--surface, --text, --border')

    frames.shift()()
    assert.equal(root.style.transitionProperty, '')
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle
    else globalThis.getComputedStyle = previousGetComputedStyle

    if (previousRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = previousRequestAnimationFrame
  }
})

test('theme changes preserve a pre-existing inline transition owner', () => {
  const root = fakeRoot()
  root.style.transitionProperty = 'opacity'
  const frames = []
  const previousGetComputedStyle = globalThis.getComputedStyle
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame

  globalThis.getComputedStyle = () => ({
    transitionProperty: '--bg, --surface, --text',
  })
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback)
    return frames.length
  }

  try {
    saveThemePreferences({ mode: 'light', accent: 'pink' }, fakeStorage(), root)
    assert.equal(root.style.transitionProperty, '--surface, --text')

    frames.shift()()
    frames.shift()()
    assert.equal(root.style.transitionProperty, 'opacity')
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle
    else globalThis.getComputedStyle = previousGetComputedStyle

    if (previousRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = previousRequestAnimationFrame
  }
})
