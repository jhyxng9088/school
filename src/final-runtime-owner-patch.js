const POLITE_IMPORT = "import { installPoliteCopyRuntime } from './polite-copy-runtime.js'\n"
const POLITE_INSTALL = 'installPoliteCopyRuntime()\n\n'

export function patchFinalRuntimeOwnerSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/src/main.jsx')) return String(source || '')

  let next = String(source || '')
  next = next.split(POLITE_IMPORT).join('')
  next = next.split(POLITE_INSTALL).join('')
  return next
}
