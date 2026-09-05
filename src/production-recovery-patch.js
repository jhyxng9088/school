function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
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

  const beforeCount = countOccurrences(source, before)
  const afterCount = countOccurrences(source, after)
  if (beforeCount === 0 && afterCount === 1) return String(source || '')
  if (beforeCount !== 1 || afterCount !== 0) {
    throw new Error(`S-Hub production recovery patch drift: expected exactly one legacy or canonical section submit, found legacy=${beforeCount}, canonical=${afterCount}: section submit pending-sync handling`)
  }
  return String(source || '').replace(before, after)
}

export function patchProductionRecoverySource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/todo-stage5-ai.jsx')) return patchTodoSectionSubmit(source)
  return String(source || '')
}
