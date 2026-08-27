from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


def write(path, content):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + '\n')


# Expose the exact security headers already used by the proven direct Firebase AI path.
replace_once(
    'src/firebase-ai-direct.js',
    "\nasync function getDirectAI() {",
    "\nexport async function getDirectFirebaseSecurityHeaders() {\n  return directFirebaseHeaders()\n}\n\nasync function getDirectAI() {",
)

# S-Hub gets Firebase Auth + App Check once, then sends them to our Vercel proxy.
replace_once(
    'src/s-hub-ai-transport.js',
    "import { ensureSignedIn } from './school-sync'\n\n",
    "",
)
replace_once(
    'src/s-hub-ai-transport.js',
    """  const user = await ensureSignedIn()
  const idToken = await user.getIdToken()
  const controller = new AbortController()
""",
    """  let idToken = ''
  let appCheckToken = ''
  try {
    const { getDirectFirebaseSecurityHeaders } = await import('./firebase-ai-direct.js')
    const securityHeaders = await getDirectFirebaseSecurityHeaders()
    idToken = String(securityHeaders.Authorization || '').replace(/^Firebase\\s+/i, '').trim()
    appCheckToken = String(securityHeaders['X-Firebase-AppCheck'] || '').trim()
  } catch (error) {
    throw transportError(
      '앱 인증 정보를 확인하지 못했어. 앱을 완전히 종료한 뒤 다시 열어줘.',
      String(error?.code || 'school-ai/app-check-unavailable'),
      401,
    )
  }
  if (!idToken || !appCheckToken) {
    throw transportError('앱 인증 정보를 확인하지 못했어. 앱을 다시 열어줘.', 'school-ai/security-token-missing', 401)
  }

  const controller = new AbortController()
""",
)
replace_once(
    'src/s-hub-ai-transport.js',
    """        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
""",
    """        Authorization: `Bearer ${idToken}`,
        'X-Firebase-AppCheck': appCheckToken,
        'Content-Type': 'application/json',
""",
)

# Server uses the same Firebase AI Logic credentials as the browser path,
# but performs the cross-origin fetch server-side to avoid iOS PWA fetch/CORS failures.
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    "const DEFAULT_MODELS = [",
    "const FIREBASE_AI_API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'\n\nconst DEFAULT_MODELS = [",
)
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    """  projectId,
  accessToken,
  modelName,
""",
    """  projectId,
  firebaseIdToken,
  appCheckToken,
  modelName,
""",
)
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    """      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-api-client': 's-hub-server/1.0',
      },
""",
    """      headers: {
        Authorization: `Firebase ${firebaseIdToken}`,
        'X-Firebase-AppCheck': appCheckToken,
        'Content-Type': 'application/json',
        'x-goog-api-key': FIREBASE_AI_API_KEY,
        'x-goog-api-client': 's-hub-server/1.0',
      },
""",
)
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    """  projectId,
  accessToken,
  prompt,
""",
    """  projectId,
  firebaseIdToken,
  appCheckToken,
  prompt,
""",
)
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    """  const safeProjectId = String(projectId || '').trim()
  const safeToken = String(accessToken || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  if (!safeProjectId || !safeToken || !safePrompt) {
""",
    """  const safeProjectId = String(projectId || '').trim()
  const safeFirebaseIdToken = String(firebaseIdToken || '').trim()
  const safeAppCheckToken = String(appCheckToken || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  if (!safeProjectId || !safeFirebaseIdToken || !safeAppCheckToken || !safePrompt) {
""",
)
replace_once(
    'push-backend-v2/lib/s-hub-ai-service.js',
    """        projectId: safeProjectId,
        accessToken: safeToken,
        modelName,
""",
    """        projectId: safeProjectId,
        firebaseIdToken: safeFirebaseIdToken,
        appCheckToken: safeAppCheckToken,
        modelName,
""",
)

replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    "import { adminAccessToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'",
    "import { adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'",
)
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    "res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')",
    "res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-firebase-appcheck')",
)
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })

  try {
""",
    """  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })
  const appCheckToken = String(req.headers['x-firebase-appcheck'] || '').trim()
  if (!appCheckToken) return res.status(401).json({ ok: false, error: 'missing_app_check', message: '앱 인증 정보를 확인하지 못했어.' })

  try {
""",
)
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """    const accessToken = await adminAccessToken()
    const result = await generateStructuredWithFirebaseAI({
      projectId: adminProjectId(),
      accessToken,
      prompt,
""",
    """    const result = await generateStructuredWithFirebaseAI({
      projectId: adminProjectId(),
      firebaseIdToken: token,
      appCheckToken,
      prompt,
""",
)

# Requested hint cadence and PWA cache refresh.
replace_once('src/s-hub-ai-sheet.jsx', '    }, 1800)', '    }, 2500)')
replace_once('public/sw.js', "school-shell-v143", "school-shell-v144")
replace_once('tests/s-hub-ai-auth.test.js', 'school-shell-v143', 'school-shell-v144')

write('tests/s-hub-ai-server-route.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub structured AI proxies the proven Firebase Auth and App Check credentials', () => {
  const ai = read('src/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  const direct = read('src/firebase-ai-direct.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(ai, /generateSchoolStructured/)
  assert.doesNotMatch(ai, /generateDirectStructured/)
  assert.match(transport, /school-reminder-backend\.vercel\.app\/api\/s-hub-ai/)
  assert.match(transport, /getDirectFirebaseSecurityHeaders/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(transport, /'X-Firebase-AppCheck': appCheckToken/)
  assert.match(direct, /export async function getDirectFirebaseSecurityHeaders/)
  assert.match(endpoint, /x-firebase-appcheck/)
  assert.match(endpoint, /firebaseIdToken: token/)
  assert.match(service, /Authorization: `Firebase \$\{firebaseIdToken\}`/)
  assert.match(service, /'X-Firebase-AppCheck': appCheckToken/)
  assert.match(service, /'x-goog-api-key': FIREBASE_AI_API_KEY/)
})

test('S-Hub input hints rotate with a soft 2.5 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /QUESTION_HINTS/)
  assert.match(sheet, /NOTICE_HINTS/)
  assert.match(sheet, /window\.setInterval\(\(\) => \{/)
  assert.match(sheet, /\}, 2500\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /textarea\.is-hint-fading::placeholder/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after the App Check proxy repair', () => {
  assert.match(read('public/sw.js'), /school-shell-v144/)
})
""")

write('push-backend-v2/test/s-hub-ai-service.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredWithFirebaseAI, requestFirebaseModel } from '../lib/s-hub-ai-service.js'

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

test('server Firebase AI request forwards Firebase Auth, App Check and API key', async () => {
  const originalFetch = globalThis.fetch
  let request = null
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok' }) }] } }],
    })
  }
  try {
    const value = await requestFirebaseModel({
      projectId: 'school-test',
      firebaseIdToken: 'firebase-user-token',
      appCheckToken: 'app-check-token',
      modelName: 'gemini-test',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(value, { answer: 'ok' })
    assert.equal(request.init.headers.Authorization, 'Firebase firebase-user-token')
    assert.equal(request.init.headers['X-Firebase-AppCheck'], 'app-check-token')
    assert.ok(request.init.headers['x-goog-api-key'])
    assert.match(request.url, /firebasevertexai\.googleapis\.com/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI falls back to the next model on a retryable failure', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return response(503, { error: { status: 'UNAVAILABLE', message: 'try later' } })
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'second' }) }] } }],
    })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test',
      firebaseIdToken: 'firebase-user-token',
      appCheckToken: 'app-check-token',
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 8000,
      models: ['model-one', 'model-two'],
    })
    assert.equal(result.value.answer, 'second')
    assert.equal(result.modelName, 'model-two')
    assert.equal(result.attempts.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI does not fan out an authorization failure across models', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } })
  }
  try {
    await assert.rejects(
      generateStructuredWithFirebaseAI({
        projectId: 'school-test',
        firebaseIdToken: 'firebase-user-token',
        appCheckToken: 'app-check-token',
        prompt: 'hello',
        responseSchema: schema,
        timeoutMs: 8000,
        models: ['model-one', 'model-two'],
      }),
      (error) => error.status === 403 && error.attempts.length === 1,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
""")

# Probe served its purpose; never keep it in the final repository tree.
probe = Path('push-backend-v2/api/ai-probe.js')
if probe.exists():
    probe.unlink()
