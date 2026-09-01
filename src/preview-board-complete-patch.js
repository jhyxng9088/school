export function patchPreviewBoardCompleteSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/preview-board.jsx')) return String(source || '')
  return `export { PreviewBoard } from './preview-board-complete.jsx'\n`
}
