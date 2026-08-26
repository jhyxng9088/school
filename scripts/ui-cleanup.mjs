import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, value) { fs.writeFileSync(path, value) }
function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return value.slice(0, first) + to + value.slice(first + from.length)
}

{
  const path = 'src/reminder-summary.jsx'
  let value = read(path)
  value = replaceOnce(value,
`  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])`,
`  useEffect(() => {
    setSaving(false)
    setClosing(false)
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [original?.url])`,
  'viewer state reset')

  value = replaceOnce(value,
`  function closeViewer() {
    setViewer(null)
  }`,
`  function closeViewer() {
    const url = objectUrlRef.current
    setViewer(null)
    setOriginalState('idle')
    if (url) URL.revokeObjectURL(url)
    if (objectUrlRef.current === url) objectUrlRef.current = ''
  }`,
  'viewer close cleanup')

  value = replaceOnce(value,
`      <OriginalImageViewer original={viewer} onClose={closeViewer} />`,
`      {viewer ? <OriginalImageViewer key={viewer.url} original={viewer} onClose={closeViewer} /> : null}`,
  'viewer conditional mount')

  value = replaceOnce(value,
`      {file ? (
        <div className={\`reminder-attachment-status \${error ? 'is-error' : ready ? 'is-ready' : busy ? 'is-working' : ''}\`} aria-live="polite">
          <span>
            {error
              ? error
              : ready
                ? '첨부 내용을 읽고 요약까지 정리했어.'
                : busy
                  ? '첨부 내용을 읽고 정리하는 중'
                  : '첨부를 분석할 준비가 됐어.'}
          </span>
          {error ? (
            <button className="reminder-attachment-retry" type="button" onClick={onRetry}>다시 분석</button>
          ) : null}
        </div>
      ) : (
        <p className="reminder-attachment-help">사진은 자동으로 용량을 줄여 분석하고, PDF·텍스트 파일은 2.5MB 이하를 지원해.</p>
      )}`,
`      {file && (error || ready || busy) ? (
        <div className={\`reminder-attachment-status \${error ? 'is-error' : ready ? 'is-ready' : 'is-working'}\`} aria-live="polite">
          <span>{error ? error : ready ? '분석 완료' : '분석 중'}</span>
          {error ? (
            <button className="reminder-attachment-retry" type="button" onClick={onRetry}>다시 분석</button>
          ) : null}
        </div>
      ) : null}`,
  'attachment copy cleanup')
  write(path, value)
}

{
  const path = 'src/reminder-summary.css'
  let value = read(path)
  value = replaceOnce(value,
`.reminder-attachment-status,
.reminder-attachment-help {
  margin: 0 2px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}`,
`.reminder-attachment-status {
  margin: 0 2px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}`,
  'remove dead attachment help selector')
  write(path, value)
}

{
  const path = 'src/main.jsx'
  let value = read(path)
  const replacements = [
    ["'Safari의 더 보기(…)에서 ‘공유’를 눌러. 공유 버튼이 바로 보이면 그걸 눌러도 돼.'", "'더 보기(…)에서 ‘공유’를 눌러.'", 'safari step'],
    ["'목록에서 ‘홈 화면에 추가’를 선택해.'", "'‘홈 화면에 추가’를 선택해.'", 'safari add step'],
    ["'‘웹 앱으로 열기’를 켠 뒤 ‘추가’를 눌러.'", "'‘웹 앱으로 열기’를 켜고 ‘추가’를 눌러.'", 'safari final step'],
    ["'주소창에 + 또는 설치 아이콘이 보이면 눌러.'", "'주소창의 + 또는 설치 아이콘을 눌러.'", 'samsung step'],
    ["'아이콘이 없다면 브라우저 메뉴에서 ‘홈 화면에 추가’를 선택해.'", "'없으면 메뉴에서 ‘홈 화면에 추가’를 선택해.'", 'samsung fallback'],
    [`        <p className="onboarding-copy">홈 화면에 추가해서 일반 앱처럼 쓰는 걸 기준으로 만들었어.</p>\n`, '', 'install redundant copy'],
    ['같은 반의 시간표와 리마인더는 함께 쓰고, 완료와 삭제 상태는 같은 반·번호·이름을 입력한 기기끼리만 이어져.', '같은 반끼리 시간표·리마인더·학사일정을 공유해. 완료와 삭제는 같은 학생의 기기끼리만 이어져.', 'student setup copy'],
    [`      {configured && hasOverride ? <p className="section-note">변경된 수업은 작은 점으로 표시돼.</p> : null}\n`, '', 'redundant timetable note'],
  ]
  for (const [from,to,label] of replacements) value = replaceOnce(value, from, to, label)
  write(path, value)
}

{
  const path = 'src/todo-stage5-ai.jsx'
  let value = read(path)
  value = replaceOnce(value, `        <span>가까운 마감부터 정렬돼.</span>\n`, '', 'reminder redundant sort copy')
  value = replaceOnce(value,
`                    <small className="reminder-ai-status is-working">{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중' : 'AI가 오타와 문맥을 확인하는 중'}</small>`,
`                    <small className="reminder-ai-status is-working">{attachmentFile ? '분석 중' : '확인 중'}</small>`,
  'AI working copy')
  value = replaceOnce(value,
`                    <small className="reminder-ai-status is-ready">{attachmentFile ? '첨부 내용 분석과 요약 완료' : aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>`,
`                    <small className="reminder-ai-status is-ready">{attachmentFile ? '분석 완료' : aiAdjusted ? '오타·축약을 보정했어.' : '확인 완료'}</small>`,
  'AI ready copy')
  write(path, value)
}

{
  const path = 'public/first-run-notice.js'
  let value = read(path)
  value = replaceOnce(value,
`        <p>수정사항이나 문의사항이 있으면 <a href="\${INSTAGRAM_URL}">@j.hyxng</a>에게 연락해줘.</p>`,
`        <p>수정이나 문의가 있으면 <a href="\${INSTAGRAM_URL}">@j.hyxng</a>으로 연락해줘.</p>`,
  'first-run contact copy')
  write(path, value)
}

const deadFiles = [
  'public/reminder-date-final.css',
  'public/school-appcheck-debug.js',
  'public/school-meal.css',
  'public/school-meal.js',
  'public/school-pwa-appcheck-bridge.js',
  'src/meal.js',
  'src/todo-stage5-v2.jsx',
  'src/todo-stage5.jsx',
]
for (const file of deadFiles) {
  if (!fs.existsSync(file)) throw new Error(`Dead-file guard missing: ${file}`)
  fs.unlinkSync(file)
}

// Guard against the image-viewer regression and tone drift in active UI files.
const summary = read('src/reminder-summary.jsx')
if (!summary.includes('viewer ? <OriginalImageViewer key={viewer.url}')) throw new Error('Viewer remount guard failed')
if (summary.includes('첨부를 분석할 준비가 됐어') || summary.includes('reminder-attachment-help')) throw new Error('Attachment copy cleanup failed')
const main = read('src/main.jsx')
if (main.includes('홈 화면에 추가해서 일반 앱처럼 쓰는 걸 기준으로 만들었어.')) throw new Error('Install copy cleanup failed')
const todo = read('src/todo-stage5-ai.jsx')
if (todo.includes('가까운 마감부터 정렬돼.')) throw new Error('Reminder sort copy cleanup failed')

console.log('UI cleanup and dead-code removal applied')
