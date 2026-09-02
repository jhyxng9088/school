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

function patchStudyClassLabel(source) {
  const before = `function classLabel(classId) {
  const match = /^preview-class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  const after = `function classLabel(classId) {
  const match = /^(?:preview-)?class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}`
  return replaceExact(source, before, after, 'production study class label')
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

function patchStudyPageTouchAction(source) {
  const before = `.preview-study-page {
  padding-top: 2px;
}`
  const after = `.preview-study-page {
  padding-top: 2px;
  touch-action: pan-y;
}`
  return replaceExact(source, before, after, 'study page vertical pan')
}

function patchStudyRankingTouchAction(source) {
  const marker = 'touch-action: manipulation;'
  const count = countOccurrences(source, marker)
  if (count !== 2) {
    throw new Error(`S-Hub production recovery patch drift: expected 2 occurrences, found ${count}: study ranking vertical pan`)
  }
  return String(source || '').split(marker).join('touch-action: pan-y;')
}

function patchSocialPushEndpoint(source) {
  const before = "const SOCIAL_PUSH_URL = 'https://school-reminder-backend-git-preview-s-hub-v2-jhyxng9088-7711.vercel.app/api/activity-dispatch'"
  const after = "const SOCIAL_PUSH_URL = 'https://school-reminder-backend.vercel.app/api/activity-dispatch'"
  return replaceExact(source, before, after, 'production social push endpoint')
}

export function patchProductionRecoverySource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/main.jsx')) return patchMainPresence(source)
  if (cleanId.endsWith('/src/todo-stage5-ai.jsx')) return patchTodoSectionSubmit(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyRankingGesture(patchStudyClassLabel(source))
  if (cleanId.endsWith('/src/preview-study.css')) return patchStudyPageTouchAction(source)
  if (cleanId.endsWith('/src/preview-study-ranking.css')) return patchStudyRankingTouchAction(source)
  if (cleanId.endsWith('/src/preview-social-push.js')) return patchSocialPushEndpoint(source)
  return String(source || '')
}
