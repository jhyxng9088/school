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
    `  const categoryRestoreTarget = useMemo(() => {\n    const comparable = categoryName.normalize('NFKC').trim().replace(/\\s+/g, ' ').toLocaleLowerCase('ko')\n    if (!comparable) return null\n    return reminderFilterOptions(categories, { includeHidden: true }).find((section) => (\n      Boolean(section.hidden)\n      && ['task', 'performance', 'exam', 'material'].includes(section.id)\n      && String(section.label || '').toLocaleLowerCase('ko') === comparable\n    )) || null\n  }, [categories, categoryName])\n  const active = sorted.filter((todo) => !todo.completed)`,
    'hidden built-in restore target',
  )

  next = replaceRequired(
    next,
    `    try {\n      const category = await addReminderCategory({ label, color: categoryColor })\n      setCategorySheetOpen(false)\n      setFilter(category.id)\n    } catch (error) {`,
    `    try {\n      if (categoryRestoreTarget) {\n        const result = await saveReminderSectionChange({\n          action: 'restore',\n          sectionId: categoryRestoreTarget.id,\n          label,\n          color: categoryColor,\n          categories,\n        })\n        setCategorySheetOpen(false)\n        setFilter(result?.section?.id || categoryRestoreTarget.id)\n        return\n      }\n      const category = await addReminderCategory({ label, color: categoryColor })\n      setCategorySheetOpen(false)\n      setFilter(category.id)\n    } catch (error) {`,
    'restore hidden built-in on add',
  )

  next = replaceRequired(
    next,
    `          {categorySaveError ? <p className="change-warning">{categorySaveError}</p> : null}\n          {!availableCategoryColors.length ? <p className="change-warning">사용할 수 있는 색을 모두 썼어.</p> : null}`,
    `          {categoryRestoreTarget ? (\n            <p className="reminder-category-restore-hint">숨겨진 {categoryRestoreTarget.label} 섹션을 다시 사용합니다.</p>\n          ) : null}\n          {categorySaveError ? <p className="change-warning">{categorySaveError}</p> : null}\n          {!availableCategoryColors.length ? <p className="change-warning">사용할 수 있는 색을 모두 썼어.</p> : null}`,
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
