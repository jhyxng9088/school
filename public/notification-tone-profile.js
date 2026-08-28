(() => {
  const PROFILE_KEY = 'school.studentProfile.v1'
  const TARGET_STUDENT_KEY = 'student-a63dc064d4c5227e'
  let lastSentMarker = ''

  function hash32(value, seed) {
    let hash = seed >>> 0
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
      hash ^= hash >>> 13
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }

  function studentKeyForProfile(profile) {
    if (!profile || typeof profile !== 'object') return ''
    const name = String(profile.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ')
    const classNumber = Number(profile.classNumber)
    const studentNumber = Number(profile.studentNumber)
    if (!name || !Number.isInteger(classNumber) || !Number.isInteger(studentNumber)) return ''
    const compactName = name.toLowerCase().replace(/\s+/g, '')
    const identity = `${classNumber}|${studentNumber}|${compactName}`
    return `student-${hash32(identity, 2166136261)}${hash32(identity, 2246822519)}`
  }

  function currentToneStudentKey() {
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
      const studentKey = studentKeyForProfile(profile)
      return studentKey === TARGET_STUDENT_KEY ? studentKey : ''
    } catch {
      return ''
    }
  }

  async function syncNotificationToneProfile(force = false) {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration().catch(() => null)
    if (!registration) return
    const studentKey = currentToneStudentKey()
    const marker = studentKey || 'default'
    if (!force && marker === lastSentMarker) return
    const worker = registration.active || navigator.serviceWorker.controller || registration.waiting || registration.installing
    if (!worker) return
    worker.postMessage({ type: 'SET_NOTIFICATION_TONE_PROFILE', studentKey })
    lastSentMarker = marker
  }

  window.addEventListener('load', () => syncNotificationToneProfile(true))
  window.addEventListener('focus', () => syncNotificationToneProfile())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNotificationToneProfile()
  })
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    lastSentMarker = ''
    syncNotificationToneProfile(true)
  })

  window.setInterval(() => syncNotificationToneProfile(), 5000)
})()
