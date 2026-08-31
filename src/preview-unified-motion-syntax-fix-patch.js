export function patchPreviewUnifiedMotionSyntaxFixSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  const replacement = `function AppShell({ profile }) {`
  const candidates = [
    `function AppShell({ profile }) {function AppShell({ profile }) {`,
    `function AppShell({ profile }) {\nfunction AppShell({ profile }) {`,
  ]

  for (const duplicate of candidates) {
    if (source.includes(duplicate)) return source.replace(duplicate, replacement)
  }

  throw new Error('Preview unified motion AppShell marker missing')
}
