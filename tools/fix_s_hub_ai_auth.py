from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


path = 'src/firebase-ai-direct.js'
replace_once(
    path,
    "import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'\nimport { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'\n",
    "import { getAppCheck, getToken as getAppCheckToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'\nimport { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'\nimport { ensureSignedIn } from './school-sync'\n",
)
replace_once(path, "const DIRECT_APP_NAME = 'school-ai-recovery'", "const DIRECT_APP_NAME = 'school-sync'")
replace_once(
    path,
    "let directAI = null\nlet appCheckInitialized = false\n",
    "let directAI = null\nlet directAppCheck = null\nlet appCheckInitialized = false\n",
)
replace_once(
    path,
    """function getDirectAI() {
  if (directAI) return directAI
  const app = getApps().some((item) => item.name === DIRECT_APP_NAME)
    ? getApp(DIRECT_APP_NAME)
    : initializeApp(firebaseConfig, DIRECT_APP_NAME)

  if (!appCheckInitialized) {
    appCheckInitialized = true
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (error) {
      if (!/already|initialized/i.test(String(error?.message || ''))) throw error
    }
  }

  directAI = getAI(app, { backend: new GoogleAIBackend() })
  return directAI
}
""",
    """function getDirectApp() {
  return getApps().some((item) => item.name === DIRECT_APP_NAME)
    ? getApp(DIRECT_APP_NAME)
    : initializeApp(firebaseConfig, DIRECT_APP_NAME)
}

function getDirectAppCheck(app) {
  if (directAppCheck) return directAppCheck
  try {
    directAppCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error) {
    if (!/already|initialized/i.test(String(error?.message || ''))) throw error
    directAppCheck = getAppCheck(app)
  }
  appCheckInitialized = true
  return directAppCheck
}

async function getDirectSecurityContext() {
  const user = await ensureSignedIn()
  const app = getDirectApp()
  const appCheck = getDirectAppCheck(app)
  return { app, appCheck, user }
}

async function directFirebaseHeaders() {
  const { appCheck, user } = await getDirectSecurityContext()
  const idToken = await user.getIdToken()
  const appCheckResult = await getAppCheckToken(appCheck, false)
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': firebaseConfig.apiKey,
  }
  if (idToken) headers.Authorization = `Firebase ${idToken}`
  if (appCheckResult?.token) headers['X-Firebase-AppCheck'] = appCheckResult.token
  return headers
}

async function getDirectAI() {
  const { app } = await getDirectSecurityContext()
  if (!directAI) directAI = getAI(app, { backend: new GoogleAIBackend() })
  return directAI
}
""",
)
replace_once(
    path,
    """      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': firebaseConfig.apiKey,
      },
""",
    """      headers: await directFirebaseHeaders(),
""",
)
# There are two raw POST sites. Patch the second one separately after the first replacement.
replace_once(
    path,
    """      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': firebaseConfig.apiKey,
      },
""",
    """      headers: await directFirebaseHeaders(),
""",
)
replace_once(path, "  const ai = getDirectAI()\n", "  const ai = await getDirectAI()\n")

insert_before = """export async function generateDirectStructured({
  prompt = '',
"""
structured_helpers = """async function runSdkStructuredModel(modelName, {
  prompt,
  attachments,
  responseSchema,
  maxOutputTokens,
  timeoutMs,
  temperature,
}) {
  const ai = await getDirectAI()
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature,
      maxOutputTokens,
    },
  })
  const parts = (attachments || []).map(preparedPart).filter(Boolean)
  const result = await withTimeout(
    model.generateContent([String(prompt || ''), ...parts]),
    timeoutMs,
    modelName,
  )
  const raw = String(result?.response?.text?.() || '').trim()
  if (!raw) throw new Error(`Structured SDK AI ${modelName} returned an empty response`)
  try {
    return JSON.parse(raw)
  } catch {
    const error = new Error(`Structured SDK AI ${modelName} returned invalid JSON`)
    error.name = 'ReminderAIError'
    error.code = 'school-ai/structured-sdk-invalid-json'
    throw error
  }
}

async function runStructuredModel(modelName, args) {
  let appleRawError = null
  const appleStandalone = isAppleStandaloneWebApp()
  if (appleStandalone) {
    try {
      return await runRawStructuredModel(modelName, args)
    } catch (rawError) {
      appleRawError = rawError
      console.warn(`Authenticated raw iOS PWA structured AI failed for ${modelName}; trying SDK.`, rawError)
    }
  }

  try {
    return await runSdkStructuredModel(modelName, args)
  } catch (sdkError) {
    if (appleStandalone) {
      if (appleRawError && isQuotaError(appleRawError)) throw appleRawError
      throw sdkError
    }
    try {
      return await runRawStructuredModel(modelName, args)
    } catch {
      throw sdkError
    }
  }
}

"""
replace_once(path, insert_before, structured_helpers + insert_before)
replace_once(
    path,
    """      const value = await runRawStructuredModel(modelName, {
""",
    """      const value = await runStructuredModel(modelName, {
""",
)

# Force installed PWAs to refresh the new application shell.
replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v141'", "const CACHE_NAME = 'school-shell-v142'")

# Add regression coverage for authenticated Firebase AI requests and SDK fallback.
test_path = Path('tests/s-hub-ai-auth.test.js')
test_path.write_text("""import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\n\nconst read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')\n\ntest('direct Firebase AI reuses signed-in school app and attaches security credentials', () => {\n  const source = read('src/firebase-ai-direct.js')\n  assert.match(source, /DIRECT_APP_NAME = 'school-sync'/)\n  assert.match(source, /await ensureSignedIn\(\)/)\n  assert.match(source, /await user\.getIdToken\(\)/)\n  assert.match(source, /Authorization = `Firebase \$\{idToken\}`/)\n  assert.match(source, /X-Firebase-AppCheck/)\n  assert.match(source, /headers: await directFirebaseHeaders\(\)/)\n})\n\ntest('structured S-Hub AI has SDK and authenticated raw paths', () => {\n  const source = read('src/firebase-ai-direct.js')\n  assert.match(source, /async function runSdkStructuredModel/)\n  assert.match(source, /responseSchema,/)\n  assert.match(source, /async function runStructuredModel/)\n  assert.match(source, /await runStructuredModel\(modelName/)\n  assert.doesNotMatch(source, /const value = await runRawStructuredModel\(modelName/)\n})\n\ntest('service worker cache advances for AI auth repair', () => {\n  const sw = read('public/sw.js')\n  assert.match(sw, /school-shell-v142/)\n})\n""")
