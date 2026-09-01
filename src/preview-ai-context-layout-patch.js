const AI_CONTEXT_LAYOUT_CSS = `
/* Preview AI context layout: reference tools first, composer last. */
.s-hub-ai-page-extra {
  margin-top: 0;
  margin-bottom: 23px;
}

.s-hub-ai-page-context {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (min-width: 700px) and (min-height: 820px) {
  .s-hub-ai-page-extra {
    margin-top: 0;
    margin-bottom: 25px;
  }
}

@media (max-width: 560px) {
  .s-hub-ai-page-extra {
    margin-top: 0;
    margin-bottom: 20px;
  }

  .s-hub-ai-page-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .s-hub-ai-page-context-item:nth-child(3) {
    border-left: 0;
  }

  .s-hub-ai-page-context-item:nth-child(n + 3) {
    border-top: 1px solid var(--divider);
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI context/layout marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchAISheet(source) {
  let next = String(source || '')
  if (next.includes('Preview AI context layout: quick info before composer.')) return next

  const academicCardEnd = `                  <span className="s-hub-ai-page-context-copy"><strong>학사일정</strong><span>{context?.academic?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>`
  const withMealCard = `                  <span className="s-hub-ai-page-context-copy"><strong>학사일정</strong><span>{context?.academic?.length || 0}개 확인 가능</span></span>\n                </div>\n                <div className="s-hub-ai-page-context-item">\n                  <span className="s-hub-ai-page-context-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4.5 4.5v6.2a3 3 0 0 0 3 3h.5"/><path d="M7.5 4.5v15"/><path d="M15.5 4.5v6.2M19.5 4.5v6.2M15.5 8.2h4M17.5 10.7v8.8"/></svg></span>\n                  <span className="s-hub-ai-page-context-copy"><strong>급식</strong><span>{context?.meals?.length || 0}개 확인 가능</span></span>\n                </div>\n              </div>`
  next = replaceRequired(next, academicCardEnd, withMealCard, 'meal context card')

  const contentThenExtra = `        {content}\n\n        {!working && state.mode === 'compose' ? (\n          <div className="s-hub-ai-page-extra">`
  const contentIndex = next.indexOf(contentThenExtra)
  if (contentIndex < 0) throw new Error('Preview AI context/layout marker missing: composer before quick info')

  const extraStart = contentIndex + `        {content}\n\n`.length
  const extraClose = `        ) : null}\n`
  const extraEndStart = next.indexOf(extraClose, extraStart)
  if (extraEndStart < 0) throw new Error('Preview AI context/layout marker missing: quick info close')
  const extraEnd = extraEndStart + extraClose.length
  const extraBlock = next.slice(extraStart, extraEnd)
  next = `${next.slice(0, contentIndex)}        {/* Preview AI context layout: quick info before composer. */}\n${extraBlock}\n        {content}\n${next.slice(extraEnd)}`
  return next
}

function patchMain(source) {
  let next = String(source || '')
  if (next.includes('mealRanges: schoolData?.mealRanges || {}')) return next

  next = replaceRequired(
    next,
    `      customAcademicEvents: academicData?.events || [],\n    })`,
    `      customAcademicEvents: academicData?.events || [],\n      mealRanges: schoolData?.mealRanges || {},\n    })`,
    'AI context meal ranges',
  )

  next = replaceRequired(
    next,
    `  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, academicData?.events])`,
    `  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, schoolData?.mealRanges, academicData?.events])`,
    'AI context meal dependency',
  )
  return next
}

function patchAICore(source) {
  let next = String(source || '')
  if (next.includes('function normalizeContextMeals(')) return next

  const helper = `function normalizeContextMeals(mealRanges) {\n  const ranges = mealRanges && typeof mealRanges === 'object' ? mealRanges : {}\n  const meals = []\n  const seen = new Set()\n\n  Object.values(ranges).forEach((entry) => {\n    const values = Array.isArray(entry?.meals) ? entry.meals : []\n    values.forEach((meal) => {\n      const date = unknownDateKey(meal?.rawDate || meal?.date)\n      const mealCode = clampText(meal?.mealCode, 4)\n      const key = \`${date}|${mealCode}\`\n      if (!date || seen.has(key)) return\n      const dishes = (Array.isArray(meal?.dishes) ? meal.dishes : [])\n        .map((dish) => clampText(dish, 80))\n        .filter(Boolean)\n        .slice(0, 24)\n      if (!dishes.length) return\n      seen.add(key)\n      meals.push({\n        date,\n        mealCode,\n        mealName: clampText(meal?.mealName || '중식', 20),\n        dishes,\n        calories: clampText(meal?.calories, 40),\n      })\n    })\n  })\n\n  return meals\n    .sort((a, b) => \`${a.date}-${a.mealCode}\`.localeCompare(\`${b.date}-${b.mealCode}\`))\n    .slice(-30)\n}\n\n`

  next = replaceRequired(
    next,
    `export function buildSchoolAIContext({\n`,
    `${helper}export function buildSchoolAIContext({\n`,
    'meal normalizer insertion',
  )
  next = replaceRequired(
    next,
    `  customAcademicEvents = [],\n} = {}) {`,
    `  customAcademicEvents = [],\n  mealRanges = {},\n} = {}) {`,
    'meal range argument',
  )
  next = replaceRequired(
    next,
    `\n  return {\n    reference:`,
    `\n  const meals = normalizeContextMeals(mealRanges)\n\n  return {\n    reference:`,
    'meal context calculation',
  )
  next = replaceRequired(
    next,
    `    timetable,\n    academic,\n  }`,
    `    timetable,\n    academic,\n    meals,\n  }`,
    'meal context output',
  )
  return next
}

function patchAITransport(source) {
  const current = String(source || '')
  if (current.includes('SCHOOL_DATA already carries meals')) return current
  return replaceRequired(
    current,
    `  if (purpose === 'reminder') return prompt`,
    `  // Preview: SCHOOL_DATA already carries meals; keep the cache path only as a legacy fallback.\n  if (purpose === 'reminder' || /"meals"\\s*:/.test(prompt)) return prompt`,
    'meal prompt dedupe',
  )
}

export function patchPreviewAIContextLayoutSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) return patchAISheet(current)
  if (cleanId.endsWith('/main.jsx')) return patchMain(current)
  if (cleanId.endsWith('/s-hub-ai-core.js')) return patchAICore(current)
  if (cleanId.endsWith('/s-hub-ai-transport.js')) return patchAITransport(current)
  if (cleanId.endsWith('/s-hub-ai.css')) {
    if (current.includes('Preview AI context layout: reference tools first, composer last.')) return current
    return `${current}\n${AI_CONTEXT_LAYOUT_CSS}`
  }
  return current
}
