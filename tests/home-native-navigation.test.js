import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('meal home preview uses the same React-owned navigation callback pattern as overview cards', () => {
  const meal = read('src/home-meal-preview.jsx')
  const main = read('src/main.jsx')

  assert.doesNotMatch(meal, /HomeNavAction/)
  assert.match(meal, /<button[\s\S]*className="meal-preview-action"[\s\S]*onClick=\{\(\) => onNavigate\?\.\('meal'\)\}/)
  assert.match(main, /<Stage3MealPreview now=\{now\} schoolData=\{schoolData\} onNavigate=\{onNavigate\} \/>/)
  assert.match(main, /if \(target === 'meal'\) \{\s*setScheduleSection\('meal'\)\s*changeTab\('schedule'\)/)
})

test('academic and reminder home cards use the React-owned Home navigation callback', () => {
  const academic = read('src/academic-shared.jsx')
  const todo = read('src/todo.jsx')
  const main = read('src/main.jsx')

  assert.doesNotMatch(academic, /HomeNavAction/)
  assert.match(academic, /className="home-detail-card-action"[\s\S]*onClick=\{\(\) => onNavigate\?\.\('academic'\)\}/)
  assert.doesNotMatch(todo, /HomeNavAction/)
  assert.match(todo, /className="home-detail-card-action"[\s\S]*onClick=\{\(\) => onNavigate\?\.\('reminder'\)\}/)
  assert.match(main, /if \(target === 'academic'\) \{\s*setScheduleSection\('academic'\)\s*changeTab\('schedule'\)/)
})

test('retired home navigation retrofit runtime stays removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/school-home-nav.js')), false)
  assert.doesNotMatch(read('index.html'), /school-home-nav\.js/)
  assert.doesNotMatch(read('public/sw.js'), /school-home-nav\.js/)
})


test('home dashboard styling never converts the native navigation overlay into layout content', () => {
  const styles = read('src/styles.css')

  assert.match(styles, /\.current-class-card > :not\(\.home-nav-action\) \{[\s\S]*position: relative;[\s\S]*z-index: 1;/)
  assert.doesNotMatch(styles, /\.current-class-card > \* \{[\s\S]*position: relative;/)
})


test('home meal preview is a full native-button dashboard card', () => {
  const meal = read('src/home-meal-preview.jsx')
  const styles = read('src/styles.css')

  assert.match(meal, /className="home-section meal-preview stage3-home-block"/)
  assert.match(meal, /type="button"[\s\S]*className="meal-preview-action"/)
  assert.match(styles, /\.app-content\.tab-home \.meal-preview-action \{[\s\S]*width: 100%;[\s\S]*touch-action: manipulation;/)
  assert.match(styles, /\.app-content\.tab-home \.todo-home-preview,[\s\S]*\.app-content\.tab-home \.meal-preview \{[\s\S]*border: 1px solid var\(--border\);/)
})


test('important home academic item is rounded and the list no longer draws a line across its top', () => {
  const styles = read('src/styles.css')

  assert.match(styles, /\.academic-preview \.academic-home-list \{[\s\S]*border: 0;[\s\S]*background: transparent;/)
  assert.match(styles, /\.academic-preview \.academic-home-item\.is-important \{[\s\S]*border-radius: 14px;[\s\S]*background:/)
})


test('home reminder preview shows four rows without growing the dashboard card rhythm', () => {
  const todo = read('src/todo.jsx')
  const styles = read('src/styles.css')

  assert.match(todo, /const visible = upcoming\.slice\(0, 4\)/)
  assert.match(styles, /\.todo-home-preview \.todo-home-item \{[\s\S]*min-height: 48px;[\s\S]*padding-block: 5px;/)
})
