import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrap = fs.readFileSync(new URL('../src/app-bootstrap.jsx', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const setup = fs.readFileSync(new URL('../src/student-setup.jsx', import.meta.url), 'utf8')

test('launch splash renders before React root with canonical S-Hub logo', () => {
  const splashAt = indexHtml.indexOf('id="shub-launch-splash"')
  const rootAt = indexHtml.indexOf('id="root"')
  assert.ok(splashAt >= 0)
  assert.ok(rootAt > splashAt)
  assert.match(indexHtml, /src="\.\/icon\.svg\?v=9"/)
  assert.match(indexHtml, /id="shub-launch-progress-fill"/)
  assert.doesNotMatch(indexHtml, /shub-launch-silver/)
})

test('bootstrap and app only complete splash after app startup', () => {
  assert.match(bootstrap, /__shubLaunch\?\.progress/)
  assert.match(bootstrap, /__shubLaunch\?\.ready/)
  assert.match(main, /__shubLaunch\?\.ready/)
})

test('student onboarding has one canonical owner', () => {
  assert.match(main, /import \{ StudentSetup \} from '\.\/student-setup\.jsx'/)
  assert.doesNotMatch(main, /function StudentSetup\(/)
  assert.match(setup, /S-Hub 시작하기/)
  assert.match(setup, /setup-feature-grid/)
  assert.match(setup, /학교와 내 정보를 연결해/)
})
