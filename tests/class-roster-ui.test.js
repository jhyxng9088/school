import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home presence counter loads the authenticated class roster modal without changing main home logic', () => {
  const index = read('index.html')
  const source = read('src/class-roster-ui.js')
  const main = read('src/main.jsx')

  assert.match(index, /<script type="module" src="\/src\/class-roster-ui\.js"><\/script>/)
  assert.match(source, /import \{ ensureSignedIn, readStudentProfile \} from '\.\/school-sync'/)
  assert.match(source, /school-reminder-backend\.vercel\.app\/api\/class-roster/)
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /counter\.classList\.add\('is-roster-button'\)/)
  assert.match(source, /counter\.setAttribute\('role', 'button'\)/)
  assert.match(source, /counter\.addEventListener\('click', openModal\)/)
  assert.match(source, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(source, /class-roster-modal/)
  assert.match(source, /class-roster-title/)
  assert.match(source, /등록 확인 필요/)
  assert.match(source, /잘못된 인원으로 합치지 않고 따로 보류했어요/)

  // Keep the existing React presence counter intact; the roster UI enhances it externally.
  assert.match(main, /className=\{`class-presence-count \$\{presence\.total > 0 \? 'is-ready' : ''\}`\}/)
  assert.match(main, /\{presence\.online\}\/\{presence\.total\}/)
})

test('class roster modal has restrained open-close motion and reduced-motion fallback', () => {
  const css = read('src/class-roster.css')

  assert.match(css, /\.class-roster-modal[\s\S]*transform: translate3d\(0, 13px, 0\) scale\(0\.982\)/)
  assert.match(css, /\.class-roster-layer\.is-open \.class-roster-modal[\s\S]*scale\(1\)/)
  assert.match(css, /animation: class-roster-row-in 460ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.class-roster-row[\s\S]*animation: none !important/)
})
