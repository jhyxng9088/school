import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import viteConfig from '../vite.config.js'

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const featurePlugin = viteConfig.plugins.find((plugin) => plugin.name === 'school-s-hub-v2-features')

test('Windows CRLF checkout transforms the same station navigation as LF', () => {
  assert.ok(featurePlugin)
  const filename = 'C:/Users/test/school-pen-preview/src/main.jsx'
  const lf = featurePlugin.transform(mainSource, filename)
  const crlf = featurePlugin.transform(mainSource.replace(/\n/g, '\r\n'), filename)

  assert.ok(lf?.code)
  assert.equal(crlf?.code, lf.code)
  assert.match(crlf.code, /\{ id: 'class', label: '우리반' \}/)
})
