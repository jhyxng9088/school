import fs from 'node:fs'

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`)
  return source.replace(before, after)
}

function replaceFromMarker(source, marker, after, label) {
  const first = source.indexOf(marker)
  const last = source.lastIndexOf(marker)
  if (first < 0 || first !== last) throw new Error(`${label}: expected one marker`)
  return source.slice(0, first) + after
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`${path}: no changes produced`)
  fs.writeFileSync(path, after)
}

update('src/school-sync.js', (source) => {
  source = replaceExact(
    source,
    `  setDoc,\n  where,\n} from 'firebase/firestore'`,
    `  setDoc,\n  where,\n  writeBatch,\n} from 'firebase/firestore'`,
    'firestore batch import',
  )

  source = replaceExact(
    source,
    `const ATTACHMENT_MAX_BYTES = 2_500_000`,
    `const ATTACHMENT_MAX_BYTES = 2_500_000\nconst ORIGINAL_ATTACHMENT_MAX_BYTES = 8_000_000\nconst ORIGINAL_ATTACHMENT_CHUNK_CHARS = 600_000`,
    'original attachment constants',
  )

  source = replaceExact(
    source,
    `function classPresenceRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'presence', studentKeyFor(profile))\n}\n\nfunction safeSharedTodo(todo) {`,
    `function classPresenceRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'presence', studentKeyFor(profile))\n}\n\nfunction safeOriginalTodoId(todoId) {\n  return String(todoId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)\n}\n\nfunction originalAttachmentRef(profile, todoId) {\n  return doc(db, 'classes', classKeyFor(profile), 'originalAttachments', safeOriginalTodoId(todoId))\n}\n\nfunction originalAttachmentChunkRef(profile, todoId, index) {\n  return doc(\n    db,\n    'classes',\n    classKeyFor(profile),\n    'originalAttachments',\n    safeOriginalTodoId(todoId),\n    'chunks',\n    String(index).padStart(3, '0'),\n  )\n}\n\nfunction inferredOriginalMimeType(file) {\n  const explicit = String(file?.type || '').trim().toLowerCase()\n  if (ATTACHMENT_MIME_TYPES.has(explicit)) return explicit\n  const name = String(file?.name || '').toLowerCase()\n  const extensionMap = [\n    ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],\n    ['.webp', 'image/webp'], ['.bmp', 'image/bmp'], ['.heic', 'image/heic'],\n    ['.heif', 'image/heif'], ['.pdf', 'application/pdf'], ['.json', 'application/json'],\n    ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.rtf', 'text/rtf'],\n    ['.html', 'text/html'], ['.htm', 'text/html'], ['.xml', 'text/xml'],\n  ]\n  return extensionMap.find(([extension]) => name.endsWith(extension))?.[1] || ''\n}\n\nfunction fileToBase64(file) {\n  return new Promise((resolve, reject) => {\n    const reader = new FileReader()\n    reader.onload = () => {\n      const value = String(reader.result || '')\n      const comma = value.indexOf(',')\n      if (comma < 0) reject(new Error('원본 파일을 변환할 수 없어.'))\n      else resolve(value.slice(comma + 1))\n    }\n    reader.onerror = () => reject(new Error('원본 파일을 읽을 수 없어.'))\n    reader.readAsDataURL(file)\n  })\n}\n\nexport async function writeReminderOriginal(profile, todoId, file) {\n  const safeId = safeOriginalTodoId(todoId)\n  if (!safeId || !(file instanceof Blob)) throw new Error('원본 파일을 저장할 수 없어.')\n  const size = Number(file.size || 0)\n  if (!Number.isInteger(size) || size <= 0) throw new Error('원본 파일이 비어 있어.')\n  if (size > ORIGINAL_ATTACHMENT_MAX_BYTES) {\n    throw new Error('원본 사진 저장은 8MB 이하 파일을 지원해.')\n  }\n  const mimeType = inferredOriginalMimeType(file)\n  if (!ATTACHMENT_MIME_TYPES.has(mimeType)) throw new Error('이 파일 형식은 원본 저장을 지원하지 않아.')\n\n  await ensureSignedIn()\n  const dataBase64 = await fileToBase64(file)\n  const chunks = []\n  for (let offset = 0; offset < dataBase64.length; offset += ORIGINAL_ATTACHMENT_CHUNK_CHARS) {\n    chunks.push(dataBase64.slice(offset, offset + ORIGINAL_ATTACHMENT_CHUNK_CHARS))\n  }\n  if (!chunks.length || chunks.length > 24) throw new Error('원본 파일을 저장 가능한 크기로 나눌 수 없어.')\n\n  const batch = writeBatch(db)\n  batch.set(originalAttachmentRef(profile, safeId), {\n    name: String(file.name || '원본 파일').slice(0, 120),\n    mimeType,\n    size,\n    chunkCount: chunks.length,\n    createdAt: Date.now(),\n  })\n  chunks.forEach((data, index) => {\n    batch.set(originalAttachmentChunkRef(profile, safeId, index), { data })\n  })\n  await batch.commit()\n}\n\nexport async function getReminderOriginal(profile, todoId) {\n  const safeId = safeOriginalTodoId(todoId)\n  if (!safeId) throw new Error('원본 파일을 찾을 수 없어.')\n  await ensureSignedIn()\n  const metadataSnapshot = await getDoc(originalAttachmentRef(profile, safeId))\n  if (!metadataSnapshot.exists()) {\n    const error = new Error('이 리마인더는 원본 저장 기능 적용 전에 만들어져서 원본이 없어. 사진을 다시 올려줘.')\n    error.code = 'school-sync/original-not-found'\n    throw error\n  }\n  const metadata = metadataSnapshot.data() || {}\n  const chunkCount = Number(metadata.chunkCount || 0)\n  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 24) throw new Error('원본 파일 정보가 올바르지 않아.')\n  const snapshots = await Promise.all(\n    Array.from({ length: chunkCount }, (_, index) => getDoc(originalAttachmentChunkRef(profile, safeId, index))),\n  )\n  if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('원본 파일 일부를 불러오지 못했어.')\n  return {\n    name: String(metadata.name || '원본 사진').slice(0, 120),\n    mimeType: String(metadata.mimeType || 'application/octet-stream'),\n    size: Number(metadata.size || 0),\n    dataBase64: snapshots.map((snapshot) => String(snapshot.data()?.data || '')).join(''),\n  }\n}\n\nfunction safeSharedTodo(todo) {`,
    'original attachment firestore helpers',
  )
  return source
})

update('src/todo.jsx', (source) => {
  source = replaceExact(
    source,
    `  listenClassTodos,\n  listenStudentTodoState,\n  migrateLegacyTodos,\n  profileSignature,\n  writeSharedTodo,\n  writeStudentTodoState,`,
    `  getReminderOriginal,\n  listenClassTodos,\n  listenStudentTodoState,\n  migrateLegacyTodos,\n  profileSignature,\n  writeReminderOriginal,\n  writeSharedTodo,\n  writeStudentTodoState,`,
    'todo sync imports',
  )

  source = replaceExact(
    source,
    `function mergeSharedTodos(sharedTodos, personalState) {\n  return sortTodos(sharedTodos\n    .filter((todo) => !personalState[todo.id]?.hidden)\n    .map((todo) => ({\n      ...todo,\n      completed: Boolean(personalState[todo.id]?.completed),\n    })))\n}\n\nexport function useTodos(profile) {`,
    `function mergeSharedTodos(sharedTodos, personalState) {\n  return sortTodos(sharedTodos\n    .filter((todo) => !personalState[todo.id]?.hidden)\n    .map((todo) => ({\n      ...todo,\n      completed: Boolean(personalState[todo.id]?.completed),\n    })))\n}\n\nfunction createTodoId() {\n  const now = Date.now()\n  return \`${'${now}'}-${'${Math.random().toString(36).slice(2, 8)}'}\`\n}\n\nexport function useTodos(profile) {`,
    'todo id helper',
  )

  source = replaceExact(
    source,
    `    const now = Date.now()\n    const todo = {\n      id: \`${'${now}'}-${'${Math.random().toString(36).slice(2, 8)}'}\`,`,
    `    const now = Date.now()\n    const todo = {\n      id: String(input.createId || '').trim().slice(0, 100) || createTodoId(),`,
    'todo reserved create id',
  )

  source = replaceExact(
    source,
    `  return { todos, saveTodo, toggleTodo, removeTodo }`,
    `  function uploadOriginalAttachment(todoId, file) {\n    return writeReminderOriginal(profile, todoId, file)\n  }\n\n  function getOriginalAttachment(todoId) {\n    return getReminderOriginal(profile, todoId)\n  }\n\n  return {\n    todos,\n    saveTodo,\n    toggleTodo,\n    removeTodo,\n    createTodoId,\n    uploadOriginalAttachment,\n    getOriginalAttachment,\n  }`,
    'todo original methods',
  )
  return source
})

update('src/todo-stage5-ai.jsx', (source) => {
  source = replaceExact(
    source,
    `  const meta = dueMetaLabel(todo, now)`,
    `  const meta = completed ? '' : dueMetaLabel(todo, now)`,
    'completed meta overlap',
  )

  source = replaceExact(
    source,
    `  const { todos, saveTodo, toggleTodo, removeTodo } = todoData`,
    `  const {\n    todos,\n    saveTodo,\n    toggleTodo,\n    removeTodo,\n    createTodoId,\n    uploadOriginalAttachment,\n    getOriginalAttachment,\n  } = todoData`,
    'todo page original methods',
  )

  source = replaceExact(
    source,
    `  const [attachmentRetryKey, setAttachmentRetryKey] = useState(0)\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    `  const [attachmentRetryKey, setAttachmentRetryKey] = useState(0)\n  const [originalSaving, setOriginalSaving] = useState(false)\n  const [originalSaveError, setOriginalSaveError] = useState('')\n  const [summaryTodo, setSummaryTodo] = useState(null)`,
    'original save state',
  )

  source = replaceExact(
    source,
    `    setAttachmentRetryKey(0)\n    setSummaryTodo(null)`,
    `    setAttachmentRetryKey(0)\n    setOriginalSaving(false)\n    setOriginalSaveError('')\n    setSummaryTodo(null)`,
    'open create original reset',
  )

  source = replaceExact(
    source,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    resetAI()\n  }`,
    `  function changeAttachment(file) {\n    setAttachmentFile(file)\n    setAttachmentRetryKey(0)\n    setOriginalSaveError('')\n    resetAI()\n  }`,
    'attachment change original reset',
  )

  source = replaceExact(
    source,
    `  function submitNatural() {\n    if (!naturalResult?.title || !naturalResult?.dueDate) return\n    const savedId = saveTodo({\n      id: '',\n      type: naturalResult.type,\n      title: naturalResult.title,\n      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,\n    })\n    if (savedId) {\n      resetAI()\n      setSheetOpen(false)\n    }\n  }`,
    `  async function submitNatural() {\n    if (!naturalResult?.title || !naturalResult?.dueDate || originalSaving) return\n    const createId = attachmentFile ? createTodoId() : ''\n\n    if (attachmentFile) {\n      setOriginalSaving(true)\n      setOriginalSaveError('')\n      try {\n        await uploadOriginalAttachment(createId, attachmentFile)\n      } catch (error) {\n        console.error('Original reminder attachment save failed:', error)\n        setOriginalSaveError(error?.message || '원본 사진 저장에 실패했어. 다시 시도해줘.')\n        return\n      } finally {\n        setOriginalSaving(false)\n      }\n    }\n\n    const savedId = saveTodo({\n      id: '',\n      createId,\n      type: naturalResult.type,\n      title: naturalResult.title,\n      dueDate: naturalResult.dueDate,\n      dueTime: naturalResult.dueTime || '',\n      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,\n    })\n    if (savedId) {\n      resetAI()\n      setSheetOpen(false)\n    }\n  }`,
    'natural submit original save',
  )

  source = replaceExact(
    source,
    `  const saveDisabled = sheetMode === 'natural'\n    ? (attachmentFile ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)\n    : !draft.title.trim() || !draft.dueDate`,
    `  const saveDisabled = originalSaving || (sheetMode === 'natural'\n    ? (attachmentFile ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)\n    : !draft.title.trim() || !draft.dueDate)`,
    'save disabled original saving',
  )

  source = replaceExact(
    source,
    `      <SummarySheet todo={summaryTodo} onClose={() => setSummaryTodo(null)} />`,
    `      <SummarySheet\n        todo={summaryTodo}\n        onClose={() => setSummaryTodo(null)}\n        loadOriginal={summaryTodo?.id ? () => getOriginalAttachment(summaryTodo.id) : null}\n      />`,
    'summary original loader',
  )

  source = replaceExact(
    source,
    `              <AttachmentPicker\n                file={attachmentFile}\n                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFile && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}\n                onChange={changeAttachment}\n                onRetry={retryAttachment}\n              />`,
    `              <AttachmentPicker\n                file={attachmentFile}\n                busy={aiBusy}\n                ready={Boolean(aiResult?.summary)}\n                error={attachmentFile && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}\n                onChange={changeAttachment}\n                onRetry={retryAttachment}\n              />\n\n              {originalSaving ? (\n                <div className="reminder-original-save-status is-working"><span>원본 사진을 저장하는 중…</span></div>\n              ) : originalSaveError ? (\n                <div className="reminder-original-save-status is-error"><span>{originalSaveError}</span></div>\n              ) : null}`,
    'original save status',
  )

  source = replaceExact(
    source,
    `{sheetMode === 'natural' ? '추가' : '저장'}`,
    `{originalSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}`,
    'submit label',
  )
  return source
})

update('src/reminder-summary.jsx', (source) => replaceFromMarker(source, 'export function SummarySheet', `function clamp(value, min, max) {\n  return Math.min(Math.max(value, min), max)\n}\n\nfunction base64ToBlob(dataBase64, mimeType) {\n  const binary = window.atob(dataBase64)\n  const bytes = new Uint8Array(binary.length)\n  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)\n  return new Blob([bytes], { type: mimeType || 'application/octet-stream' })\n}\n\nfunction OriginalImageViewer({ original, onClose }) {\n  const [saving, setSaving] = useState(false)\n\n  async function saveOriginal() {\n    if (!original?.blob || saving) return\n    setSaving(true)\n    try {\n      const file = new File([original.blob], original.name || '원본 사진', { type: original.blob.type || 'image/jpeg' })\n      if (navigator.share && navigator.canShare?.({ files: [file] })) {\n        await navigator.share({ files: [file], title: original.name || '원본 사진' })\n        return\n      }\n      const anchor = document.createElement('a')\n      anchor.href = original.url\n      anchor.download = original.name || '원본-사진'\n      document.body.appendChild(anchor)\n      anchor.click()\n      anchor.remove()\n    } catch (error) {\n      if (error?.name !== 'AbortError') console.error('Original image save failed:', error)\n    } finally {\n      setSaving(false)\n    }\n  }\n\n  if (!original) return null\n\n  return (\n    <div className="reminder-original-viewer" role="dialog" aria-modal="true" aria-label="원본 사진">\n      <button className="reminder-original-backdrop" type="button" aria-label="원본 사진 닫기" onClick={onClose} />\n      <div className="reminder-original-panel">\n        <header>\n          <strong>{original.name || '원본 사진'}</strong>\n          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={onClose}>×</button>\n        </header>\n        <div className="reminder-original-image-wrap">\n          <img src={original.url} alt={original.name || '원본 사진'} />\n        </div>\n        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>\n          {saving ? '준비 중…' : '사진 저장'}\n        </button>\n      </div>\n    </div>\n  )\n}\n\nexport function SummarySheet({ todo, onClose, loadOriginal = null }) {\n  const sheetRef = useRef(null)\n  const backdropRef = useRef(null)\n  const scrollRef = useRef(null)\n  const animationRef = useRef(null)\n  const lastFrameRef = useRef(0)\n  const yRef = useRef(0)\n  const velocityRef = useRef(0)\n  const dragRef = useRef(null)\n  const pullRef = useRef(null)\n  const objectUrlRef = useRef('')\n  const [expanded, setExpanded] = useState(false)\n  const [viewer, setViewer] = useState(null)\n  const [originalState, setOriginalState] = useState('idle')\n  const [originalError, setOriginalError] = useState('')\n\n  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []\n  const canShowOriginal = Boolean(todo?.attachment?.mimeType?.startsWith('image/') && loadOriginal)\n\n  function collapsedY() {\n    return Math.max(220, Math.min(window.innerHeight * 0.4, 430))\n  }\n\n  function closedY() {\n    return Math.max(window.innerHeight + 48, (sheetRef.current?.offsetHeight || window.innerHeight) + 36)\n  }\n\n  function paint(value) {\n    yRef.current = value\n    const sheet = sheetRef.current\n    if (sheet) sheet.style.setProperty('--summary-y', \\`${'${value}'}px\\`)\n    const backdrop = backdropRef.current\n    if (backdrop) {\n      const progress = clamp(value / Math.max(closedY(), 1), 0, 1)\n      backdrop.style.opacity = String((1 - progress) * 0.32)\n    }\n  }\n\n  function stopAnimation() {\n    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)\n    animationRef.current = null\n    lastFrameRef.current = 0\n  }\n\n  function springTo(target, { velocity = velocityRef.current, onComplete = null } = {}) {\n    stopAnimation()\n    velocityRef.current = Number.isFinite(velocity) ? velocity : 0\n    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {\n      velocityRef.current = 0\n      paint(target)\n      onComplete?.()\n      return\n    }\n\n    const closing = target >= closedY() - 2\n    const stiffness = closing ? 126 : 148\n    const damping = closing ? 26 : 27\n\n    function step(time) {\n      if (!lastFrameRef.current) lastFrameRef.current = time\n      const dt = Math.min((time - lastFrameRef.current) / 1000, 0.028)\n      lastFrameRef.current = time\n      const displacement = yRef.current - target\n      const acceleration = -stiffness * displacement - damping * velocityRef.current\n      velocityRef.current += acceleration * dt\n      const next = yRef.current + velocityRef.current * dt\n      paint(target === 0 ? Math.max(0, next) : next)\n\n      const settled = Math.abs(yRef.current - target) < 0.7 && Math.abs(velocityRef.current) < 5\n      if (settled || (closing && yRef.current >= window.innerHeight)) {\n        paint(target)\n        velocityRef.current = 0\n        animationRef.current = null\n        lastFrameRef.current = 0\n        onComplete?.()\n        return\n      }\n      animationRef.current = requestAnimationFrame(step)\n    }\n\n    animationRef.current = requestAnimationFrame(step)\n  }\n\n  function settleCollapsed(velocity = velocityRef.current) {\n    setExpanded(false)\n    springTo(collapsedY(), { velocity })\n  }\n\n  function settleExpanded(velocity = velocityRef.current) {\n    setExpanded(true)\n    springTo(0, { velocity })\n  }\n\n  function requestClose(velocity = velocityRef.current) {\n    springTo(closedY(), {\n      velocity: Math.max(velocity, 340),\n      onComplete: onClose,\n    })\n  }\n\n  useEffect(() => {\n    if (!todo?.summary) return undefined\n    setExpanded(false)\n    setOriginalState('idle')\n    setOriginalError('')\n    setViewer(null)\n    dragRef.current = null\n    pullRef.current = null\n    const previousOverflow = document.body.style.overflow\n    document.body.style.overflow = 'hidden'\n\n    const start = closedY()\n    paint(start)\n    requestAnimationFrame(() => springTo(collapsedY(), { velocity: 0 }))\n\n    return () => {\n      stopAnimation()\n      document.body.style.overflow = previousOverflow\n      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)\n      objectUrlRef.current = ''\n    }\n  }, [todo?.id])\n\n  if (!todo?.summary) return null\n\n  function pointerDown(event) {\n    if (event.button > 0 || event.target.closest('button, a, input, textarea, select')) return\n    if (expanded && event.target.closest('.reminder-summary-scroll')) return\n    stopAnimation()\n    event.currentTarget.setPointerCapture?.(event.pointerId)\n    dragRef.current = {\n      pointerId: event.pointerId,\n      startY: event.clientY,\n      startSheetY: yRef.current,\n      lastY: event.clientY,\n      lastTime: performance.now(),\n      startedExpanded: expanded,\n    }\n    velocityRef.current = 0\n    sheetRef.current?.classList.add('is-dragging')\n  }\n\n  function pointerMove(event) {\n    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId) return\n    const now = performance.now()\n    const delta = event.clientY - drag.startY\n    const next = drag.startedExpanded\n      ? clamp(drag.startSheetY + Math.max(0, delta), 0, closedY())\n      : clamp(drag.startSheetY + delta, 0, closedY())\n    const dt = Math.max((now - drag.lastTime) / 1000, 0.001)\n    velocityRef.current = (event.clientY - drag.lastY) / dt\n    drag.lastY = event.clientY\n    drag.lastTime = now\n    paint(next)\n  }\n\n  function finishDrag(startedExpanded) {\n    sheetRef.current?.classList.remove('is-dragging')\n    const y = yRef.current\n    const velocity = velocityRef.current\n    const collapsed = collapsedY()\n    if (startedExpanded) {\n      if (y > collapsed + 150 || velocity > 1100) requestClose(velocity)\n      else if (y > 70 || velocity > 480) settleCollapsed(velocity)\n      else settleExpanded(velocity)\n    } else if (y < collapsed - 70 || velocity < -520) {\n      settleExpanded(velocity)\n    } else if (y > collapsed + 105 || velocity > 720) {\n      requestClose(velocity)\n    } else {\n      settleCollapsed(velocity)\n    }\n  }\n\n  function pointerEnd(event) {\n    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId) return\n    dragRef.current = null\n    event.currentTarget.releasePointerCapture?.(event.pointerId)\n    finishDrag(drag.startedExpanded)\n  }\n\n  function scrollTouchStart(event) {\n    if (!expanded || event.touches.length !== 1) return\n    const touch = event.touches[0]\n    pullRef.current = {\n      startY: touch.clientY,\n      lastY: touch.clientY,\n      lastTime: performance.now(),\n      active: false,\n    }\n  }\n\n  function scrollTouchMove(event) {\n    const pull = pullRef.current\n    if (!expanded || !pull || event.touches.length !== 1) return\n    const touch = event.touches[0]\n    const delta = touch.clientY - pull.startY\n    if (!pull.active) {\n      if ((scrollRef.current?.scrollTop || 0) > 0 || delta <= 10) return\n      pull.active = true\n      stopAnimation()\n    }\n    event.preventDefault()\n    const now = performance.now()\n    const dt = Math.max((now - pull.lastTime) / 1000, 0.001)\n    velocityRef.current = (touch.clientY - pull.lastY) / dt\n    pull.lastY = touch.clientY\n    pull.lastTime = now\n    paint(clamp(delta, 0, closedY()))\n  }\n\n  function scrollTouchEnd() {\n    const pull = pullRef.current\n    pullRef.current = null\n    if (pull?.active) finishDrag(true)\n  }\n\n  async function openOriginal() {\n    if (!loadOriginal || originalState === 'loading') return\n    setOriginalState('loading')\n    setOriginalError('')\n    try {\n      const original = await loadOriginal()\n      const blob = base64ToBlob(original.dataBase64, original.mimeType)\n      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)\n      const url = URL.createObjectURL(blob)\n      objectUrlRef.current = url\n      setViewer({ ...original, blob, url })\n      setOriginalState('ready')\n    } catch (error) {\n      console.error('Original reminder image load failed:', error)\n      setOriginalError(error?.message || '원본 사진을 불러오지 못했어.')\n      setOriginalState('error')\n    }\n  }\n\n  function closeViewer() {\n    setViewer(null)\n  }\n\n  return (\n    <div className="reminder-summary-layer" role="presentation">\n      <button ref={backdropRef} className="reminder-summary-backdrop" type="button" aria-label="요약 닫기" onClick={() => requestClose(340)} />\n      <section\n        ref={sheetRef}\n        className={\`reminder-summary-sheet \${expanded ? 'is-expanded' : 'is-collapsed'}\`}\n        aria-label={\`${'${todo.title}'} 요약\`}\n        onPointerDown={pointerDown}\n        onPointerMove={pointerMove}\n        onPointerUp={pointerEnd}\n        onPointerCancel={pointerEnd}\n      >\n        <div className="reminder-summary-grabber-wrap" aria-hidden="true">\n          <span className="reminder-summary-grabber" />\n        </div>\n\n        <header className="reminder-summary-header">\n          <div>\n            <p>{todo.attachment?.name ? \`첨부 · \${todo.attachment.name}\` : '리마인더 요약'}</p>\n            <h2>{todo.title}</h2>\n          </div>\n          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={() => requestClose(340)}>×</button>\n        </header>\n\n        <div\n          ref={scrollRef}\n          className="reminder-summary-scroll"\n          onTouchStart={scrollTouchStart}\n          onTouchMove={scrollTouchMove}\n          onTouchEnd={scrollTouchEnd}\n          onTouchCancel={scrollTouchEnd}\n        >\n          {todo.summary.overview ? <p className="reminder-summary-overview">{todo.summary.overview}</p> : null}\n          {sections.map((section, sectionIndex) => (\n            <section className="reminder-summary-section" key={\`${'${section.heading}'}-${'${sectionIndex}'}\`}>\n              <h3>{section.heading}</h3>\n              <ul>\n                {section.items.map((item, itemIndex) => (\n                  <li key={\`${'${sectionIndex}'}-${'${itemIndex}'}\`}>{item}</li>\n                ))}\n              </ul>\n            </section>\n          ))}\n\n          {canShowOriginal ? (\n            <div className="reminder-original-action">\n              <button type="button" onClick={openOriginal} disabled={originalState === 'loading'}>\n                {originalState === 'loading' ? '원본 불러오는 중…' : '원본 사진 보기'}\n              </button>\n              {originalError ? <small>{originalError}</small> : null}\n            </div>\n          ) : null}\n        </div>\n      </section>\n\n      <OriginalImageViewer original={viewer} onClose={closeViewer} />\n    </div>\n  )\n}\n`, 'summary sheet replacement'))

update('src/reminder-summary.css', (source) => replaceFromMarker(source, '.reminder-summary-layer {', `.reminder-summary-layer {\n  position: fixed;\n  z-index: 120;\n  inset: 0;\n  pointer-events: none;\n}\n\n.reminder-summary-backdrop {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  padding: 0;\n  border: 0;\n  background: #000;\n  opacity: 0;\n  pointer-events: auto;\n  touch-action: none;\n}\n\n.reminder-summary-sheet {\n  position: absolute;\n  left: 50%;\n  bottom: 0;\n  display: grid;\n  grid-template-rows: auto auto minmax(0, 1fr);\n  width: min(calc(100% - 16px), 700px);\n  height: calc(100dvh - max(10px, env(safe-area-inset-top)));\n  overflow: hidden;\n  border: 1px solid var(--border);\n  border-bottom: 0;\n  border-radius: 28px 28px 0 0;\n  background: var(--surface);\n  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);\n  pointer-events: auto;\n  transform: translate3d(-50%, var(--summary-y, 110%), 0);\n  will-change: transform;\n}\n\n.reminder-summary-sheet.is-collapsed {\n  touch-action: none;\n}\n\n.reminder-summary-sheet.is-expanded {\n  border-radius: 24px 24px 0 0;\n}\n\n.reminder-summary-sheet.is-dragging {\n  user-select: none;\n}\n\n.reminder-summary-grabber-wrap {\n  display: grid;\n  place-items: center;\n  min-height: 28px;\n}\n\n.reminder-summary-grabber {\n  width: 38px;\n  height: 5px;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--text-secondary) 38%, transparent);\n}\n\n.reminder-summary-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 4px 20px 16px;\n  border-bottom: 1px solid var(--divider);\n}\n\n.reminder-summary-header > div { min-width: 0; }\n\n.reminder-summary-header p {\n  overflow: hidden;\n  margin: 0 0 6px;\n  color: var(--text-tertiary);\n  font-size: 11px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.reminder-summary-header h2 {\n  display: -webkit-box;\n  overflow: hidden;\n  margin: 0;\n  color: var(--text);\n  font-size: clamp(22px, 5.5vw, 29px);\n  line-height: 1.14;\n  letter-spacing: -0.04em;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n\n.reminder-summary-close {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  padding: 0;\n  border: 1px solid var(--border);\n  border-radius: 50%;\n  background: var(--surface-soft);\n  color: var(--text-secondary);\n  font-size: 22px;\n  font-weight: 400;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.reminder-summary-scroll {\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  padding: 20px 20px calc(28px + env(safe-area-inset-bottom));\n  -webkit-overflow-scrolling: touch;\n}\n\n.reminder-summary-sheet.is-collapsed .reminder-summary-scroll {\n  overflow: hidden;\n}\n\n.reminder-summary-overview {\n  margin: 0 0 28px;\n  color: var(--text);\n  font-size: 15px;\n  line-height: 1.7;\n  letter-spacing: -0.018em;\n}\n\n.reminder-summary-section + .reminder-summary-section { margin-top: 26px; }\n\n.reminder-summary-section h3 {\n  margin: 0 0 10px;\n  color: var(--text);\n  font-size: 14px;\n  font-weight: 760;\n  letter-spacing: -0.02em;\n}\n\n.reminder-summary-section ul {\n  display: grid;\n  gap: 9px;\n  margin: 0;\n  padding: 0 0 0 18px;\n}\n\n.reminder-summary-section li {\n  padding-left: 2px;\n  color: var(--text-secondary);\n  font-size: 14px;\n  line-height: 1.58;\n  letter-spacing: -0.015em;\n}\n\n.reminder-original-action {\n  display: grid;\n  gap: 9px;\n  margin-top: 34px;\n  padding-top: 20px;\n  border-top: 1px solid var(--divider);\n}\n\n.reminder-original-action > button {\n  min-height: 46px;\n  border: 1px solid var(--border);\n  border-radius: 15px;\n  background: var(--surface-soft);\n  color: var(--text);\n  font-size: 13px;\n  font-weight: 740;\n  cursor: pointer;\n}\n\n.reminder-original-action > button:disabled { opacity: 0.52; }\n\n.reminder-original-action > small {\n  color: #d84d49;\n  font-size: 11px;\n  line-height: 1.45;\n}\n\n.reminder-original-save-status {\n  display: flex;\n  align-items: center;\n  margin: -2px 2px 0;\n  color: var(--text-tertiary);\n  font-size: 11px;\n  line-height: 1.45;\n}\n\n.reminder-original-save-status.is-error { color: #d84d49; }\n\n.reminder-original-viewer {\n  position: fixed;\n  z-index: 150;\n  inset: 0;\n  display: grid;\n  place-items: center;\n  padding: max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom));\n  pointer-events: auto;\n}\n\n.reminder-original-backdrop {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  border: 0;\n  background: rgba(0, 0, 0, 0.78);\n}\n\n.reminder-original-panel {\n  position: relative;\n  z-index: 1;\n  display: grid;\n  grid-template-rows: auto minmax(0, 1fr) auto;\n  width: min(100%, 760px);\n  height: min(92dvh, 920px);\n  overflow: hidden;\n  border: 1px solid color-mix(in srgb, #fff 12%, transparent);\n  border-radius: 24px;\n  background: #111;\n  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);\n  animation: reminder-original-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;\n}\n\n@keyframes reminder-original-in {\n  from { opacity: 0; transform: scale(0.98) translate3d(0, 8px, 0); }\n  to { opacity: 1; transform: scale(1) translate3d(0, 0, 0); }\n}\n\n.reminder-original-panel > header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 14px;\n  padding: 12px 14px 10px 18px;\n}\n\n.reminder-original-panel > header strong {\n  min-width: 0;\n  overflow: hidden;\n  color: #f5f5f7;\n  font-size: 13px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.reminder-original-panel .reminder-summary-close {\n  border-color: rgba(255, 255, 255, 0.12);\n  background: rgba(255, 255, 255, 0.09);\n  color: #f5f5f7;\n}\n\n.reminder-original-image-wrap {\n  display: grid;\n  place-items: center;\n  min-height: 0;\n  overflow: auto;\n  padding: 8px 12px;\n  touch-action: pinch-zoom pan-x pan-y;\n}\n\n.reminder-original-image-wrap img {\n  display: block;\n  max-width: 100%;\n  max-height: 100%;\n  object-fit: contain;\n}\n\n.reminder-original-save {\n  min-height: 48px;\n  margin: 12px 16px calc(12px + env(safe-area-inset-bottom));\n  border: 0;\n  border-radius: 15px;\n  background: #f5f5f7;\n  color: #111;\n  font-size: 13px;\n  font-weight: 760;\n}\n\n.todo-stage5 .todo-item-main.has-summary { cursor: pointer; }\n.todo-stage5 .todo-item-main.has-summary:active { opacity: 0.68; }\n\n@media (max-width: 430px) {\n  .reminder-attachment-selected { align-items: flex-start; }\n  .reminder-attachment-selected > div:first-child { grid-template-columns: auto minmax(0, 1fr); }\n  .reminder-attachment-selected small { grid-column: 2; }\n  .reminder-summary-header,\n  .reminder-summary-scroll { padding-left: 18px; padding-right: 18px; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .reminder-original-panel { animation: none; }\n}\n`, 'summary css replacement'))

update('src/todo-stage5.css', (source) => {
  source = replaceExact(
    source,
    `.todo-stage5 .todo-item.is-completed .todo-date-text {\n  opacity: 0.52;\n}`,
    `.todo-stage5 .todo-item.is-completed .todo-date-text {\n  flex: none;\n  opacity: 0.52;\n}\n\n.todo-stage5 .todo-item.is-completed .todo-item-main {\n  overflow: hidden;\n  padding-right: 12px;\n}\n\n.todo-stage5 .todo-item.is-completed .todo-row-actions {\n  flex: none;\n  min-width: 132px;\n  gap: 16px;\n  padding-left: 12px;\n}`,
    'completed row spacing',
  )
  return source
})

update('firestore.rules', (source) => {
  source = replaceExact(
    source,
    `    function validPersonalTodoState() {\n      return request.resource.data.keys().hasOnly(['completed', 'hidden', 'updatedAt'])`,
    `    function validOriginalAttachment() {\n      return request.resource.data.keys().hasOnly(['name', 'mimeType', 'size', 'chunkCount', 'createdAt'])\n        && request.resource.data.keys().hasAll(['name', 'mimeType', 'size', 'chunkCount', 'createdAt'])\n        && request.resource.data.name is string\n        && request.resource.data.name.size() > 0\n        && request.resource.data.name.size() <= 120\n        && request.resource.data.mimeType in [\n          'application/pdf', 'application/json', 'text/plain', 'text/csv', 'text/rtf',\n          'text/html', 'text/xml', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp',\n          'image/heic', 'image/heif'\n        ]\n        && request.resource.data.size is int\n        && request.resource.data.size > 0\n        && request.resource.data.size <= 8000000\n        && request.resource.data.chunkCount is int\n        && request.resource.data.chunkCount > 0\n        && request.resource.data.chunkCount <= 24\n        && request.resource.data.createdAt is int;\n    }\n\n    function validOriginalChunk() {\n      return request.resource.data.keys().hasOnly(['data'])\n        && request.resource.data.keys().hasAll(['data'])\n        && request.resource.data.data is string\n        && request.resource.data.data.size() > 0\n        && request.resource.data.data.size() <= 600000;\n    }\n\n    function validPersonalTodoState() {\n      return request.resource.data.keys().hasOnly(['completed', 'hidden', 'updatedAt'])`,
    'firestore original validators',
  )

  source = replaceExact(
    source,
    `    match /students/{studentId}/todoState/{todoId} {`,
    `    match /classes/{classId}/originalAttachments/{todoId} {\n      allow read: if signedIn();\n      allow create, update: if signedIn() && validOriginalAttachment();\n      allow delete: if false;\n    }\n\n    match /classes/{classId}/originalAttachments/{todoId}/chunks/{chunkId} {\n      allow read: if signedIn();\n      allow create, update: if signedIn() && validOriginalChunk();\n      allow delete: if false;\n    }\n\n    match /students/{studentId}/todoState/{todoId} {`,
    'firestore original matches',
  )
  return source
})

update('public/sw.js', (source) => replaceExact(source, "const CACHE_NAME = 'school-shell-v71'", "const CACHE_NAME = 'school-shell-v72'", 'service worker cache'))

console.log('summary original fix applied')
