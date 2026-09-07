import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('repository-level agent contract points every future change at the canonical architecture rules', () => {
  const contract = read('AGENTS.md')

  assert.match(contract, /docs\/ARCHITECTURE\.md/)
  assert.match(contract, /docs\/UPDATE-CHECKLIST\.md/)
  assert.match(contract, /같은 책임에는 owner가 하나만 존재한다/)
  assert.match(contract, /canonical owner/)
  assert.match(contract, /신규 `\*-patch\.js`/)
  assert.match(contract, /MutationObserver/)
  assert.match(contract, /querySelector\(\.\.\.\)\.click\(\)/)
  assert.match(contract, /예외는 줄이는 방향으로만 갱신한다/)
})

test('canonical architecture documents keep the single-owner and raw-source migration contract', () => {
  const architecture = read('docs/ARCHITECTURE.md')
  const checklist = read('docs/UPDATE-CHECKLIST.md')

  assert.match(architecture, /같은 책임에는 주인이 하나만 존재한다/)
  assert.match(architecture, /신규 기능을 위해 새 문자열 치환 patch를 추가하는 것을 기본적으로 금지한다/)
  assert.match(architecture, /React가 직접 렌더한 DOM은 React가 소유한다/)
  assert.match(checklist, /현재 canonical owner를 먼저 찾고, 그 owner를 직접 수정했다/)
  assert.match(checklist, /병렬 component\/runtime\/listener\/subscription\/patch를 새로 만들지 않았다/)
  assert.match(checklist, /canonical raw source owner에서 수행했다/)
})

test('architecture protection tests remain part of the normal test suite', () => {
  const packageJson = JSON.parse(read('package.json'))
  const singleOwnerGuard = read('tests/single-owner-architecture.test.js')

  assert.match(packageJson.scripts?.test || '', /node --test/)
  assert.match(singleOwnerGuard, /new MutationObserver ownership is not added beyond frozen legacy sites/)
  assert.match(singleOwnerGuard, /new build-time source patch owners are not added/)
})

test('every pull request into main runs the full validation workflow before production deployment', () => {
  const workflow = read('.github/workflows/deploy.yml')

  assert.match(workflow, /pull_request:\n\s+branches:\n\s+- main/)
  assert.match(workflow, /name: Test production app\n\s+run: npm test/)
  assert.match(workflow, /name: Test board sheet lifecycle in Chromium and WebKit/)
  assert.match(workflow, /name: Build production app\n\s+run: npm run build/)
  assert.match(workflow, /name: Test production backend/)
  assert.match(workflow, /deploy:\n\s+if: github\.ref == 'refs\/heads\/main'/)
})
