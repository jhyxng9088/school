import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('meal home preview owns native semantic navigation without DOM button retrofit', () => {
  const meal = read('src/home-meal-preview.jsx')
  const action = read('src/home-nav-action.jsx')
  const legacy = read('public/school-home-nav.js')

  assert.match(meal, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(meal, /home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(meal, /<HomeNavAction tab="schedule" section="meal" label="급식 열기" \/>/)

  assert.match(action, /<button[\s\S]*type="button"/)
  assert.match(action, /window\.SHubNavigation\?\.navigate\(\{ tab, section \}\)/)
  assert.doesNotMatch(action, /role=/)
  assert.doesNotMatch(action, /tabIndex=/)
  assert.doesNotMatch(action, /onKeyDown=/)

  assert.match(legacy, /if \(item\.dataset\.homeNavReady === 'true'\) return/)
  assert.doesNotMatch(legacy, /item\.matches\('\.meal-preview'\)/)
  assert.doesNotMatch(legacy, /section: 'meal'/)
})

test('academic home preview owns native semantic navigation without a legacy route owner', () => {
  const academic = read('src/academic-shared.jsx')
  const legacy = read('public/school-home-nav.js')

  assert.match(academic, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(academic, /academic-preview home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(academic, /<HomeNavAction tab="schedule" section="academic" label="학사일정 열기" \/>/)
  assert.match(legacy, /if \(item\.dataset\.homeNavReady === 'true'\) return/)
  assert.doesNotMatch(legacy, /item\.matches\('\.academic-preview'\)/)
  assert.doesNotMatch(legacy, /section: 'academic'/)
})
