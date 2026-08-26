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
  const path = 'src/main.jsx'
  let value = read(path)
  for (const line of [
    '  loadOverrides,\n',
    '  loadWeeklySchedule,\n',
    '  saveOverrides,\n',
    '  saveWeeklySchedule,\n',
  ]) value = replaceOnce(value, line, '', `unused timetable import ${line.trim()}`)

  value = replaceOnce(value,
`function TodoPreview() {
  return (
    <section className="home-section">
      <SectionTitle aside="0개">할 일</SectionTitle>
      <div className="compact-empty">아직 등록된 할 일이 없어.</div>
    </section>
  )
}

`, '', 'unused TodoPreview')

  value = replaceOnce(value, `  const hasOverride = schedule.some((period) => period.isOverride)\n`, '', 'unused hasOverride')

  value = replaceOnce(value,
`function EmptyPanel({ title, description }) {
  return (
    <section className="empty-panel">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

function StandardPage({ eyebrow = 'School', title, children }) {
  return (
    <>
      <header className="page-header">
        <p className="date-label">{eyebrow}</p>
        <h1>{title}</h1>
      </header>
      {children}
    </>
  )
}

`, '', 'unused generic pages')
  write(path, value)
}

{
  const path = 'public/school-sheet.js'
  let value = read(path)
  value = replaceOnce(value,
`    const { closeButton, saveButton } = findActionButtons(sheet)
    const dragSurface = sheet.querySelector('.change-editor-head') || sheet`,
`    const { closeButton } = findActionButtons(sheet)
    const dragSurface = sheet.querySelector('.change-editor-head') || sheet`,
  'unused initial saveButton binding')
  write(path, value)
}

const reactDefaultImports = new Map([
  ['src/academic-shared.jsx', [`import React, { useMemo, useState } from 'react'`, `import { useMemo, useState } from 'react'`]],
  ['src/home-meal-preview.jsx', [`import React, { useEffect, useMemo } from 'react'`, `import { useEffect, useMemo } from 'react'`]],
  ['src/meal-page.jsx', [`import React, { useEffect, useState } from 'react'`, `import { useEffect, useState } from 'react'`]],
  ['src/reminder-summary.jsx', [`import React, { useEffect, useRef, useState } from 'react'`, `import { useEffect, useRef, useState } from 'react'`]],
  ['src/stage3-core.js', [`import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'`, `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`]],
  ['src/todo-stage5-ai.jsx', [`import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'`, `import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'`]],
  ['src/todo.jsx', [`import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'`, `import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'`]],
])

for (const [path, [from, to]] of reactDefaultImports) {
  let value = read(path)
  if (/\bReact\s*\./.test(value)) throw new Error(`React namespace is actually used: ${path}`)
  value = replaceOnce(value, from, to, `unused React default import ${path}`)
  write(path, value)
}

const main = read('src/main.jsx')
for (const symbol of ['loadOverrides','loadWeeklySchedule','saveOverrides','saveWeeklySchedule','TodoPreview','EmptyPanel','StandardPage','hasOverride']) {
  if (new RegExp(`\\b${symbol}\\b`).test(main)) throw new Error(`Dead symbol still present: ${symbol}`)
}
console.log('final dead-code cleanup applied')
