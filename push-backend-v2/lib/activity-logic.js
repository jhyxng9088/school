
export function reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey, state } = {}) {
  const actor = String(actorStudentKey || '')
  const recipient = String(recipientStudentKey || '')
  if (!recipient || recipient === actor) return false
  return state?.hidden !== true
}

export function reminderActivityBody({ actorName, action, title } = {}) {
  const actor = String(actorName || '').trim().slice(0, 20) || '친구'
  const cleanTitle = String(title || '').trim().slice(0, 80) || '리마인더'
  const verb = action === 'added' ? '추가했어요' : '수정했어요'
  return `${actor}님이 ${cleanTitle} 리마인더를 ${verb}.`
}
