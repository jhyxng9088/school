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

function patchStudyClassLabel(source) {
  const before = `function classLabel(classId) {
  const match = /^preview-class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  const after = `function classLabel(classId) {
  const match = /^(?:preview-)?class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  const beforeCount = countOccurrences(source, before)
  const afterCount = countOccurrences(source, after)
  if (beforeCount === 0 && afterCount === 1) return String(source || '')
  if (beforeCount !== 1 || afterCount !== 0) {
    throw new Error(`S-Hub production recovery patch drift: expected exactly one legacy or canonical study class label, found legacy=${beforeCount}, canonical=${afterCount}: production study class label`)
  }
  return String(source || '').replace(before, after)
}

function patchStudyRankingGesture(source) {
  let next = String(source || '')
  const stateBefore = `  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot
  const scopeSpring = useStudyRankingScopeSpring(scope === 'school' ? 1 : 0)
  const touchIntentRef = useRef({ key: '', at: 0 })
  const [stageDirection, setStageDirection] = useState('forward')

  function selectScope(nextScope, pointerType = '') {
    if (nextScope === scope) return
    setStageDirection(nextScope === 'school' ? 'forward' : 'back')
    if (pointerType && pointerType !== 'mouse') {
      touchIntentRef.current = { key: nextScope, at: performance.now() }
    }
    onScope(nextScope)
  }

  function clickScope(nextScope) {
    const intent = touchIntentRef.current
    if (intent.key === nextScope && performance.now() - intent.at < 700) {
      touchIntentRef.current = { key: '', at: 0 }
      return
    }
    selectScope(nextScope)
  }`
  const stateAfter = `  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot
  const scopeSpring = useStudyRankingScopeSpring(scope === 'school' ? 1 : 0)
  const [stageDirection, setStageDirection] = useState('forward')

  function selectScope(nextScope) {
    if (nextScope === scope) return
    setStageDirection(nextScope === 'school' ? 'forward' : 'back')
    onScope(nextScope)
  }`
  next = replaceExact(next, stateBefore, stateAfter, 'study ranking tap-completion state')

  const classButtonBefore = `          aria-pressed={scope === 'class'}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            selectScope('class', event.pointerType)
          }}
          onClick={() => clickScope('class')}`
  const classButtonAfter = `          aria-pressed={scope === 'class'}
          onClick={() => selectScope('class')}`
  next = replaceExact(next, classButtonBefore, classButtonAfter, 'study class scope tap completion')

  const schoolButtonBefore = `          aria-pressed={scope === 'school'}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            selectScope('school', event.pointerType)
          }}
          onClick={() => clickScope('school')}`
  const schoolButtonAfter = `          aria-pressed={scope === 'school'}
          onClick={() => selectScope('school')}`
  return replaceExact(next, schoolButtonBefore, schoolButtonAfter, 'study school scope tap completion')
}

function patchStudyRankingTouchAction(source) {
  const before = 'touch-action: manipulation;'
  const after = 'touch-action: pan-y;'
  const beforeCount = countOccurrences(source, before)
  const afterCount = countOccurrences(source, after)
  if (beforeCount === 0 && afterCount === 2) return String(source || '')
  if (beforeCount !== 2 || afterCount !== 0) {
    throw new Error(`S-Hub production recovery patch drift: expected exactly two legacy or canonical study ranking touch actions, found legacy=${beforeCount}, canonical=${afterCount}: study ranking vertical pan`)
  }
  return String(source || '').split(before).join(after)
}

function patchStudentIdentitySync(source) {
  let next = String(source || '')

  next = replaceExact(
    next,
    `let authPromise = null
const identitySyncPromises = new Map()`,
    `let authPromise = null
const identitySyncPromises = new Map()
const STUDENT_IDENTITY_SYNC_KEY = 'school.studentIdentitySync.v1'

function identitySyncMarkerMatches(cacheKey) {
  try {
    return localStorage.getItem(STUDENT_IDENTITY_SYNC_KEY) === cacheKey
  } catch {
    return false
  }
}

function rememberIdentitySync(cacheKey) {
  try {
    localStorage.setItem(STUDENT_IDENTITY_SYNC_KEY, cacheKey)
  } catch {
    // The in-memory promise still prevents duplicate checks for this session.
  }
}

function transientIdentityReadError(error) {
  const rawCode = String(error?.code || '')
  const code = rawCode.startsWith('firestore/') ? rawCode.slice('firestore/'.length) : rawCode
  return code === 'resource-exhausted' || code === 'unavailable' || code === 'deadline-exceeded'
}`,
    'student identity sync helpers',
  )

  next = replaceExact(
    next,
    `  const cacheKey = \`\${user.uid}|\${signature}\`
  if (!identitySyncPromises.has(cacheKey)) {`,
    `  const cacheKey = \`\${user.uid}|\${signature}\`
  if (identitySyncMarkerMatches(cacheKey)) return user

  if (!identitySyncPromises.has(cacheKey)) {`,
    'student identity persistent marker check',
  )

  next = replaceExact(
    next,
    `      const identity = doc(db, 'users', user.uid)
      const snapshot = await getDoc(identity)`,
    `      const identity = doc(db, 'users', user.uid)
      let snapshot
      try {
        snapshot = await getDoc(identity)
      } catch (error) {
        if (transientIdentityReadError(error)) {
          console.warn('Student identity verification temporarily unavailable; continuing with existing auth session.', error)
          return user
        }
        throw error
      }`,
    'student identity transient lookup fallback',
  )

  next = replaceExact(
    next,
    `        await setDoc(identity, {
          classId,
          studentKey,
          name: profile.name,
          createdAt: now,
          updatedAt: now,
        })
        return user`,
    `        await setDoc(identity, {
          classId,
          studentKey,
          name: profile.name,
          createdAt: now,
          updatedAt: now,
        })
        rememberIdentitySync(cacheKey)
        return user`,
    'student identity create marker',
  )

  next = replaceExact(
    next,
    `        throw new Error('저장된 학생 정보와 로그인 정보가 달라. 앱 데이터를 초기화한 뒤 다시 등록해줘.')
      }
      return user`,
    `        throw new Error('저장된 학생 정보와 로그인 정보가 달라. 앱 데이터를 초기화한 뒤 다시 등록해줘.')
      }
      rememberIdentitySync(cacheKey)
      return user`,
    'student identity verified marker',
  )

  return next
}

export function patchProductionRecoverySource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/todo-stage5-ai.jsx')) return patchTodoSectionSubmit(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyRankingGesture(patchStudyClassLabel(source))
  if (cleanId.endsWith('/src/preview-study-ranking.css')) return patchStudyRankingTouchAction(source)
  if (cleanId.endsWith('/src/school-sync.js')) return patchStudentIdentitySync(source)
  return String(source || '')
}
