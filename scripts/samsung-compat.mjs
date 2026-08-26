import fs from 'node:fs'

function once(text, before, after, label) {
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`)
  return text.replace(before, after)
}

let reminder = fs.readFileSync('public/reminder-sheet.js', 'utf8')
reminder = once(reminder,
`  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  let active = null`,
`  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)
  let active = null`, 'reminder samsung detect')
reminder = once(reminder,
`    function onBackdropClick() {
      close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close(actions.cancel)
    }

    dragSurface.addEventListener('pointerdown', onPointerDown)
    dragSurface.addEventListener('pointermove', onPointerMove)
    dragSurface.addEventListener('pointerup', onPointerEnd)
    dragSurface.addEventListener('pointercancel', onPointerCancel)`,
`    function onBackdropClick() {
      if (SAMSUNG_INTERNET) passthrough(actions.cancel)
      else close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (SAMSUNG_INTERNET) passthrough(actions.cancel)
      else close(actions.cancel)
    }

    if (!SAMSUNG_INTERNET) {
      dragSurface.addEventListener('pointerdown', onPointerDown)
      dragSurface.addEventListener('pointermove', onPointerMove)
      dragSurface.addEventListener('pointerup', onPointerEnd)
      dragSurface.addEventListener('pointercancel', onPointerCancel)
    }`, 'reminder samsung pointer fallback')
reminder = once(reminder,
`  document.addEventListener('click', (event) => {
    const button = event.target.closest('button')`,
`  document.addEventListener('click', (event) => {
    if (SAMSUNG_INTERNET) return
    const button = event.target.closest('button')`, 'reminder samsung native clicks')
fs.writeFileSync('public/reminder-sheet.js', reminder)

let sheet = fs.readFileSync('public/school-sheet.js', 'utf8')
sheet = once(sheet,
`  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const androidBrowser = /Android|SamsungBrowser/i.test(navigator.userAgent)`,
`  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const samsungInternet = /SamsungBrowser/i.test(navigator.userAgent)
  const androidBrowser = /Android|SamsungBrowser/i.test(navigator.userAgent)`, 'school sheet samsung detect')
sheet = once(sheet,
`    function onBackdropClick() {
      requestClose(closeButton, 340)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') requestClose(closeButton, 340)
    }`,
`    function onBackdropClick() {
      if (samsungInternet) finishNativeAction(closeButton)
      else requestClose(closeButton, 340)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (samsungInternet) finishNativeAction(closeButton)
      else requestClose(closeButton, 340)
    }`, 'school sheet samsung close fallback')
sheet = once(sheet,
`    dragSurface.addEventListener('pointerdown', onPointerDown)
    dragSurface.addEventListener('pointermove', onPointerMove)
    dragSurface.addEventListener('pointerup', onPointerEnd)
    dragSurface.addEventListener('pointercancel', onPointerEnd)`,
`    if (!samsungInternet) {
      dragSurface.addEventListener('pointerdown', onPointerDown)
      dragSurface.addEventListener('pointermove', onPointerMove)
      dragSurface.addEventListener('pointerup', onPointerEnd)
      dragSurface.addEventListener('pointercancel', onPointerEnd)
    }`, 'school sheet samsung pointer fallback')
sheet = once(sheet,
`  document.addEventListener('click', (event) => {
    const target = event.target.closest('button')`,
`  document.addEventListener('click', (event) => {
    if (samsungInternet) return
    const target = event.target.closest('button')`, 'school sheet samsung native clicks')
fs.writeFileSync('public/school-sheet.js', sheet)

let timetableMotion = fs.readFileSync('public/school-timetable-motion.js', 'utf8')
timetableMotion = once(timetableMotion,
`(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')`,
`(() => {
  if (/SamsungBrowser/i.test(navigator.userAgent)) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')`, 'disable timetable observer animation on samsung')
fs.writeFileSync('public/school-timetable-motion.js', timetableMotion)

let homeLive = fs.readFileSync('public/school-home-live.js', 'utf8')
homeLive = once(homeLive,
`  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  let trackedStack = null`,
`  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)
  let trackedStack = null`, 'home live samsung detect')
homeLive = once(homeLive,
`  function animateReorder(stack, before) {
    if (REDUCED_MOTION.matches) return`,
`  function animateReorder(stack, before) {
    if (REDUCED_MOTION.matches || SAMSUNG_INTERNET) return`, 'skip home WAAPI on samsung')
fs.writeFileSync('public/school-home-live.js', homeLive)

let todo = fs.readFileSync('src/todo-stage5-ai.jsx', 'utf8')
todo = once(todo,
`const FILTERS = [{ id: 'all', label: '전체' }, ...TODO_TYPES]
`,
`const FILTERS = [{ id: 'all', label: '전체' }, ...TODO_TYPES]
const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)
`, 'todo samsung detect')
todo = once(todo,
`    if (!reducedMotion) {
      nodes.forEach((node, index) => {`,
`    if (!reducedMotion && !SAMSUNG_INTERNET) {
      nodes.forEach((node, index) => {`, 'skip reminder FLIP on samsung')
fs.writeFileSync('src/todo-stage5-ai.jsx', todo)

let sw = fs.readFileSync('public/sw.js', 'utf8')
if (!sw.includes('school-shell-v92')) throw new Error('unexpected SW version')
sw = sw.replace('school-shell-v92', 'school-shell-v93')
fs.writeFileSync('public/sw.js', sw)

for (const [path, token] of [
  ['public/reminder-sheet.js', 'if (SAMSUNG_INTERNET) return'],
  ['public/school-sheet.js', 'if (samsungInternet) return'],
  ['public/school-timetable-motion.js', 'SamsungBrowser'],
  ['public/school-home-live.js', 'REDUCED_MOTION.matches || SAMSUNG_INTERNET'],
  ['src/todo-stage5-ai.jsx', '!reducedMotion && !SAMSUNG_INTERNET'],
]) {
  if (!fs.readFileSync(path, 'utf8').includes(token)) throw new Error(`guard missing in ${path}`)
}
