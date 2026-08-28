
export function reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey, state } = {}) {
  const actor = String(actorStudentKey || '')
  const recipient = String(recipientStudentKey || '')
  if (!recipient || recipient === actor) return false
  return state?.hidden !== true
}

function subjectParticle(name) {
  const text = String(name || '').trim()
  if (!text) return '가'
  const code = text.charCodeAt(text.length - 1)
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 === 0 ? '가' : '이'
  return '가'
}

export function reminderActivityBody({ actorName, action, title } = {}) {
  const actor = String(actorName || '').trim().slice(0, 20) || '친구'
  const cleanTitle = String(title || '').trim().slice(0, 80) || '리마인더'
  const verb = action === 'added' ? '추가했어요' : '수정했어요'
  return `${actor}${subjectParticle(actor)} ${cleanTitle} 리마인더를 ${verb}.`
}
