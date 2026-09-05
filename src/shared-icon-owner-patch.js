import { patchSharedSegmentSpringOwnerSource } from './shared-segment-spring-owner-patch.js'

const ICON_IMPORT = "import { SHubIcon } from './s-hub-icon.jsx'"
const ICON_IMPORT_ANCHOR = "import { SHubAIOrb } from './s-hub-ai-orb.jsx'"
const ICON_FUNCTION_START = 'function Icon({ type, size = 22 }) {'
const ICON_FUNCTION_END = '\n\nfunction InstallGuide({ onDone, standalone }) {'
const ICON_WRAPPER = `function Icon({ type, size = 22 }) {
  return <SHubIcon name={type} size={size} />
}`

function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
}

function patchIconImport(source) {
  const current = String(source || '')
  if (current.includes(ICON_IMPORT)) return current
  const count = countOccurrences(current, ICON_IMPORT_ANCHOR)
  if (count !== 1) {
    throw new Error(`Shared icon owner patch drift: expected one icon import anchor, found ${count}`)
  }
  return current.replace(ICON_IMPORT_ANCHOR, `${ICON_IMPORT_ANCHOR}\n${ICON_IMPORT}`)
}

function patchIconFunction(source) {
  const current = String(source || '')
  if (current.includes(ICON_WRAPPER)) return current

  const startCount = countOccurrences(current, ICON_FUNCTION_START)
  if (startCount !== 1) {
    throw new Error(`Shared icon owner patch drift: expected one Icon function, found ${startCount}`)
  }

  const start = current.indexOf(ICON_FUNCTION_START)
  const end = current.indexOf(ICON_FUNCTION_END, start + ICON_FUNCTION_START.length)
  if (end < 0) {
    throw new Error('Shared icon owner patch drift: InstallGuide boundary missing')
  }

  return `${current.slice(0, start)}${ICON_WRAPPER}${current.slice(end)}`
}

export function patchSharedIconOwnerSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  const next = patchSharedSegmentSpringOwnerSource(source, cleanId)
  if (!cleanId.endsWith('/src/main.jsx')) return next
  return patchIconFunction(patchIconImport(next))
}
