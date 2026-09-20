import { cleanNotificationLabel } from './notification-copy.js'

export function reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey, state } = {}) {
  const actor = String(actorStudentKey || '')
  const recipient = String(recipientStudentKey || '')
  if (!recipient || recipient === actor) return false
  return state?.hidden !== true
}

export function reminderActivityBody({ actorName, action, title } = {}) {
  const actor = String(actorName || '').trim().slice(0, 20) || '친구'
  const cleanTitle = cleanNotificationLabel(title, '리마인더')
  const verb = action === 'added' ? '추가했습니다' : '수정했습니다'
  return `${actor}님이 ${cleanTitle} 리마인더를 ${verb}.`
}


export function classActivityBody({ actorName, action, entityType, title } = {}) {
  const actor = String(actorName || '').trim().slice(0, 20) || '친구'
  if (entityType === 'timetable') return `${actor}님이 시간표를 변경했습니다.`

  const cleanTitle = cleanNotificationLabel(title)
  const verb = action === 'added' ? '추가했습니다' : '수정했습니다'
  return cleanTitle
    ? `${actor}님이 ${cleanTitle} 학사일정을 ${verb}.`
    : `${actor}님이 학사일정을 ${verb}.`
}
