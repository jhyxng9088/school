import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('school pages render the stored school instead of hard-coded Suji labels', () => {
  const meal = read('src/meal-page.jsx')
  const academic = read('src/academic-shared.jsx')
  assert.match(meal, /readStudentProfile\(\)/)
  assert.match(meal, /profile\?\.schoolName \|\| '학교'/)
  assert.doesNotMatch(meal, /<p className="date-label">수지고등학교<\/p>/)
  assert.match(academic, /readStudentProfile\(\)/)
  assert.match(academic, /profile\?\.schoolName \|\| '학교'/)
  assert.doesNotMatch(academic, /2학년 · 수지고등학교/)
})

test('bootstrap rotates anonymous auth only when the selected school identity changes', () => {
  const bootstrap = read('src/app-bootstrap.jsx')
  const migration = read('src/student-auth-migration.js')
  assert.match(bootstrap, /const previousProfileSignature = profileSignature\(profile\)/)
  assert.match(bootstrap, /const savedSignature = profileSignature\(saved\)/)
  assert.match(bootstrap, /previousProfileSignature && previousProfileSignature !== savedSignature/)
  assert.match(bootstrap, /await startConfiguredApp\(saved, schoolIdentityChanged\)/)
  assert.match(bootstrap, /recoverStudentAuthForProfile\(/)
  assert.match(bootstrap, /\{ force: forceAuthReset \}/)
  assert.match(migration, /\{ force = false \} = \{\}/)
  assert.match(migration, /if \(!force && \(!marker \|\| marker\.endsWith\(`\|\$\{signature\}`\)\)\) return false/)
  assert.match(migration, /user\.isAnonymous/)
  assert.match(migration, /await signOut\(auth\)/)
  assert.match(migration, /window\.location\.reload\(\)/)
})

test('study realtime school topic is isolated by school-grade digest', async () => {
  const source = read('src/preview-study-realtime.js')
  assert.match(source, /studySchoolTopicForClassId/)
  assert.match(source, /\^s-\(\[0-9a-f\]\{12\}\)-c/)
  assert.match(source, /preview-study-school-\$\{scoped\[1\]\.toLowerCase\(\)\}-v1/)
  assert.match(source, /const schoolTopic = currentSchoolStudyTopic\(\)/)
  assert.doesNotMatch(source, /broadcastTopic\(SCHOOL_STUDY_TOPIC/)
})
