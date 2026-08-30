import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  classNumberFromId,
  inferStudentNumber,
  studentKeyForRosterIdentity,
} from '../lib/class-roster.js'

test('production roster identity stays compatible while preview identity is isolated', () => {
  const productionKey = studentKeyForRosterIdentity({
    classNumber: 8,
    studentNumber: 12,
    name: '테스트학생',
  })
  const previewKey = studentKeyForRosterIdentity({
    classNumber: 8,
    studentNumber: 12,
    name: '테스트학생',
    preview: true,
  })

  assert.match(productionKey, /^student-[0-9a-f]{16}$/)
  assert.match(previewKey, /^student-[0-9a-f]{16}$/)
  assert.notEqual(previewKey, productionKey)
  assert.equal(classNumberFromId('class-8'), 8)
  assert.equal(classNumberFromId('preview-class-8'), 8)
  assert.equal(classNumberFromId('preview-class-31'), 0)
  assert.equal(inferStudentNumber({ classId: 'class-8', studentKey: productionKey, name: '테스트학생' }), 12)
  assert.equal(inferStudentNumber({ classId: 'preview-class-8', studentKey: previewKey, name: '테스트학생' }), 12)
  assert.equal(inferStudentNumber({ classId: 'class-8', studentKey: previewKey, name: '테스트학생' }), 0)
  assert.equal(inferStudentNumber({ classId: 'preview-class-8', studentKey: productionKey, name: '테스트학생' }), 0)
})

test('personal timetable uses the shared class parser so preview students stay supported', () => {
  const source = readFileSync(new URL('../api/personal-timetable.js', import.meta.url), 'utf8')
  assert.match(source, /import \{ classNumberFromId \} from '\.\.\/lib\/class-roster\.js'/)
  assert.match(source, /const classNumber = classNumberFromId\(classId\)/)
  assert.doesNotMatch(source, /replace\(\/\^class-\//)
})
