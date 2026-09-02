function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
}

function replaceExact(source, marker, replacement, label) {
  const count = countOccurrences(source, marker)
  if (count !== 1) {
    throw new Error(`Study visual polish patch drift: expected 1 occurrence, found ${count}: ${label}`)
  }
  return String(source || '').replace(marker, replacement)
}

function replaceOnceOrKeep(source, marker, replacement, label) {
  const current = String(source || '')
  if (current.includes(replacement)) return current
  return replaceExact(current, marker, replacement, label)
}

function appendOnce(source, marker, addition) {
  const current = String(source || '')
  if (current.includes(marker)) return current
  return `${current}\n${addition}\n`
}

function patchStudyNavIcon(source) {
  const before = `  if (type === 'study') {
    return <svg {...common}><path d="M4.2 5.1h5.5a3.2 3.2 0 0 1 2.3.95v13a3.2 3.2 0 0 0-2.3-.95H4.2z"/><path d="M19.8 5.1h-5.5a3.2 3.2 0 0 0-2.3.95v13a3.2 3.2 0 0 1 2.3-.95h5.5z"/></svg>
  }`

  const after = `  if (type === 'study') {
    return <svg {...common}><path d="M2.8 5.2c3.6-.9 6.7.1 9.2 2.8v11.2c-2.5-2.7-5.6-3.7-9.2-2.8V5.2Z"/><path d="M21.2 5.2c-3.6-.9-6.7.1-9.2 2.8v11.2c2.5-2.7 5.6-3.7 9.2-2.8V5.2Z"/><path d="M12 8v11.2"/></svg>
  }`

  return replaceOnceOrKeep(source, before, after, 'study open-book navigation icon')
}

function patchStudyHeader(source) {
  return replaceOnceOrKeep(
    source,
    '<p className="eyebrow">S-Hub V2</p>',
    '<p className="eyebrow">공부 기록</p>',
    'study eyebrow copy',
  )
}

function patchStudyRankingClient(source) {
  let next = String(source || '')

  next = replaceOnceOrKeep(
    next,
    `async function requestStudy({ method = 'GET', payload = null, signal, scope = 'class' } = {}) {
  const normalizedScope = scope === 'school' ? 'school' : 'class'
  const url = method === 'GET'
    ? \`\${STUDY_API_URL}?scope=\${encodeURIComponent(normalizedScope)}\`
    : STUDY_API_URL`,
    `async function requestStudy({ method = 'GET', payload = null, signal, scope = 'class', period = 'today' } = {}) {
  const normalizedScope = scope === 'school' ? 'school' : 'class'
  const normalizedPeriod = period === 'all' ? 'all' : 'today'
  const url = method === 'GET'
    ? STUDY_API_URL + '?scope=' + encodeURIComponent(normalizedScope) + '&period=' + encodeURIComponent(normalizedPeriod)
    : STUDY_API_URL`,
    'study ranking period request',
  )

  next = replaceOnceOrKeep(
    next,
    `    scope: source.scope === 'school' ? 'school' : 'class',
    date: String(source.date || ''),`,
    `    scope: source.scope === 'school' ? 'school' : 'class',
    period: source.period === 'all' ? 'all' : 'today',
    date: String(source.date || ''),`,
    'study ranking period snapshot normalization',
  )

  next = replaceOnceOrKeep(
    next,
    `export async function loadPreviewStudy({ signal, scope = 'class' } = {}) {
  return normalizePreviewStudySnapshot(await requestStudy({ signal, scope }))
}`,
    `export async function loadPreviewStudy({ signal, scope = 'class', period = 'today' } = {}) {
  return normalizePreviewStudySnapshot(await requestStudy({ signal, scope, period }))
}`,
    'study ranking period loader',
  )

  return next
}

function patchStudyRankingPage(source) {
  let next = String(source || '')

  next = replaceOnceOrKeep(
    next,
    `function studentTodaySeconds(student, nowMs) {
  const recorded = Math.max(0, Number(student?.totalSeconds || 0))
  const active = student?.active
  if (!active || active.isPaused) return recorded
  return recorded + runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
}

function studentIdentity(student) {
  if (!student) return ''
  return \`\${String(student.classId || '')}:\${String(student.studentKey || '')}\`
}

function classLabel(classId) {
  const match = /^preview-class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}

function studentSubjectTotals(student, nowMs) {
  const totals = new Map()
  for (const row of Array.isArray(student?.subjectTotals) ? student.subjectTotals : []) {
    const subject = String(row?.subject || '').trim()
    const seconds = Math.max(0, Math.floor(Number(row?.totalSeconds || 0)))
    if (!subject || !seconds) continue
    totals.set(subject, (totals.get(subject) || 0) + seconds)
  }

  const active = student?.active
  if (active && !active.isPaused) {
    const liveSeconds = runningTodaySeconds(active.segmentStartedAt || active.startedAt, nowMs)
    if (liveSeconds > 0) totals.set(active.subject, (totals.get(active.subject) || 0) + liveSeconds)
  }

  return [...totals.entries()]
    .map(([subject, totalSeconds]) => ({ subject, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.subject.localeCompare(b.subject, 'ko'))
}

function rankedStudents(students, nowMs) {
  return [...(Array.isArray(students) ? students : [])]
    .map((student) => ({ ...student, displaySeconds: studentTodaySeconds(student, nowMs) }))
    .filter((student) => student.displaySeconds > 0 || student.active)
    .sort((a, b) => b.displaySeconds - a.displaySeconds || a.name.localeCompare(b.name, 'ko'))
}`,
    `function runningSegmentSeconds(startedAt, nowMs = Date.now()) {
  const start = Number(startedAt || 0)
  const now = Number(nowMs || 0)
  if (!Number.isFinite(start) || !Number.isFinite(now) || start <= 0 || now <= start) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}

function studentPeriodLiveSeconds(active, nowMs, period = 'today') {
  if (!active || active.isPaused) return 0
  const startedAt = active.segmentStartedAt || active.startedAt
  return period === 'all'
    ? runningSegmentSeconds(startedAt, nowMs)
    : runningTodaySeconds(startedAt, nowMs)
}

function studentPeriodSeconds(student, nowMs, period = 'today') {
  const recorded = Math.max(0, Number(student?.totalSeconds || 0))
  return recorded + studentPeriodLiveSeconds(student?.active, nowMs, period)
}

function studentTodaySeconds(student, nowMs) {
  return studentPeriodSeconds(student, nowMs, 'today')
}

function studentIdentity(student) {
  if (!student) return ''
  return \`\${String(student.classId || '')}:\${String(student.studentKey || '')}\`
}

function classLabel(classId) {
  const match = /^preview-class-(\\d+)$/.exec(String(classId || ''))
  return match ? \`\${Number(match[1])}반\` : '반 정보 없음'
}

function studentSubjectTotals(student, nowMs, period = 'today') {
  const totals = new Map()
  for (const row of Array.isArray(student?.subjectTotals) ? student.subjectTotals : []) {
    const subject = String(row?.subject || '').trim()
    const seconds = Math.max(0, Math.floor(Number(row?.totalSeconds || 0)))
    if (!subject || !seconds) continue
    totals.set(subject, (totals.get(subject) || 0) + seconds)
  }

  const active = student?.active
  const liveSeconds = studentPeriodLiveSeconds(active, nowMs, period)
  if (active && liveSeconds > 0) {
    totals.set(active.subject, (totals.get(active.subject) || 0) + liveSeconds)
  }

  return [...totals.entries()]
    .map(([subject, totalSeconds]) => ({ subject, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.subject.localeCompare(b.subject, 'ko'))
}

function rankedStudents(students, nowMs, period = 'today') {
  return [...(Array.isArray(students) ? students : [])]
    .map((student) => ({ ...student, displaySeconds: studentPeriodSeconds(student, nowMs, period) }))
    .filter((student) => student.displaySeconds > 0 || student.active)
    .sort((a, b) => b.displaySeconds - a.displaySeconds || a.name.localeCompare(b.name, 'ko'))
}`,
    'period-aware study ranking calculations',
  )

  next = replaceOnceOrKeep(
    next,
    `  schoolError,
  scope,
  onScope,
  onRetrySchool,`,
    `  schoolError,
  allSnapshot,
  allSnapshotScope,
  allLoading,
  allError,
  scope,
  onScope,
  period,
  onPeriod,
  onRetrySchool,
  onRetryAll,`,
    'study ranking period props',
  )

  next = replaceOnceOrKeep(
    next,
    `  const source = scope === 'school' ? schoolSnapshot : classSnapshot
  const ranked = rankedStudents(source?.students, nowMs)
  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot`,
    `  const allMatchesScope = period === 'all' && allSnapshotScope === scope
  const source = period === 'all'
    ? (allMatchesScope ? allSnapshot : null)
    : (scope === 'school' ? schoolSnapshot : classSnapshot)
  const ranked = rankedStudents(source?.students, nowMs, period)
  const rankingError = period === 'all' ? allError : (scope === 'school' ? schoolError : '')
  const waitingForRanking = period === 'all'
    ? (allLoading || (!allMatchesScope && !rankingError))
    : (scope === 'school' && schoolLoading && !schoolSnapshot)
  const rankingLabel = (scope === 'school' ? '전교' : '우리반') + ' ' + (period === 'all' ? '전체' : '오늘')`,
    'study ranking period source',
  )

  next = replaceOnceOrKeep(
    next,
    `        <h2>오늘 공부 랭킹</h2>
        <span>{waitingForSchool ? '불러오는 중' : \`\${ranked.length}명 기록\`}</span>`,
    `        <h2>{period === 'all' ? '전체 공부 랭킹' : '오늘 공부 랭킹'}</h2>
        <span>{waitingForRanking ? '불러오는 중' : \`\${ranked.length}명 기록\`}</span>`,
    'study ranking period heading',
  )

  next = replaceOnceOrKeep(
    next,
    `      <div className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 범위">`,
    `      <div className="preview-study-ranking-filters">
        <div className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 기간">
          <button
            type="button"
            className={period === 'today' ? 'is-selected' : ''}
            aria-pressed={period === 'today'}
            onClick={() => onPeriod('today')}
          >
            오늘
          </button>
          <button
            type="button"
            className={period === 'all' ? 'is-selected' : ''}
            aria-pressed={period === 'all'}
            onClick={() => onPeriod('all')}
          >
            전체
          </button>
        </div>

        <div className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 범위">`,
    'study ranking period tabs',
  )

  next = replaceOnceOrKeep(
    next,
    `      </div>

      <div className="preview-study-ranking-stage" key={scope}>`,
    `        </div>
      </div>

      <div className="preview-study-ranking-stage" key={[scope, period].join(':')}>`,
    'study ranking filter wrapper',
  )

  next = replaceOnceOrKeep(
    next,
    `{waitingForSchool ? (`,
    `{waitingForRanking ? (`,
    'study ranking period loading condition',
  )

  next = replaceOnceOrKeep(
    next,
    `<div className="preview-study-empty preview-study-ranking-loading">전교 랭킹을 불러오는 중…</div>`,
    `<div className="preview-study-empty preview-study-ranking-loading">{rankingLabel} 랭킹을 불러오는 중…</div>`,
    'study ranking period loading copy',
  )

  next = replaceOnceOrKeep(
    next,
    `) : schoolError && scope === 'school' && !schoolSnapshot ? (
          <div className="preview-study-load-error preview-study-ranking-error">
            <p>{schoolError}</p>
            <button type="button" onClick={onRetrySchool}>다시 불러오기</button>`,
    `) : rankingError && !source ? (
          <div className="preview-study-load-error preview-study-ranking-error">
            <p>{rankingError}</p>
            <button type="button" onClick={period === 'all' ? onRetryAll : onRetrySchool}>다시 불러오기</button>`,
    'study ranking period error state',
  )

  next = replaceOnceOrKeep(
    next,
    `                : '오늘 기록'`,
    `                : (period === 'all' ? '전체 기록' : '오늘 기록')`,
    'study ranking period row copy',
  )

  next = replaceOnceOrKeep(
    next,
    `<div className="preview-study-empty">오늘 기록된 공부 시간이 없습니다.</div>`,
    `<div className="preview-study-empty">{period === 'all' ? '전체 누적 공부 기록이 없습니다.' : '오늘 기록된 공부 시간이 없습니다.'}</div>`,
    'study ranking period empty state',
  )

  next = replaceOnceOrKeep(
    next,
    `{scope === 'school' && schoolError && schoolSnapshot ? (
        <p className="preview-study-inline-warning">전교 랭킹 실시간 갱신이 일시적으로 중단되었습니다. 마지막 기록을 표시합니다.</p>`,
    `{rankingError && source ? (
        <p className="preview-study-inline-warning">랭킹 실시간 갱신이 일시적으로 중단되었습니다. 마지막 기록을 표시합니다.</p>`,
    'study ranking period stale state',
  )

  next = replaceOnceOrKeep(
    next,
    `function StudyStudentSheet({ student, meId, nowMs, onClose }) {
  const id = studentIdentity(student)
  const totalSeconds = studentTodaySeconds(student, nowMs)
  const subjects = studentSubjectTotals(student, nowMs)`,
    `function StudyStudentSheet({ student, meId, nowMs, period = 'today', onClose }) {
  const id = studentIdentity(student)
  const totalSeconds = studentPeriodSeconds(student, nowMs, period)
  const subjects = studentSubjectTotals(student, nowMs, period)`,
    'study student sheet period totals',
  )

  next = replaceOnceOrKeep(
    next,
    `<span>오늘 총 공부</span>`,
    `<span>{period === 'all' ? '전체 누적 공부' : '오늘 총 공부'}</span>`,
    'study student sheet period heading',
  )

  next = replaceOnceOrKeep(
    next,
    `  const [rankingScope, setRankingScope] = useState('class')
  const [selectedStudentId, setSelectedStudentId] = useState('')`,
    `  const [rankingScope, setRankingScope] = useState('class')
  const [rankingPeriod, setRankingPeriod] = useState('today')
  const [allSnapshot, setAllSnapshot] = useState(null)
  const [allSnapshotScope, setAllSnapshotScope] = useState('')
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedStudentPeriod, setSelectedStudentPeriod] = useState('today')`,
    'study ranking period state',
  )

  next = replaceOnceOrKeep(
    next,
    `  const schoolRequestIdRef = useRef(0)
  const realtimeRefreshRef = useRef(0)`,
    `  const schoolRequestIdRef = useRef(0)
  const allRequestIdRef = useRef(0)
  const realtimeRefreshRef = useRef(0)`,
    'study ranking all request ref',
  )

  next = replaceOnceOrKeep(
    next,
    `  const schoolSnapshotRef = useRef(null)
  const rankingScopeRef = useRef('class')`,
    `  const schoolSnapshotRef = useRef(null)
  const rankingScopeRef = useRef('class')
  const rankingPeriodRef = useRef('today')`,
    'study ranking period ref',
  )

  next = replaceOnceOrKeep(
    next,
    `  useEffect(() => {
    rankingScopeRef.current = rankingScope
  }, [rankingScope])`,
    `  useEffect(() => {
    rankingScopeRef.current = rankingScope
  }, [rankingScope])

  useEffect(() => {
    rankingPeriodRef.current = rankingPeriod
  }, [rankingPeriod])`,
    'study ranking period ref sync',
  )

  next = replaceOnceOrKeep(
    next,
    `  useEffect(() => {
    load()
  }, [load])`,
    `  const loadAll = useCallback(async (scope = rankingScopeRef.current, { silent = false } = {}) => {
    const targetScope = scope === 'school' ? 'school' : 'class'
    const requestId = ++allRequestIdRef.current
    if (!silent) setAllLoading(true)
    try {
      const loaded = await loadPreviewStudy({ scope: targetScope, period: 'all' })
      if (requestId !== allRequestIdRef.current) return
      setAllSnapshot(loaded)
      setAllSnapshotScope(targetScope)
      setAllError('')
    } catch (error) {
      if (requestId !== allRequestIdRef.current) return
      setAllError(error?.message || '전체 누적 랭킹을 불러오지 못했습니다.')
    } finally {
      if (requestId === allRequestIdRef.current && !silent) setAllLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])`,
    'study ranking all loader',
  )

  next = replaceOnceOrKeep(
    next,
    `  useEffect(() => {
    if (rankingScope !== 'school' || schoolSnapshot || schoolLoading) return
    loadSchool()
  }, [rankingScope, schoolSnapshot, schoolLoading, loadSchool])`,
    `  useEffect(() => {
    if (rankingPeriod !== 'today' || rankingScope !== 'school' || schoolSnapshot || schoolLoading) return
    loadSchool()
  }, [rankingPeriod, rankingScope, schoolSnapshot, schoolLoading, loadSchool])

  useEffect(() => {
    if (rankingPeriod !== 'all' || allLoading) return
    if (allSnapshot && allSnapshotScope === rankingScope) return
    loadAll(rankingScope)
  }, [rankingPeriod, rankingScope, allSnapshot, allSnapshotScope, allLoading, loadAll])`,
    'study ranking lazy period loads',
  )

  next = replaceOnceOrKeep(
    next,
    `      () => {
        if (stopped) return
        if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
        realtimeRefreshRef.current = window.setTimeout(() => {
          realtimeRefreshRef.current = 0
          load({ silent: true })
        }, 160)
      },
      () => {
        if (stopped || (!schoolSnapshotRef.current && rankingScopeRef.current !== 'school')) return
        if (schoolRealtimeRefreshRef.current) window.clearTimeout(schoolRealtimeRefreshRef.current)
        schoolRealtimeRefreshRef.current = window.setTimeout(() => {
          schoolRealtimeRefreshRef.current = 0
          loadSchool({ silent: true })
        }, 220)
      },`,
    `      () => {
        if (stopped) return
        if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current)
        realtimeRefreshRef.current = window.setTimeout(() => {
          realtimeRefreshRef.current = 0
          load({ silent: true })
          if (rankingPeriodRef.current === 'all' && rankingScopeRef.current === 'class') {
            loadAll('class', { silent: true })
          }
        }, 160)
      },
      () => {
        if (stopped) return
        const refreshTodaySchool = Boolean(schoolSnapshotRef.current)
          || (rankingPeriodRef.current === 'today' && rankingScopeRef.current === 'school')
        const refreshAllSchool = rankingPeriodRef.current === 'all' && rankingScopeRef.current === 'school'
        if (!refreshTodaySchool && !refreshAllSchool) return
        if (schoolRealtimeRefreshRef.current) window.clearTimeout(schoolRealtimeRefreshRef.current)
        schoolRealtimeRefreshRef.current = window.setTimeout(() => {
          schoolRealtimeRefreshRef.current = 0
          if (refreshTodaySchool) loadSchool({ silent: true })
          if (refreshAllSchool) loadAll('school', { silent: true })
        }, 220)
      },`,
    'study ranking period realtime refresh',
  )

  next = replaceOnceOrKeep(
    next,
    `  }, [load, loadSchool])

  useEffect(() => {
    const refresh = () => {`,
    `  }, [load, loadSchool, loadAll])

  useEffect(() => {
    const refresh = () => {`,
    'study ranking realtime dependencies',
  )

  next = replaceOnceOrKeep(
    next,
    `      if (schoolSnapshotRef.current || rankingScopeRef.current === 'school') loadSchool({ silent: true })`,
    `      if (schoolSnapshotRef.current || (rankingPeriodRef.current === 'today' && rankingScopeRef.current === 'school')) {
        loadSchool({ silent: true })
      }
      if (rankingPeriodRef.current === 'all') loadAll(rankingScopeRef.current, { silent: true })`,
    'study ranking focus period refresh',
  )

  next = replaceOnceOrKeep(
    next,
    `  }, [load, loadSchool])

  const me = snapshot?.me || null`,
    `  }, [load, loadSchool, loadAll])

  const me = snapshot?.me || null`,
    'study ranking focus dependencies',
  )

  next = replaceOnceOrKeep(
    next,
    `  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null
    const schoolMatch = schoolSnapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId)
    if (schoolMatch) return schoolMatch
    return snapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId) || null
  }, [selectedStudentId, schoolSnapshot, snapshot])`,
    `  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null
    if (selectedStudentPeriod === 'all') {
      return allSnapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId) || null
    }
    const schoolMatch = schoolSnapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId)
    if (schoolMatch) return schoolMatch
    return snapshot?.students?.find((student) => studentIdentity(student) === selectedStudentId) || null
  }, [selectedStudentId, selectedStudentPeriod, allSnapshot, schoolSnapshot, snapshot])`,
    'study ranking selected student period',
  )

  next = replaceOnceOrKeep(
    next,
    `      if (schoolSnapshotRef.current || rankingScopeRef.current === 'school') await loadSchool({ silent: true })`,
    `      if (schoolSnapshotRef.current || (rankingPeriodRef.current === 'today' && rankingScopeRef.current === 'school')) {
        await loadSchool({ silent: true })
      }
      if (rankingPeriodRef.current === 'all') {
        await loadAll(rankingScopeRef.current, { silent: true })
      }`,
    'study ranking action period refresh',
  )

  next = replaceOnceOrKeep(
    next,
    `            onStudent={(student) => setSelectedStudentId(studentIdentity(student))}
          />
          <StudyRanking`,
    `            onStudent={(student) => {
              setSelectedStudentPeriod('today')
              setSelectedStudentId(studentIdentity(student))
            }}
          />
          <StudyRanking`,
    'study active student period selection',
  )

  next = replaceOnceOrKeep(
    next,
    `            schoolError={schoolError}
            scope={rankingScope}
            onScope={setRankingScope}
            onRetrySchool={() => loadSchool()}`, 
    `            schoolError={schoolError}
            allSnapshot={allSnapshot}
            allSnapshotScope={allSnapshotScope}
            allLoading={allLoading}
            allError={allError}
            scope={rankingScope}
            onScope={setRankingScope}
            period={rankingPeriod}
            onPeriod={setRankingPeriod}
            onRetrySchool={() => loadSchool()}
            onRetryAll={() => loadAll(rankingScope)}`,
    'study ranking period render props',
  )

  next = replaceOnceOrKeep(
    next,
    `            onStudent={(student) => setSelectedStudentId(studentIdentity(student))}
          />
        </div>`,
    `            onStudent={(student) => {
              setSelectedStudentPeriod(rankingPeriod)
              setSelectedStudentId(studentIdentity(student))
            }}
          />
        </div>`,
    'study ranking student period selection',
  )

  next = replaceOnceOrKeep(
    next,
    `          nowMs={nowMs}
          onClose={closeStudentSheet}`, 
    `          nowMs={nowMs}
          period={selectedStudentPeriod}
          onClose={closeStudentSheet}`,
    'study student sheet selected period',
  )

  return next
}

function patchStudyRankingCss(source) {
  return appendOnce(
    source,
    'S-Hub study ranking period filters',
    `/* S-Hub study ranking period filters: independent time and population ranges. */
.preview-study-ranking-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.preview-study-ranking-filters .preview-study-ranking-tabs {
  min-width: 0;
}

@media (max-width: 340px) {
  .preview-study-ranking-filters {
    grid-template-columns: 1fr;
  }
}`,
  )
}

function patchBoardCopyWrapping(source) {
  return appendOnce(
    source,
    'S-Hub readable board header copy',
    `/* S-Hub readable board header copy: keep Korean words intact when wrapping. */
.preview-board-header-note {
  word-break: keep-all;
  overflow-wrap: break-word;
}`,
  )
}

function patchAICopyWrapping(source) {
  return appendOnce(
    source,
    'S-Hub readable AI hero copy',
    `/* S-Hub readable AI hero copy: wrap at word boundaries instead of splitting syllables. */
.s-hub-ai-page-title p:last-child {
  word-break: keep-all;
  overflow-wrap: break-word;
}`,
  )
}

function patchBoardModalCloseMotion(source) {
  let next = String(source || '')

  next = replaceOnceOrKeep(
    next,
    'function BoardPostEditor({ post, sections, open, onClose, onUpdated, onDeleted }) {',
    `function BoardPostEditor({ post: incomingPost, sections, open, onClose, onUpdated, onDeleted }) {
  const retainedPostRef = useRef(incomingPost)
  if (incomingPost) retainedPostRef.current = incomingPost
  const post = incomingPost || retainedPostRef.current`,
    'board post editor retained close state',
  )

  next = replaceOnceOrKeep(
    next,
    'function BoardSectionEditor({ section, sections, open, onClose, onUpdated, onDeleted }) {',
    `function BoardSectionEditor({ section: incomingSection, sections, open, onClose, onUpdated, onDeleted }) {
  const retainedSectionRef = useRef(incomingSection)
  if (incomingSection) retainedSectionRef.current = incomingSection
  const section = incomingSection || retainedSectionRef.current`,
    'board section editor retained close state',
  )

  next = replaceOnceOrKeep(
    next,
    'function BoardDetail({ post, sections, meKey, open, onClose, onUpdated, onEditPost, onMutated }) {',
    `function BoardDetail({ post: incomingPost, sections, meKey, open, onClose, onUpdated, onEditPost, onMutated }) {
  const retainedPostRef = useRef(incomingPost)
  if (incomingPost) retainedPostRef.current = incomingPost
  const post = incomingPost || retainedPostRef.current`,
    'board detail retained close state',
  )

  return next
}

export function patchStudyVisualPolishSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/main.jsx')) return patchStudyNavIcon(source)
  if (cleanId.endsWith('/src/preview-study-client.js')) return patchStudyRankingClient(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyRankingPage(patchStudyHeader(source))
  if (cleanId.endsWith('/src/preview-study-ranking.css')) return patchStudyRankingCss(source)
  if (cleanId.endsWith('/src/preview-board-complete.jsx')) return patchBoardModalCloseMotion(source)
  if (cleanId.endsWith('/src/preview-board.css')) return patchBoardCopyWrapping(source)
  if (cleanId.endsWith('/src/s-hub-ai.css')) return patchAICopyWrapping(source)
  return String(source || '')
}
