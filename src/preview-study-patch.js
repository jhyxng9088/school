function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview study patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview study patch range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

export function patchPreviewStudySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')
  const importMarker = "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n"
  if (!next.includes("from './preview-study.jsx'")) {
    next = replaceRequired(
      next,
      importMarker,
      `${importMarker}import { PreviewStudyPage as PreviewStudyFeaturePage } from './preview-study.jsx'\n`,
      'study page import',
    )
  }

  const studyWrapper = `function PreviewStudyPage({ requireOnline }) {\n  return <PreviewStudyFeaturePage requireOnline={requireOnline} />\n}\n\n`
  next = spliceRequired(
    next,
    'function PreviewStudyPage() {\n',
    'function PreviewAIPage({ onOpenAI }) {',
    studyWrapper,
    'study placeholder replacement',
  )

  next = replaceRequired(
    next,
    '    study: <PreviewStudyPage />,\n',
    '    study: <PreviewStudyPage requireOnline={requireOnline} />,\n',
    'study content props',
  )

  return next
}
