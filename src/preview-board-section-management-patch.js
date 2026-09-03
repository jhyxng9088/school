function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview board section management marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview board section management range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const BOARD_SECTIONS = String.raw`function BoardSections({ sections, activeSectionId, onSelect, onAdd, onManage }) {
  const pressTimerRef = useRef(0)
  const suppressClickRef = useRef(false)

  useEffect(() => () => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current)
  }, [])

  function clearPressTimer() {
    if (!pressTimerRef.current) return
    window.clearTimeout(pressTimerRef.current)
    pressTimerRef.current = 0
  }

  function canManage(section) {
    return Boolean(section && !section.builtin && section.ownedByMe)
  }

  function beginPress(section, event) {
    if (!canManage(section)) return
    if (event?.button != null && event.button > 0) return
    suppressClickRef.current = false
    clearPressTimer()
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = 0
      suppressClickRef.current = true
      onManage(section.id)
    }, 520)
  }

  function finishPress() {
    clearPressTimer()
  }

  function handleClick(section) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(section.id)
  }

  function handleContextMenu(event, section) {
    if (!canManage(section)) return
    event.preventDefault()
    clearPressTimer()
    onManage(section.id)
  }

  return (
    <div className="preview-board-sections-shell">
      <div className="preview-board-sections" role="tablist" aria-label="게시판 섹션">
        {[ALL_BOARD_SECTION, ...sections].map((section) => {
          const manageable = canManage(section)
          return (
            <button
              type="button"
              role="tab"
              key={section.id}
              className={section.id === activeSectionId ? 'is-active' : ''}
              aria-selected={section.id === activeSectionId}
              aria-label={manageable ? section.label + ', 길게 눌러 편집' : section.label}
              onPointerDown={(event) => beginPress(section, event)}
              onPointerUp={finishPress}
              onPointerCancel={finishPress}
              onPointerLeave={finishPress}
              onContextMenu={(event) => handleContextMenu(event, section)}
              onClick={() => handleClick(section)}
            >
              <SectionDot section={section} />
              <span>{section.label}</span>
            </button>
          )
        })}
        <button type="button" className="preview-board-section-add" aria-label="게시판 섹션 추가" onClick={onAdd}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

`

const BOARD_SECTION_ACTION_SHEET = String.raw`function BoardSectionActionSheet({ section, open, onClose, onEdit, onDeleted }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPending(false)
    setError('')
  }, [open, section?.id])

  if (!section || section.builtin || !section.ownedByMe) return null

  async function removeSection() {
    if (pending) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    try {
      const result = await deletePreviewBoardSection(section.id)
      onDeleted(result)
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '섹션을 삭제하지 못했어요.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={() => { if (!pending) onClose() }}
      closeDisabled={pending}
      title={section.label || '섹션'}
      subtitle="이 반의 게시판 섹션 설정입니다."
      ariaLabel="게시판 섹션 메뉴"
      className="preview-board-section-action-sheet"
    >
      <div className="preview-board-section-action-buttons">
        <button type="button" onClick={() => onEdit(section.id)} disabled={pending}>수정</button>
        <button type="button" className="is-danger" onClick={removeSection} disabled={pending}>
          {pending ? '삭제 중…' : '삭제'}
        </button>
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}
      </div>
    </UnifiedBottomSheet>
  )
}

function BoardSectionEditor({ section, sections, open, onClose, onUpdated, onDeleted }) {
  const [label, setLabel] = useState(section?.label || '')
  const [color, setColor] = useState(section?.color || '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const usedColors = useMemo(() => new Set(
    sections.filter((item) => item.id !== section?.id).map((item) => String(item.color || '').toLowerCase()).filter(Boolean),
  ), [sections, section?.id])

  useEffect(() => {
    if (!open || !section) return
    setLabel(section.label || '')
    setColor(section.color || '')
    setPending(false)
    setError('')
  }, [open, section?.id, section?.updatedAt])

  if (!section || section.builtin || !section.ownedByMe) return null
  const normalizedLabel = label.normalize('NFKC').trim().replace(/\s+/g, ' ')
  const canSave = normalizedLabel.length > 0 && Boolean(color) && !pending

  async function submit(event) {
    event.preventDefault()
    if (!canSave) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    try {
      const updated = await editPreviewBoardSection(section.id, normalizedLabel, color)
      onUpdated(updated)
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '섹션을 수정하지 못했어요.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title="섹션 수정"
      subtitle="변경 내용은 이 반의 게시판에 적용됩니다."
      ariaLabel="게시판 섹션 수정"
      closeDisabled={pending}
      className="preview-board-section-sheet preview-board-section-edit-sheet"
    >
      <form className="preview-board-section-form" onSubmit={submit}>
        <label className="preview-board-section-name-field">
          <span>섹션 이름</span>
          <input
            type="text"
            value={label}
            maxLength={16}
            placeholder="섹션 이름"
            onChange={(event) => setLabel(event.target.value.slice(0, 16))}
            disabled={pending}
            autoComplete="off"
            spellCheck="false"
          />
        </label>
        <fieldset className="preview-board-section-colors">
          <legend>색상</legend>
          <div>
            {REMINDER_CATEGORY_COLORS.map((item) => {
              const used = usedColors.has(item.id)
              return (
                <button
                  type="button"
                  className={color === item.id ? 'is-selected' : ''}
                  aria-label={item.label + (used ? ', 사용 중' : '')}
                  aria-pressed={color === item.id}
                  disabled={used || pending}
                  onClick={() => setColor(item.id)}
                  key={item.id}
                >
                  <span style={{ '--preview-board-section-color': item.id }} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </fieldset>
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}
        <div className="preview-board-section-actions">
          <button type="button" onClick={onClose} disabled={pending}>취소</button>
          <button type="submit" className="is-primary" disabled={!canSave}>{pending ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </UnifiedBottomSheet>
  )
}

`

function patchBoardComplete(source) {
  let next = String(source || '')
  if (next.includes('preview-board-section-action-sheet') && next.includes('beginPress(section, event)')) return next

  const reactImportWithRef = `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`
  if (!next.includes(reactImportWithRef)) {
    next = replaceRequired(
      next,
      `import { useCallback, useEffect, useMemo, useState } from 'react'`,
      reactImportWithRef,
      'restore useRef for section long press',
    )
  }

  next = replaceRequired(
    next,
    `import './preview-board-complete.css'`,
    `import './preview-board-complete.css'\nimport './preview-board-section-management.css'`,
    'section management stylesheet',
  )

  next = spliceRequired(next, 'function BoardSections(', 'function BoardState(', BOARD_SECTIONS, 'board sections interaction')
  next = spliceRequired(next, 'function BoardSectionEditor(', 'function BoardDetail(', BOARD_SECTION_ACTION_SHEET, 'board section sheets')

  next = replaceRequired(
    next,
    `  const [sectionComposerOpen, setSectionComposerOpen] = useState(false)\n  const [sectionEditorId, setSectionEditorId] = useState('')`,
    `  const [sectionComposerOpen, setSectionComposerOpen] = useState(false)\n  const [sectionActionId, setSectionActionId] = useState('')\n  const [sectionEditorId, setSectionEditorId] = useState('')\n  const sectionEditOpenTimerRef = useRef(0)`,
    'section action state',
  )

  next = replaceRequired(
    next,
    `  const sectionEditor = useMemo(() => sections.find((section) => section.id === sectionEditorId) || null, [sections, sectionEditorId])`,
    `  const sectionAction = useMemo(() => sections.find((section) => section.id === sectionActionId) || null, [sections, sectionActionId])\n  const sectionEditor = useMemo(() => sections.find((section) => section.id === sectionEditorId) || null, [sections, sectionEditorId])`,
    'section action target',
  )

  next = replaceRequired(
    next,
    `  const activeSectionName = activeSection.label || '일반'`,
    `  const activeSectionName = activeSection.label || '일반'\n\n  useEffect(() => () => {\n    if (sectionEditOpenTimerRef.current) window.clearTimeout(sectionEditOpenTimerRef.current)\n  }, [])\n\n  function openSectionActions(sectionId) {\n    const target = sections.find((section) => section.id === sectionId)\n    if (!target || target.builtin || !target.ownedByMe) return\n    setSectionActionId(target.id)\n  }\n\n  function openSectionEditFromAction(sectionId) {\n    const target = sections.find((section) => section.id === sectionId)\n    if (!target || target.builtin || !target.ownedByMe) return\n    setSectionActionId('')\n    if (sectionEditOpenTimerRef.current) window.clearTimeout(sectionEditOpenTimerRef.current)\n    sectionEditOpenTimerRef.current = window.setTimeout(() => {\n      sectionEditOpenTimerRef.current = 0\n      setSectionEditorId(target.id)\n    }, 340)\n  }`,
    'section action handlers',
  )

  next = replaceRequired(
    next,
    "    setSectionEditorId('')\n    announceMutation(`section:${section.id}`, 'edited')",
    "    setSectionEditorId('')\n    setSectionActionId('')\n    announceMutation(`section:${section.id}`, 'edited')",
    'clear section action after update',
  )

  next = replaceRequired(
    next,
    `    setSectionEditorId('')\n    invalidatePreviewBoardSection('general')`,
    `    setSectionEditorId('')\n    setSectionActionId('')\n    invalidatePreviewBoardSection('general')`,
    'clear section action after delete',
  )

  next = replaceRequired(
    next,
    `<BoardSections sections={sections} activeSectionId={activeSectionId} onSelect={selectSection} onAdd={() => setSectionComposerOpen(true)} />`,
    `<BoardSections sections={sections} activeSectionId={activeSectionId} onSelect={selectSection} onAdd={() => setSectionComposerOpen(true)} onManage={openSectionActions} />`,
    'board sections manage callback',
  )

  next = replaceRequired(
    next,
    `!activeSection.builtin && activeSection.ownedByMe ? <button type="button" className="preview-board-section-edit" onClick={() => setSectionEditorId(activeSection.id)}>섹션 편집</button> : null`,
    `!activeSection.builtin && activeSection.ownedByMe ? <button type="button" className="preview-board-section-edit" onClick={() => openSectionActions(activeSection.id)}>섹션 관리</button> : null`,
    'toolbar section manage entry',
  )

  next = replaceRequired(
    next,
    `<BoardSectionComposer open={sectionComposerOpen} sections={sections} onClose={() => setSectionComposerOpen(false)} onCreated={addCreatedSection} />\n      <BoardSectionEditor section={sectionEditor} sections={sections} open={Boolean(sectionEditor)} onClose={() => setSectionEditorId('')} onUpdated={handleSectionUpdated} onDeleted={handleSectionDeleted} />`,
    `<BoardSectionComposer open={sectionComposerOpen} sections={sections} onClose={() => setSectionComposerOpen(false)} onCreated={addCreatedSection} />\n      <BoardSectionActionSheet section={sectionAction} open={Boolean(sectionAction)} onClose={() => setSectionActionId('')} onEdit={openSectionEditFromAction} onDeleted={handleSectionDeleted} />\n      <BoardSectionEditor section={sectionEditor} sections={sections} open={Boolean(sectionEditor)} onClose={() => setSectionEditorId('')} onUpdated={handleSectionUpdated} onDeleted={handleSectionDeleted} />`,
    'section action and editor sheets',
  )

  return next
}

export function patchPreviewBoardSectionManagementSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/preview-board-complete.jsx')) return String(source || '')
  return patchBoardComplete(source)
}
