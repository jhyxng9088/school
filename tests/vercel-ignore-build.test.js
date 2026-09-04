import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptSource = fs.readFileSync(path.join(root, 'push-backend-v2/scripts/vercel-ignore-build.sh'), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'push-backend-v2/vercel.json'), 'utf8'))

function run(cwd, command, args, env = process.env) {
  return spawnSync(command, args, { cwd, env, encoding: 'utf8' })
}

function git(cwd, ...args) {
  const result = run(cwd, 'git', args)
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function commit(cwd, message) {
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', message)
}

function decision(repoRoot, branch) {
  return run(
    path.join(repoRoot, 'push-backend-v2'),
    'sh',
    ['scripts/vercel-ignore-build.sh'],
    { ...process.env, VERCEL_GIT_COMMIT_REF: branch },
  ).status
}

test('Vercel backend preview guard skips only low-value branch builds', () => {
  assert.equal(vercelConfig.ignoreCommand, 'sh scripts/vercel-ignore-build.sh')

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'shub-vercel-guard-'))
  try {
    fs.mkdirSync(path.join(temp, 'push-backend-v2', 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(temp, 'push-backend-v2', 'scripts', 'vercel-ignore-build.sh'), scriptSource)
    fs.writeFileSync(path.join(temp, 'push-backend-v2', 'api.txt'), 'v1\n')
    fs.writeFileSync(path.join(temp, 'frontend.txt'), 'v1\n')

    git(temp, 'init', '-q')
    git(temp, 'config', 'user.email', 'test@example.com')
    git(temp, 'config', 'user.name', 'S-Hub Test')
    commit(temp, 'initial')

    fs.writeFileSync(path.join(temp, 'frontend.txt'), 'v2\n')
    commit(temp, 'frontend only')

    assert.equal(decision(temp, 'main'), 1)
    assert.equal(decision(temp, 'preview/s-hub-v2'), 1)
    assert.equal(decision(temp, 'stability/frontend-only'), 0)
    assert.equal(decision(temp, 'feature/unknown'), 1)

    fs.writeFileSync(path.join(temp, 'push-backend-v2', 'api.txt'), 'v2\n')
    commit(temp, 'backend change')

    assert.equal(decision(temp, 'stability/backend-change'), 1)
    assert.equal(decision(temp, 'safety/checkpoint'), 0)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
