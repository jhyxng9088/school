import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('meal home preview owns native semantic navigation', () => {
  const meal = read('src/home-meal-preview.jsx')
  const action = read('src/home-nav-action.jsx')

  assert.match(meal, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(meal, /home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(meal, /<HomeNavAction tab="schedule" section="meal" label="급식 열기" \/>/)

  assert.match(action, /<button[\s\S]*type="button"/)
  assert.match(action, /window\.SHubNavigation\?\.navigate\(\{ tab, section \}\)/)
  assert.doesNotMatch(action, /role=/)
  assert.doesNotMatch(action, /tabIndex=/)
  assert.doesNotMatch(action, /onKeyDown=/)
})

test('academic home preview owns native semantic navigation', () => {
  const academic = read('src/academic-shared.jsx')

  assert.match(academic, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(academic, /academic-preview home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(academic, /<HomeNavAction tab="schedule" section="academic" label="학사일정 열기" \/>/)
})

test('retired home navigation retrofit runtime stays removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/school-home-nav.js')), false)
  assert.doesNotMatch(read('index.html'), /school-home-nav\.js/)
  assert.doesNotMatch(read('public/sw.js'), /school-home-nav\.js/)
})
