import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}

const iconBody = (mode) => {
  const dark = mode === 'dark'
  const bg1 = dark ? '#34373b' : '#fbfcfd'
  const bg2 = dark ? '#2d3034' : '#edf0f4'
  const fg = dark ? '#ffffff' : '#111214'
  const stroke = dark ? '#50545a' : '#ffffff'
  const shadow = dark ? '#000000' : '#78808a'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="64" y1="44" x2="442" y2="470" gradientUnits="userSpaceOnUse">
      <stop stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="${shadow}" flood-opacity="${dark ? '0.30' : '0.20'}"/>
    </filter>
  </defs>
  <rect x="18" y="18" width="476" height="476" rx="104" fill="url(#bg)" stroke="${stroke}" stroke-width="3" filter="url(#shadow)"/>
  <path d="M150 332V166c0-20 16-36 36-36h126" fill="none" stroke="${fg}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M150 332h204c12 0 22-10 22-22V194" fill="none" stroke="${fg}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M151 332v20c0 18 15 33 33 33h180" fill="none" stroke="${fg}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M207 218l53 59 126-139" fill="none" stroke="${fg}" stroke-width="43" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
}

const lightSvg = iconBody('light')
const darkSvg = iconBody('dark')
fs.writeFileSync('public/icon-light.svg', lightSvg)
fs.writeFileSync('public/icon-dark.svg', darkSvg)

const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <style>
    .light { display: block; }
    .dark { display: none; }
    @media (prefers-color-scheme: dark) {
      .light { display: none; }
      .dark { display: block; }
    }
  </style>
  <image class="light" href="icon-light.svg" width="512" height="512"/>
  <image class="dark" href="icon-dark.svg" width="512" height="512"/>
</svg>`
fs.writeFileSync('public/icon.svg', adaptiveSvg)

{
  const path = 'src/main.jsx'
  let text = fs.readFileSync(path, 'utf8')

  const marker = `function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides, activity, profile }) {`
  const helper = `function animateTimetableExit(target, commit, { wholeSection = false } = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!target || !target.isConnected || reduceMotion || typeof target.animate !== 'function') {
    commit()
    return
  }

  const rect = target.getBoundingClientRect()
  const computed = getComputedStyle(target)
  const duration = wholeSection ? 660 : 560
  target.style.pointerEvents = 'none'
  target.style.overflow = 'hidden'
  target.style.minHeight = '0px'

  const from = {
    height: \`${'${rect.height}'}px\`,
    opacity: Number.parseFloat(computed.opacity) || 1,
    transform: 'translate3d(0, 0, 0)',
    marginTop: computed.marginTop,
    marginBottom: computed.marginBottom,
    paddingTop: computed.paddingTop,
    paddingBottom: computed.paddingBottom,
  }
  const to = {
    height: '0px',
    opacity: 0,
    transform: 'translate3d(0, -4px, 0)',
    marginTop: '0px',
    marginBottom: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
  }

  let committed = false
  const finish = () => {
    if (committed) return
    committed = true
    commit()
  }

  const animation = target.animate([from, to], {
    duration,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'forwards',
  })
  animation.addEventListener('finish', finish, { once: true })
  animation.addEventListener('cancel', finish, { once: true })
  window.setTimeout(finish, duration + 140)
}

${marker}`
  text = replaceOnce(text, marker, helper, 'timetable exit helper')

  const oldFns = `  function removeChange(targetDate, period) {
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]
    onSaveOverrides(next)
  }

  function clearAllChanges() {
    if (!Object.keys(overrides || {}).length) return
    onSaveOverrides({})
  }
`
  const newFns = `  function removeChange(targetDate, period, button) {
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]

    const item = button?.closest('.change-item') || null
    const section = button?.closest('.week-changes') || null
    const removeWholeSection = Boolean(section && section.querySelectorAll('.change-item').length === 1)
    animateTimetableExit(removeWholeSection ? section : item, () => onSaveOverrides(next), {
      wholeSection: removeWholeSection,
    })
  }

  function clearAllChanges(button) {
    if (!Object.keys(overrides || {}).length) return
    const section = button?.closest('.week-changes') || null
    animateTimetableExit(section, () => onSaveOverrides({}), { wholeSection: true })
  }
`
  text = replaceOnce(text, oldFns, newFns, 'animated timetable removal handlers')
  text = replaceOnce(
    text,
    `<button className="clear-changes" onClick={clearAllChanges}>변경 모두 지우기</button>`,
    `<button className="clear-changes" onClick={(event) => clearAllChanges(event.currentTarget)}>변경 모두 지우기</button>`,
    'clear all click target',
  )
  text = replaceOnce(
    text,
    `<button className="remove-change" onClick={() => removeChange(change.date, change.number)}>되돌리기</button>`,
    `<button className="remove-change" onClick={(event) => removeChange(change.date, change.number, event.currentTarget)}>되돌리기</button>`,
    'revert click target',
  )
  fs.writeFileSync(path, text)
}

{
  const path = 'index.html'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `    <link rel="icon" href="./icon.svg" type="image/svg+xml" />`,
    `    <link rel="icon" href="./icon.svg" type="image/svg+xml" />
    <link id="apple-touch-icon" rel="apple-touch-icon" href="./icon-light.svg" />
    <script>
      (() => {
        const icon = document.getElementById('apple-touch-icon')
        const theme = window.matchMedia('(prefers-color-scheme: dark)')
        const syncIcon = () => icon?.setAttribute('href', theme.matches ? './icon-dark.svg' : './icon-light.svg')
        syncIcon()
        theme.addEventListener?.('change', syncIcon)
      })()
    </script>`,
    'adaptive apple touch icon',
  )
  fs.writeFileSync(path, text)
}

fs.writeFileSync('public/manifest.webmanifest', JSON.stringify({
  name: 'School',
  short_name: 'School',
  description: '우리 반 학교생활을 한곳에서 확인하는 PWA',
  lang: 'ko-KR',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f5f5f7',
  theme_color: '#f5f5f7',
  icons: [
    { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
  ],
}, null, 2) + '\n')

{
  const path = 'public/sw.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "const CACHE_NAME = 'school-shell-v84'", "const CACHE_NAME = 'school-shell-v85'", 'service worker version')
  text = replaceOnce(text, "'./manifest.webmanifest', './icon.svg',", "'./manifest.webmanifest', './icon.svg', './icon-light.svg', './icon-dark.svg',", 'cache adaptive icons')
  fs.writeFileSync(path, text)
}
