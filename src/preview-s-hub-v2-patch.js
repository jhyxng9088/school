function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview S-Hub V2 patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchMainSource(source) {
  let next = source
  next = replaceRequired(
    next,
    "  const [aiOpen, setAiOpen] = useState(false)\n  const { toast, requireOnline } = useNetworkGuard()",
    `  const [aiOpen, setAiOpen] = useState(false)\n\n  useLayoutEffect(() => {\n    const resetScroll = () => {\n      window.scrollTo(0, 0)\n      const scroller = document.scrollingElement\n      if (scroller) scroller.scrollTop = 0\n      document.documentElement.scrollTop = 0\n      document.body.scrollTop = 0\n    }\n    resetScroll()\n    const frame = window.requestAnimationFrame(resetScroll)\n    return () => window.cancelAnimationFrame(frame)\n  }, [activeTab])\n\n  const { toast, requireOnline } = useNetworkGuard()`,
    'tab scroll reset',
  )

  return next
}

function patchTodoStage5Source(source) {
  let next = source
  next = replaceRequired(
    next,
    "  REMINDER_CATEGORY_COLORS,\n  reminderTypeColor,",
    "  REMINDER_CATEGORY_COLORS,\n  CUSTOM_REMINDER_CATEGORY_COLORS,\n  reminderFilterOptions,\n  reminderSectionById,\n  reminderTypeColor,",
    'reminder category imports',
  )

  next = replaceRequired(
    next,
    "import { UnifiedBottomSheet } from './unified-sheet.jsx'\nimport './todo-stage5.css'\nimport './todo-ai.css'",
    "import { UnifiedBottomSheet } from './unified-sheet.jsx'\nimport { saveReminderSectionChange } from './reminder-section-client.js'\nimport './todo-stage5.css'\nimport './todo-ai.css'\nimport './preview-section-management.css'",
    'section management imports',
  )

  next = replaceRequired(
    next,
    "  const [categorySaveError, setCategorySaveError] = useState('')\n  const activity = useClassActivity()",
    `  const [categorySaveError, setCategorySaveError] = useState('')\n  const [sectionActionTarget, setSectionActionTarget] = useState(null)\n  const [sectionActionOpen, setSectionActionOpen] = useState(false)\n  const [sectionActionError, setSectionActionError] = useState('')\n  const [sectionEditTarget, setSectionEditTarget] = useState(null)\n  const [sectionEditOpen, setSectionEditOpen] = useState(false)\n  const [sectionEditName, setSectionEditName] = useState('')\n  const [sectionEditColor, setSectionEditColor] = useState('')\n  const [sectionSaving, setSectionSaving] = useState(false)\n  const [sectionEditError, setSectionEditError] = useState('')\n  const activity = useClassActivity()`,
    'section management state',
  )

  next = replaceRequired(
    next,
    "  const conflictApprovalRef = useRef('')",
    `  const conflictApprovalRef = useRef('')\n  const sectionPressTimerRef = useRef(0)\n  const sectionEditTimerRef = useRef(0)\n  const suppressSectionClickRef = useRef(false)`,
    'section management refs',
  )

  next = replaceRequired(
    next,
    "  const filters = useMemo(() => [{ id: 'all', label: '전체' }, ...types], [types])",
    "  const filters = useMemo(() => reminderFilterOptions(categories), [categories])",
    'class section filters',
  )

  next = replaceRequired(
    next,
    "    () => REMINDER_CATEGORY_COLORS.filter((color) => !usedCategoryColors.has(color.id)),",
    "    () => CUSTOM_REMINDER_CATEGORY_COLORS.filter((color) => !usedCategoryColors.has(color.id)),",
    'custom category palette',
  )

  next = replaceRequired(
    next,
    "  const active = sorted.filter((todo) => !todo.completed)",
    `  const sectionEditUsedColors = useMemo(() => {\n    const used = usedReminderCategoryColors(categories)\n    const current = reminderSectionById(sectionEditTarget?.id, categories)\n    if (current?.color) used.delete(current.color)\n    return used\n  }, [categories, sectionEditTarget?.id])\n  const active = sorted.filter((todo) => !todo.completed)`,
    'section edit palette',
  )

  next = replaceRequired(
    next,
    "  useEffect(() => {\n    const timer = window.setTimeout(() => setPageEntering(false), 1150)\n    return () => window.clearTimeout(timer)\n  }, [])\n\n  useEffect(() => {\n    const text = naturalText.trim()",
    `  useEffect(() => {\n    const timer = window.setTimeout(() => setPageEntering(false), 1150)\n    return () => window.clearTimeout(timer)\n  }, [])\n\n  useEffect(() => {\n    if (filters.some((item) => item.id === filter)) return\n    setFilter(filters[0]?.id || 'all')\n  }, [filter, filters])\n\n  useEffect(() => () => {\n    if (sectionPressTimerRef.current) window.clearTimeout(sectionPressTimerRef.current)\n    if (sectionEditTimerRef.current) window.clearTimeout(sectionEditTimerRef.current)\n  }, [])\n\n  useEffect(() => {\n    const text = naturalText.trim()`,
    'section lifecycle effects',
  )

  next = replaceRequired(
    next,
    "  function openCreate() {",
    `  function clearSectionPressTimer() {\n    if (!sectionPressTimerRef.current) return\n    window.clearTimeout(sectionPressTimerRef.current)\n    sectionPressTimerRef.current = 0\n  }\n\n  function openSectionActions(item) {\n    if (!item) return\n    setSectionActionTarget(item)\n    setSectionActionError('')\n    setSectionActionOpen(true)\n  }\n\n  function beginSectionPress(item, event) {\n    if (event?.button != null && event.button > 0) return\n    suppressSectionClickRef.current = false\n    clearSectionPressTimer()\n    sectionPressTimerRef.current = window.setTimeout(() => {\n      sectionPressTimerRef.current = 0\n      suppressSectionClickRef.current = true\n      openSectionActions(item)\n    }, 520)\n  }\n\n  function finishSectionPress() {\n    clearSectionPressTimer()\n  }\n\n  function handleSectionClick(item) {\n    if (suppressSectionClickRef.current) {\n      suppressSectionClickRef.current = false\n      return\n    }\n    setFilter(item.id)\n  }\n\n  function handleSectionContextMenu(event, item) {\n    event.preventDefault()\n    clearSectionPressTimer()\n    suppressSectionClickRef.current = true\n    openSectionActions(item)\n  }\n\n  function sectionSaveErrorMessage(error) {\n    const code = String(error?.code || '')\n    if (code === 'reminder-section/duplicate-label') return '이미 사용 중인 섹션 이름입니다.'\n    if (code === 'reminder-section/duplicate-color') return '이미 사용 중인 색상입니다. 다른 색상을 선택해 주세요.'\n    if (code === 'reminder-section/last-visible') return '마지막 남은 섹션은 삭제할 수 없습니다.'\n    if (code === 'reminder-section/profile-required') return '학생 정보를 확인하지 못했습니다. 앱을 다시 열어 주세요.'\n    return '섹션 설정을 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'\n  }\n\n  function openSectionEditFromAction() {\n    const target = sectionActionTarget\n    if (!target || sectionSaving) return\n    setSectionActionOpen(false)\n    if (sectionEditTimerRef.current) window.clearTimeout(sectionEditTimerRef.current)\n    sectionEditTimerRef.current = window.setTimeout(() => {\n      sectionEditTimerRef.current = 0\n      const current = reminderSectionById(target.id, categories) || target\n      setSectionEditTarget(current)\n      setSectionEditName(current.label || '')\n      setSectionEditColor(current.color || '')\n      setSectionEditError('')\n      setSectionEditOpen(true)\n    }, 340)\n  }\n\n  async function submitSectionEdit() {\n    const target = sectionEditTarget\n    const label = sectionEditName.normalize('NFKC').trim().replace(/\\s+/g, ' ')\n    if (!target || !label || sectionSaving) return\n    if (target.id !== 'all' && !sectionEditColor) return\n    if (!requireOnline('리마인더 섹션을 수정')) return\n    setSectionSaving(true)\n    setSectionEditError('')\n    try {\n      const result = await saveReminderSectionChange({\n        action: 'update',\n        sectionId: target.id,\n        label,\n        color: sectionEditColor,\n        categories,\n      })\n      if (result?.pendingSync) {\n        setSectionEditError('서버 사용량 제한으로 이 기기에 임시 저장했어요. 서버 제한이 풀리면 자동으로 다시 반영돼요.')\n        return\n      }\n      setSectionEditOpen(false)\n    } catch (error) {\n      setSectionEditError(sectionSaveErrorMessage(error))\n    } finally {\n      setSectionSaving(false)\n    }\n  }\n\n  async function deleteSectionFromAction() {\n    const target = sectionActionTarget\n    if (!target || sectionSaving) return\n    if (!requireOnline('리마인더 섹션을 삭제')) return\n    setSectionSaving(true)\n    setSectionActionError('')\n    try {\n      await saveReminderSectionChange({\n        action: 'delete',\n        sectionId: target.id,\n        categories,\n      })\n      if (filter === target.id) {\n        const fallback = filters.find((item) => item.id !== target.id)\n        if (fallback) setFilter(fallback.id)\n      }\n      setSectionActionOpen(false)\n    } catch (error) {\n      setSectionActionError(sectionSaveErrorMessage(error))\n    } finally {\n      setSectionSaving(false)\n    }\n  }\n\n  function openCreate() {`,
    'section interaction handlers',
  )

  next = replaceRequired(
    next,
    "                aria-pressed={filter === item.id}\n                onClick={() => setFilter(item.id)}\n                key={item.id}",
    `                aria-pressed={filter === item.id}\n                onPointerDown={(event) => beginSectionPress(item, event)}\n                onPointerUp={finishSectionPress}\n                onPointerCancel={finishSectionPress}\n                onPointerLeave={finishSectionPress}\n                onContextMenu={(event) => handleSectionContextMenu(event, item)}\n                onClick={() => handleSectionClick(item)}\n                key={item.id}`,
    'filter long press handlers',
  )

  next = replaceRequired(
    next,
    `                {item.id !== 'all' ? (\n                  <span\n                    className="reminder-filter-dot"\n                    style={{ '--reminder-type-color': reminderTypeColor(item.id, categories) }}\n                    aria-hidden="true"\n                  />\n                ) : null}`,
    `                {item.color ? (\n                  <span\n                    className="reminder-filter-dot"\n                    style={{ '--reminder-type-color': item.color }}\n                    aria-hidden="true"\n                  />\n                ) : null}`,
    'filter configured colors',
  )

  next = replaceRequired(
    next,
    `      <UnifiedBottomSheet\n        open={categorySheetOpen}`,
    `      <UnifiedBottomSheet\n        open={sectionActionOpen}\n        onClose={() => { if (!sectionSaving) setSectionActionOpen(false) }}\n        closeDisabled={sectionSaving}\n        title={sectionActionTarget?.label || '섹션'}\n        subtitle="이 반의 섹션 설정입니다."\n        ariaLabel="리마인더 섹션 메뉴"\n        className="reminder-section-action-sheet"\n      >\n        <div className="reminder-section-action-buttons">\n          <button type="button" onClick={openSectionEditFromAction} disabled={sectionSaving}>수정</button>\n          <button type="button" className="is-danger" onClick={deleteSectionFromAction} disabled={sectionSaving}>\n            {sectionSaving ? '삭제 중…' : '삭제'}\n          </button>\n          {sectionActionError ? <p className="change-warning">{sectionActionError}</p> : null}\n        </div>\n      </UnifiedBottomSheet>\n\n      <UnifiedBottomSheet\n        open={sectionEditOpen}\n        onClose={() => { if (!sectionSaving) setSectionEditOpen(false) }}\n        closeDisabled={sectionSaving}\n        title="섹션 수정"\n        subtitle="변경 내용은 이 반에만 적용됩니다."\n        ariaLabel="리마인더 섹션 수정"\n        className="reminder-section-edit-sheet"\n      >\n        <div className="reminder-category-form">\n          <label className="change-field full reminder-category-name-field">\n            <span>섹션 이름</span>\n            <input\n              value={sectionEditName}\n              onChange={(event) => setSectionEditName(event.target.value.slice(0, 16))}\n              placeholder="섹션 이름"\n              autoComplete="off"\n              spellCheck="false"\n            />\n          </label>\n\n          <fieldset className="reminder-category-colors">\n            <legend>색상</legend>\n            <div>\n              {sectionEditTarget?.id === 'all' ? (\n                <button\n                  type="button"\n                  className={sectionEditColor === '' ? 'is-selected reminder-section-no-color' : 'reminder-section-no-color'}\n                  aria-label="색상 없음"\n                  aria-pressed={sectionEditColor === ''}\n                  onClick={() => setSectionEditColor('')}\n                >\n                  <span aria-hidden="true">—</span>\n                </button>\n              ) : null}\n              {REMINDER_CATEGORY_COLORS.map((color) => {\n                const used = sectionEditUsedColors.has(color.id)\n                return (\n                  <button\n                    type="button"\n                    className={sectionEditColor === color.id ? 'is-selected' : ''}\n                    aria-label={color.label + (used ? ', 사용 중' : '')}\n                    aria-pressed={sectionEditColor === color.id}\n                    disabled={used}\n                    onClick={() => setSectionEditColor(color.id)}\n                    key={color.id}\n                  >\n                    <span style={{ '--reminder-type-color': color.id }} aria-hidden="true" />\n                  </button>\n                )\n              })}\n            </div>\n          </fieldset>\n\n          {sectionEditError ? <p className="change-warning">{sectionEditError}</p> : null}\n          <div className="change-submit-row">\n            <button type="button" onClick={() => setSectionEditOpen(false)} disabled={sectionSaving}>취소</button>\n            <button\n              type="button"\n              className="save-change"\n              disabled={!sectionEditName.trim() || (sectionEditTarget?.id !== 'all' && !sectionEditColor) || sectionSaving}\n              onClick={submitSectionEdit}\n            >\n              {sectionSaving ? '저장 중…' : '저장'}\n            </button>\n          </div>\n        </div>\n      </UnifiedBottomSheet>\n\n      <UnifiedBottomSheet\n        open={categorySheetOpen}`,
    'section action and edit sheets',
  )

  next = next.replace(
    'subtitle="리마인더를 구분할 이름과 색을 골라."',
    'subtitle="리마인더를 구분할 이름과 색상을 골라 주세요."',
  )

  return next
}

export function patchPreviewSHubV2Source(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/main.jsx')) return patchMainSource(String(source || ''))
  if (cleanId.endsWith('/todo-stage5-ai.jsx')) return patchTodoStage5Source(String(source || ''))
  return String(source || '')
}
