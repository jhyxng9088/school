from pathlib import Path

path = Path('src/push-client.js')
text = path.read_text()

old = "const DEVICE_ID_KEY = 'school.pushDeviceId.v1'\nconst PROMPT_SESSION_KEY = 'school.pushPromptSeen.v1'\nconst CONTACT_NOTICE_KEY = 'school.contactNotice.v1'"
new = "const DEVICE_ID_KEY = 'school.pushDeviceId.v1'\nconst CONTACT_NOTICE_KEY = 'school.contactNotice.v1'"
assert text.count(old) == 1, 'push prompt constants changed unexpectedly'
text = text.replace(old, new)

old = '''async function maybeShowPermissionPrompt(profile) {
  if (!pushSupported() || Notification.permission !== 'default') return
  if (IOS && !isStandalone()) return
  if (sessionStorage.getItem(PROMPT_SESSION_KEY) === 'shown') return
  if (localStorage.getItem(CONTACT_NOTICE_KEY) !== 'done') {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }
  if (document.querySelector('.first-run-notice-layer, .school-push-prompt')) {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }

  sessionStorage.setItem(PROMPT_SESSION_KEY, 'shown')
  installPromptStyles()
  const layer = document.createElement('section')
  layer.className = 'school-push-prompt'
  layer.setAttribute('role', 'status')
  layer.innerHTML = `
    <div class="school-push-prompt-copy">
      <strong>알림 켜기</strong>
      <span>시간표 변경 · 다음 수업 · 급식을 알려줄게.</span>
    </div>
    <button class="school-push-enable" type="button">켜기</button>
    <button class="school-push-close" type="button" aria-label="나중에">×</button>
  `

  layer.querySelector('.school-push-close')?.addEventListener('click', () => removePrompt(layer))
  layer.querySelector('.school-push-enable')?.addEventListener('click', async () => {
    const button = layer.querySelector('.school-push-enable')
    if (button) button.disabled = true
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') await ensurePushSubscription(profile)
      removePrompt(layer)
    } catch (error) {
      console.error('Push permission setup failed:', error)
      removePrompt(layer)
    } finally {
      if (button) button.disabled = false
    }
  })

  document.body.appendChild(layer)
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')))
}
'''
new = '''async function maybeShowPermissionPrompt(profile) {
  if (!pushSupported() || Notification.permission === 'granted') return
  if (IOS && !isStandalone()) return
  if (document.hidden) return
  if (localStorage.getItem(CONTACT_NOTICE_KEY) !== 'done') {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }
  if (document.querySelector('.first-run-notice-layer, .school-push-prompt')) {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }

  const permissionDenied = Notification.permission === 'denied'
  installPromptStyles()
  const layer = document.createElement('section')
  layer.className = 'school-push-prompt'
  layer.setAttribute('role', 'status')
  layer.innerHTML = `
    <div class="school-push-prompt-copy">
      <strong>알림 켜기</strong>
      <span>${permissionDenied ? '기기 설정에서 S-Hub 알림을 허용해줘.' : '시간표 변경 · 다음 수업 · 급식을 알려줄게.'}</span>
    </div>
    <button class="school-push-enable" type="button">${permissionDenied ? '확인' : '켜기'}</button>
    <button class="school-push-close" type="button" aria-label="나중에">×</button>
  `

  layer.querySelector('.school-push-close')?.addEventListener('click', () => removePrompt(layer))
  layer.querySelector('.school-push-enable')?.addEventListener('click', async () => {
    const button = layer.querySelector('.school-push-enable')
    if (button) button.disabled = true
    try {
      if (permissionDenied) {
        removePrompt(layer)
        return
      }
      const permission = await Notification.requestPermission()
      if (permission === 'granted') await ensurePushSubscription(profile)
      removePrompt(layer)
    } catch (error) {
      console.error('Push permission setup failed:', error)
      removePrompt(layer)
    } finally {
      if (button) button.disabled = false
    }
  })

  document.body.appendChild(layer)
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')))
}

function installPermissionPromptEntryWatcher(profile) {
  let leftApp = false

  const refreshPermissionState = () => {
    if (document.hidden) {
      leftApp = true
      return
    }
    if (!leftApp) return
    leftApp = false

    if (Notification.permission === 'granted') {
      const layer = document.querySelector('.school-push-prompt')
      if (layer) removePrompt(layer)
      ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
      return
    }
    maybeShowPermissionPrompt(profile)
  }

  document.addEventListener('visibilitychange', refreshPermissionState)
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || document.hidden) return
    leftApp = true
    refreshPermissionState()
  })
}
'''
assert text.count(old) == 1, 'permission prompt implementation changed unexpectedly'
text = text.replace(old, new)

old = '''  watchOwnActivity(profile)
  watchOwnAcademic(profile)

  if (Notification.permission === 'granted') {
    ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
  } else if (Notification.permission === 'default') {
    maybeShowPermissionPrompt(profile)
  }
}'''
new = '''  watchOwnActivity(profile)
  watchOwnAcademic(profile)
  installPermissionPromptEntryWatcher(profile)

  if (Notification.permission === 'granted') {
    ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
  } else {
    maybeShowPermissionPrompt(profile)
  }
}'''
assert text.count(old) == 1, 'push bridge startup changed unexpectedly'
text = text.replace(old, new)
path.write_text(text)

Path('tests/push-prompt-every-entry.test.js').write_text("""import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\n\nconst source = fs.readFileSync(new URL('../src/push-client.js', import.meta.url), 'utf8')\n\ntest('notification prompt is offered whenever permission is not granted', () => {\n  assert.match(source, /Notification\\.permission === 'granted'\\) return/)\n  assert.doesNotMatch(source, /PROMPT_SESSION_KEY|school\\.pushPromptSeen|sessionStorage\\.getItem/)\n  assert.match(source, /permissionDenied = Notification\\.permission === 'denied'/)\n  assert.match(source, /기기 설정에서 S-Hub 알림을 허용해줘/)\n})\n\ntest('returning to the app offers the prompt again and refreshes granted subscriptions', () => {\n  assert.match(source, /function installPermissionPromptEntryWatcher\\(profile\\)/)\n  assert.match(source, /document\\.addEventListener\\('visibilitychange', refreshPermissionState\\)/)\n  assert.match(source, /if \\(document\\.hidden\\) \\{\\n\\s+leftApp = true/)\n  assert.match(source, /if \\(Notification\\.permission === 'granted'\\) \\{[\\s\\S]*ensurePushSubscription\\(profile\\)/)\n  assert.match(source, /installPermissionPromptEntryWatcher\\(profile\\)/)\n  assert.match(source, /else \\{\\n\\s+maybeShowPermissionPrompt\\(profile\\)/)\n})\n""")
