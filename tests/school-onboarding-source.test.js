import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrapSource = fs.readFileSync(new URL('../src/app-bootstrap.jsx', import.meta.url), 'utf8')
const setupSource = fs.readFileSync(new URL('../src/student-setup.jsx', import.meta.url), 'utf8')
const syncSource = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
const stage3Source = fs.readFileSync(new URL('../src/stage3.js', import.meta.url), 'utf8')
const setupCss = fs.readFileSync(new URL('../src/school-setup.css', import.meta.url), 'utf8')

test('first setup is routed through the school-search bootstrap', () => {
  assert.match(indexSource, /src\/app-bootstrap\.jsx/)
  assert.doesNotMatch(indexSource, /type="module" src="\/src\/main\.jsx"/)
  assert.match(bootstrapSource, /StudentSetup/)
  assert.match(bootstrapSource, /saveStudentProfile/)
  assert.match(bootstrapSource, /import\('\.\/main\.jsx'\)/)
})

test('student setup requires school, grade, class, number, and name', () => {
  assert.match(setupSource, /searchNeisSchools/)
  assert.match(setupSource, /<span>학교<\/span>/)
  assert.match(setupSource, /<span>학년<\/span>/)
  assert.match(setupSource, /<span>반<\/span>/)
  assert.match(setupSource, /<span>번호<\/span>/)
  assert.match(setupSource, /<span>이름<\/span>/)
  assert.match(setupSource, /officeCode: selectedSchool\.officeCode/)
  assert.match(setupSource, /schoolCode: selectedSchool\.schoolCode/)
})

test('legacy Suji grade 2 data keys remain backward compatible while new schools are scoped', () => {
  assert.match(syncSource, /if \(isLegacySchoolScope\(normalized\)\) return `class-\$\{normalized\.classNumber\}`/)
  assert.match(syncSource, /school-\$\{normalized\.officeCode\}-\$\{normalized\.schoolCode\}-g\$\{normalized\.grade\}-c\$\{normalized\.classNumber\}/)
  assert.match(syncSource, /\.\.\.LEGACY_SCHOOL_CONTEXT/)
})

test('meal and academic data resolve the stored school profile', () => {
  assert.match(stage3Source, /readStudentProfile\(\)/)
  assert.match(stage3Source, /useSchoolDataCore\(now, readStudentProfile\(\)\)/)
})

test('school-search UI introduces no separate animation owner', () => {
  assert.doesNotMatch(setupCss, /@keyframes/)
  assert.doesNotMatch(setupCss, /animation\s*:/)
  assert.doesNotMatch(setupCss, /transition\s*:/)
})
