function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
}

function replaceExact(source, marker, replacement, label) {
  const count = countOccurrences(source, marker)
  if (count !== 1) {
    throw new Error(`S-Hub production recovery patch drift: expected 1 occurrence, found ${count}: ${label}`)
  }
  return String(source || '').replace(marker, replacement)
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const next = String(source || '')
  const start = next.indexOf(startMarker)
  if (start < 0) throw new Error(`S-Hub production recovery patch drift: start marker missing: ${label}`)
  const end = next.indexOf(endMarker, start)
  if (end < 0) throw new Error(`S-Hub production recovery patch drift: end marker missing: ${label}`)
  return `${next.slice(0, start)}${replacement}${next.slice(end)}`
}

function patchPresenceRuntime(source) {
  return replaceExact(
    source,
    "const DATABASE_URL = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).trim()",
    "const DATABASE_URL = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || '').trim()",
    'RTDB explicit opt-in',
  )
}

function patchMainPresence(source) {
  const before = `            <span
              className={\`class-presence-count \${presence.total > 0 ? 'is-ready' : ''}\`}
              aria-hidden={presence.total <= 0}
              aria-label={presence.total > 0 ? \`현재 접속 \${presence.online}명, 반 인원 \${presence.total}명\` : undefined}
            >
              {presence.online}/{presence.total}
            </span>`

  const after = `            <span
              className={\`class-presence-count \${(presence.online > 0 || presence.total > 0) ? 'is-ready' : ''}\`}
              aria-hidden={presence.online <= 0 && presence.total <= 0}
              aria-label={
                presence.total > 0
                  ? \`현재 접속 \${presence.online}명, 반 인원 \${presence.total}명\`
                  : presence.online > 0
                    ? \`현재 접속 \${presence.online}명\`
                    : undefined
              }
            >
              {presence.total > 0 ? \`\${presence.online}/\${presence.total}\` : presence.online > 0 ? \`\${presence.online}명\` : ''}
            </span>`

  return replaceExact(source, before, after, 'presence display readiness')
}

function patchReminderSectionClient(source) {
  let next = String(source || '')
  next = replaceExact(
    next,
    "const REMINDER_SECTION_FALLBACK_API_URL = 'https://school-reminder-backend-mm1t9pzs6-jhyxng9088-7711.vercel.app/api/reminder-sections'\n",
    '',
    'remove temporary reminder-section backend bridge',
  )

  next = replaceBetween(
    next,
    'function queueableUpdateError(error) {',
    '\nasync function postSectionChange',
    `function queueableUpdateError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return (
    code === '8'
    || code === 'RESOURCE_EXHAUSTED'
    || code === 'reminder-section/quota-exhausted'
    || /resource[_ -]?exhausted|quota exceeded/i.test(\`${'${code} ${message}'}\`)
  )
}
`,
    'quota-only section fallback',
  )

  next = replaceBetween(
    next,
    'async function requestSectionChange(payload) {',
    '\nexport async function flushPendingReminderSectionChanges',
    `async function requestSectionChange(payload) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw sectionError('reminder-section/auth-required', 'Authentication required')

  const result = await postSectionChange(REMINDER_SECTION_API_URL, payload, idToken)
  if (result.networkError || !result.response) {
    throw sectionError('reminder-section/network', 'Reminder section server unavailable')
  }

  if (!result.response.ok || result.body?.ok !== true) {
    const code = String(result.body?.error || 'reminder-section/server')
    if (code === '8' || /resource[_ -]?exhausted|quota/i.test(code)) {
      throw sectionError('reminder-section/quota-exhausted', 'Firestore quota exceeded')
    }
    throw sectionError(
      code,
      String(result.body?.message || 'Reminder section save failed'),
    )
  }
  return result.body.data || {}
}
`,
    'single production section backend',
  )

  next = replaceExact(
    next,
    `    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.reload(), 160)
    }
    return {`,
    '    return {',
    'remove section save reload',
  )

  return next
}

function patchTodoSectionSubmit(source) {
  const before = `      await saveReminderSectionChange({
        action: 'update',
        sectionId: target.id,
        label,
        color: sectionEditColor,
        categories,
      })
      setSectionEditOpen(false)`

  const after = `      const result = await saveReminderSectionChange({
        action: 'update',
        sectionId: target.id,
        label,
        color: sectionEditColor,
        categories,
      })
      if (result?.pendingSync) {
        setSectionEditError('서버 사용량 제한으로 이 기기에 임시 저장했어요. 서버가 복구되면 자동으로 동기화돼요.')
        return
      }
      setSectionEditOpen(false)`

  return replaceExact(source, before, after, 'section submit pending-sync handling')
}

export function patchProductionRecoverySource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/presence-rtdb.js')) return patchPresenceRuntime(source)
  if (cleanId.endsWith('/src/main.jsx')) return patchMainPresence(source)
  if (cleanId.endsWith('/src/reminder-section-client.js')) return patchReminderSectionClient(source)
  if (cleanId.endsWith('/src/todo-stage5-ai.jsx')) return patchTodoSectionSubmit(source)
  return String(source || '')
}
