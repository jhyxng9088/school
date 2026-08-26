from pathlib import Path

p = Path('src/firebase-ai-direct.js')
t = p.read_text()
old = '''async function runModel(modelName, args) {
  // iOS/iPadOS standalone PWAs have previously failed reCAPTCHA/App Check attestation
  // in this app. Try the already-proven Firebase AI REST route first there, then the SDK.
  if (isAppleStandaloneWebApp()) {
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch (rawError) {
      console.warn(`Raw iOS PWA title AI failed for ${modelName}; trying SDK.`, rawError)
    }
  }

  try {
    return await runSdkModel(modelName, args)
  } catch (sdkError) {
    if (isAppleStandaloneWebApp()) throw sdkError
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch {
      throw sdkError
    }
  }
}'''
new = '''async function runModel(modelName, args) {
  // iOS/iPadOS standalone PWAs have previously failed reCAPTCHA/App Check attestation
  // in this app. Try the already-proven Firebase AI REST route first there, then the SDK.
  let appleRawError = null
  const appleStandalone = isAppleStandaloneWebApp()
  if (appleStandalone) {
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch (rawError) {
      appleRawError = rawError
      console.warn(`Raw iOS PWA title AI failed for ${modelName}; trying SDK.`, rawError)
    }
  }

  try {
    return await runSdkModel(modelName, args)
  } catch (sdkError) {
    if (appleStandalone) {
      // Preserve a real quota signal from the REST attempt even if App Check then masks it.
      if (appleRawError && isQuotaError(appleRawError)) throw appleRawError
      throw sdkError
    }
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch {
      throw sdkError
    }
  }
}'''
if t.count(old) != 1:
    raise SystemExit(f'Expected one runModel block, found {t.count(old)}')
p.write_text(t.replace(old, new, 1).rstrip() + '\n')
print('iOS quota signal preservation applied')
