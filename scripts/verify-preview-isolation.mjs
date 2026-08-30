import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'dist')
if (!fs.existsSync(root)) throw new Error(`Preview build directory not found: ${root}`)

function collectTextFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) collectTextFiles(target, output)
    else if (/\.(?:js|html)$/.test(entry.name)) output.push(target)
  }
  return output
}

const files = collectTextFiles(root)
const bundleText = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

assert.match(bundleText, /school-sync-preview/, 'preview Firebase app name was not isolated')
assert.match(bundleText, /preview-class-/, 'preview class document path was not isolated')
assert.match(bundleText, /preview\|/, 'preview student identity salt was not emitted')
assert.match(bundleText, /school\.preview\.studentProfile\.v1/, 'preview localStorage profile key was not isolated')

const swPath = path.join(root, 'sw.js')
assert.equal(fs.existsSync(swPath), true, 'preview service worker was not built')
const sw = fs.readFileSync(swPath, 'utf8')
assert.match(sw, /school-preview-shell-/, 'preview shell cache name was not isolated')
assert.match(sw, /school-preview-notification-profile-/, 'preview notification cache name was not isolated')
assert.match(sw, /key\.startsWith\('school-preview-'\)/, 'preview service worker could still clean production caches')
assert.doesNotMatch(sw, /const CACHE_NAME = 'school-shell-/, 'production cache name leaked into preview service worker')

console.log(`Preview isolation verified across ${files.length} built text files.`)
