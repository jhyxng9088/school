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
  if (cleanId.endsWith('/src/main.jsx')) return patchMainPresence(source)
  if (cleanId.endsWith('/src/todo-stage5-ai.jsx')) return patchTodoSectionSubmit(source)
  return String(source || '')
}
