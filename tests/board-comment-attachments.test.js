import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('comment mutations use the existing board attachment pipeline', () => {
  const client = read('src/preview-board-client.js')

  assert.match(client, /export async function addPreviewBoardComment\(postId, body, attachments = \[\]\)/)
  assert.match(client, /action: 'comment'[\s\S]*attachments: attachments\.slice\(0, BOARD_ATTACHMENT_LIMIT\)/)
  assert.match(client, /export async function editPreviewBoardComment\([\s\S]*keepAttachmentIds = \[\],[\s\S]*attachments = \[\]/)
  assert.match(client, /action: 'edit-comment'[\s\S]*keepAttachmentIds: keepAttachmentIds\.slice\(0, BOARD_ATTACHMENT_LIMIT\)[\s\S]*attachments: attachments\.slice\(0, BOARD_ATTACHMENT_LIMIT\)/)
})

test('comment compose, display, and edit reuse the shared board attachment components', () => {
  const board = read('src/preview-board-complete.jsx')

  assert.match(board, /<BoardAttachmentPicker[\s\S]*ownerLabel="댓글"/)
  assert.match(board, /<BoardAttachmentGallery\s+post=\{post\}\s+attachments=\{itemAttachments\}\s+compact\s+ariaLabel="댓글 첨부 파일"\s*\/>/)
  assert.match(board, /discardPreviewBoardAttachments\(uploaded\.map\(\(item\) => item\.storagePath\)\)/)
  assert.match(board, /editingCommentKeptAttachmentIds/)
})

test('post and comment files render through one attachment card and one original viewer', () => {
  const attachments = read('src/preview-board-attachments.jsx')

  assert.match(attachments, /import \{ OriginalFileViewer \} from '\.\/original-file-viewer\.jsx'/)
  assert.match(attachments, /attachments: providedAttachments = null/)
  assert.match(attachments, /className=\{`preview-board-attachment-card/)
  assert.match(attachments, /loadPreviewBoardAttachmentOriginal\(post\.id, id\)/)
  assert.match(attachments, /<OriginalFileViewer[\s\S]*portal/)
  assert.doesNotMatch(attachments, /function BoardOriginalViewer/)
})
