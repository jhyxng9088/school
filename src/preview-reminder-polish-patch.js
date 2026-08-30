function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview reminder polish marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchTodoStage5Source(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    "import './preview-section-management.css'\n",
    "import './preview-section-management.css'\nimport './preview-reminder-polish.css'\n",
    'preview reminder polish css import',
  )

  next = replaceRequired(
    next,
    `        <AnimatedText as="span" className="todo-kind" value={reminderTypeLabel(todo.type, categories)} delay={0} />\n      </span>`,
    `        <AnimatedText as="span" className="todo-kind" value={reminderTypeLabel(todo.type, categories)} delay={0} />\n        {readableSummary ? (\n          <span className="reminder-summary-badge" aria-hidden="true">\n            <span className="reminder-summary-badge-mark" />\n            <span>요약</span>\n          </span>\n        ) : null}\n      </span>`,
    'summary badge placement',
  )

  next = replaceRequired(
    next,
    `        {readableSummary ? (\n          <button\n            className="reminder-summary-handle"\n            type="button"\n            aria-label={\`${'${todo.title}'} 요약 열기\`}\n            onClick={() => onOpenSummary(todo)}\n          >\n            <span className="reminder-summary-handle-icon" aria-hidden="true">\n              <span className="reminder-summary-handle-grip" />\n              <span className="reminder-summary-handle-sheet" />\n            </span>\n          </button>\n        ) : null}\n`,
    '',
    'remove right-rail summary handle',
  )

  next = replaceRequired(
    next,
    `  const active = sorted.filter((todo) => !todo.completed)`,
    `  const hiddenBuiltinSections = useMemo(() => reminderFilterOptions(categories, { includeHidden: true }).filter((section) => (\n    Boolean(section.hidden) && ['task', 'performance', 'exam', 'material'].includes(section.id)\n  )), [categories])\n  const categoryRestoreTarget = useMemo(() => {\n    const comparable = categoryName.normalize('NFKC').trim().replace(/\\s+/g, ' ').toLocaleLowerCase('ko')\n    if (!comparable) return null\n    const canonicalLabels = { task: '일반', performance: '수행평가', exam: '시험', material: '준비물' }\n    return hiddenBuiltinSections.find((section) => [\n      String(section.label || ''),\n      String(canonicalLabels[section.id] || ''),\n    ].some((label) => label.toLocaleLowerCase('ko') === comparable)) || null\n  }, [categoryName, hiddenBuiltinSections])\n  const hasRestorableHiddenBuiltin = hiddenBuiltinSections.length > 0\n  const active = sorted.filter((todo) => !todo.completed)`,
    'hidden built-in restore target',
  )

  next = replaceRequired(
    next,
    `  useEffect(() => {\n    if (filters.some((item) => item.id === filter)) return\n    setFilter(filters[0]?.id || 'all')\n  }, [filter, filters])`,
    `  useEffect(() => {\n    if (filters.some((item) => item.id === filter)) return\n    setFilter(filters[0]?.id || 'all')\n  }, [filter, filters])\n\n  useEffect(() => {\n    if (!categoryRestoreTarget?.color) return\n    const colorUsedElsewhere = reminderFilterOptions(categories).some((section) => (\n      section.id !== categoryRestoreTarget.id && section.color === categoryRestoreTarget.color\n    ))\n    if (!colorUsedElsewhere) setCategoryColor(categoryRestoreTarget.color)\n  }, [categoryRestoreTarget?.id])`,
    'restore original color selection',
  )

  next = replaceRequired(
    next,
    `  function openCategoryCreate() {\n    if (!requireOnline('리마인더 섹션을 추가')) return\n    setCategoryName('')\n    setCategoryColor(availableCategoryColors[0]?.id || '')`,
    `  function openCategoryCreate() {\n    if (!requireOnline('리마인더 섹션을 추가')) return\n    setCategoryName('')\n    const restorableColor = hiddenBuiltinSections.find((section) => (\n      section.color && !usedCategoryColors.has(section.color)\n    ))?.color || ''\n    setCategoryColor(availableCategoryColors[0]?.id || restorableColor)`,
    'restore-capable category opener',
  )

  next = replaceRequired(
    next,
    `    try {\n      const category = await addReminderCategory({ label, color: categoryColor })\n      setCategorySheetOpen(false)\n      setFilter(category.id)\n    } catch (error) {`,
    `    try {\n      if (categoryRestoreTarget) {\n        const result = await saveReminderSectionChange({\n          action: 'restore',\n          sectionId: categoryRestoreTarget.id,\n          label,\n          color: categoryColor,\n          categories,\n        })\n        setCategorySheetOpen(false)\n        setFilter(result?.section?.id || categoryRestoreTarget.id)\n        return\n      }\n      const category = await addReminderCategory({ label, color: categoryColor })\n      setCategorySheetOpen(false)\n      setFilter(category.id)\n    } catch (error) {`,
    'restore hidden built-in on add',
  )

  next = replaceRequired(
    next,
    `              disabled={!availableCategoryColors.length}\n              onClick={openCategoryCreate}`,
    `              disabled={!availableCategoryColors.length && !hasRestorableHiddenBuiltin}\n              onClick={openCategoryCreate}`,
    'allow restore even when custom colors are exhausted',
  )

  next = replaceRequired(
    next,
    `          {categorySaveError ? <p className="change-warning">{categorySaveError}</p> : null}\n          {!availableCategoryColors.length ? <p className="change-warning">사용할 수 있는 색을 모두 썼어.</p> : null}`,
    `          {categoryRestoreTarget ? (\n            <p className="reminder-category-restore-hint">숨겨진 {categoryRestoreTarget.label} 섹션을 다시 사용합니다.</p>\n          ) : null}\n          {categorySaveError ? <p className="change-warning">{categorySaveError}</p> : null}\n          {!availableCategoryColors.length && !categoryRestoreTarget ? <p className="change-warning">사용할 수 있는 색을 모두 썼어.</p> : null}`,
    'restore hint',
  )

  next = replaceRequired(
    next,
    `{categorySaving ? '추가 중…' : '추가'}`,
    `{categorySaving ? (categoryRestoreTarget ? '복원 중…' : '추가 중…') : (categoryRestoreTarget ? '복원' : '추가')}`,
    'restore submit label',
  )

  return next
}

export function patchPreviewReminderPolishSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/todo-stage5-ai.jsx')) return patchTodoStage5Source(source)
  return String(source || '')
}
