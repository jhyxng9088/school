export function patchPreviewUnifiedMotionSyntaxFixSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  const duplicate = `function AppShell({ profile }) {\nfunction AppShell({ profile }) {`
  if (!source.includes(duplicate)) throw new Error('Preview unified motion AppShell marker missing')
  return source.replace(duplicate, `function AppShell({ profile }) {`)
}
