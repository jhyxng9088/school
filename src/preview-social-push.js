import { ensureSignedIn } from './school-sync.js'

const SOCIAL_PUSH_URL = 'https://school-reminder-backend.vercel.app/api/social-dispatch'

async function dispatch(payload) {
  try {
    const user = await ensureSignedIn()
    const token = String(await user.getIdToken()).trim()
    if (!token) return null
    const response = await fetch(SOCIAL_PUSH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.ok !== true) {
      console.warn('S-Hub social push dispatch rejected:', body?.error || response.status)
      return null
    }
    return body
  } catch (error) {
    // Social push is best-effort. A notification outage must never make a
    // successful board post or study start look like it failed to the student.
    console.warn('S-Hub social push dispatch unavailable:', error)
    return null
  }
}

export function dispatchPreviewBoardPostPush(post = {}) {
  const postId = String(post?.id || '').trim()
  const sectionId = String(post?.sectionId || 'general').trim()
  if (!sectionId) return Promise.resolve(null)
  return dispatch({ kind: 'board-post', postId, sectionId })
}

export function dispatchPreviewStudyStartPush(active) {
  const subject = String(active?.subject || '').trim()
  const startedAt = Number(active?.startedAt || 0)
  if (!subject || !Number.isFinite(startedAt) || startedAt <= 0) return Promise.resolve(null)
  return dispatch({ kind: 'study-start', subject, startedAt })
}
