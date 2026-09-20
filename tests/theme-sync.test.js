import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('theme preferences sync through the authenticated student preference endpoint', () => {
  const source = read('src/theme-sync.js')
  assert.match(source, /student-theme-preferences/)
  assert.match(source, /ensureSignedIn/)
  assert.match(source, /getIdToken/)
  assert.match(source, /authorization: `Bearer \${idToken}`/)
  assert.match(source, /THEME_SYNC_META_KEY/)
  assert.match(source, /dirty: true/)
  assert.match(source, /localThemeRevision/)
  assert.match(source, /queueThemePreferenceSync/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEYS/)
})

test('theme settings remain lightweight and lazy-load remote sync only after a change', () => {
  const settings = read('src/theme-settings-entry.jsx')
  assert.match(settings, /saveThemePreferences\(\{ \.\.\.current, \.\.\.patch \}\)/)
  assert.match(settings, /import\('\.\/theme-sync\.js'\)/)
  assert.match(settings, /queueThemePreferenceSync/)
  assert.doesNotMatch(settings, /from '\.\/theme-sync\.js'/)
})

test('main app installs background theme revalidation after mount', () => {
  const main = read('src/main.jsx')
  assert.match(main, /installThemePreferenceSync/)
  assert.match(main, /export function mountMainApp\(\)/)
  const mountAt = main.indexOf('export function mountMainApp()')
  const installAt = main.indexOf('installThemePreferenceSync()', mountAt)
  const createRootAt = main.indexOf('mainRoot = createRoot', mountAt)
  assert.ok(mountAt >= 0)
  assert.ok(installAt > mountAt)
  assert.ok(createRootAt > installAt)
})

test('iOS reinstall guidance is not mounted in the app shell', () => {
  const main = read('src/main.jsx')
  assert.doesNotMatch(main, /IOSReinstallNotice/)
})
