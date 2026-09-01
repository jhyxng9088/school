import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function boardSource() {
  return read('src/preview-board-complete.jsx')
}

test('preview board patch delegates to the standalone completed board component', () => {
  const transformed = patchPreviewBoardSource(read('src/preview-board.jsx'), '/workspace/src/preview-board.jsx')
  assert.match(transformed, /export \{ PreviewBoard \} from '\.\/preview-board-complete\.jsx'/)
})

test('visited board sections paint from cache before quiet revalidation', () => {
  const source = boardSource()
  assert.match(source, /peekPreviewBoardCache\(activeSectionId\)/)
  assert.match(source, /if \(!cached\.isFresh\) refresh\(\{ quiet: true, signal: controller\.signal \}\)/)
  assert.match(source, /if \(peekPreviewBoardCache\(activeSectionId\)\?\.isFresh\) return/)
  assert.match(source, /const cached = peekPreviewBoardCache\(sectionId\)/)
  assert.match(source, /setPosts\(cached\.posts\)/)
  assert.match(source, /setLoading\(false\)/)
})

test('manual refresh remains authoritative while quiet refresh stays read-efficient', () => {
  const source = boardSource()
  assert.match(source, /forceSections = null/)
  assert.match(source, /const shouldForceSections = forceSections == null \? !quiet : Boolean\(forceSections\)/)
  assert.match(source, /forceSections: shouldForceSections/)
  const client = read('src/preview-board-client.js')
  assert.match(client, /BOARD_CACHE_FRESH_MS = 45_000/)
  assert.match(client, /url\.searchParams\.set\('sections', '0'\)/)
  assert.match(client, /Date\.now\(\) - sectionsCachedAt > 5 \* 60_000/)
})

test('section changes use S-Hub directional entrance motion without stale-post flash', () => {
  const source = boardSource()
  const css = read('src/preview-board-finish.css')
  assert.match(source, /const \[sectionDirection, setSectionDirection\] = useState\(1\)/)
  assert.match(source, /setSectionDirection\(nextIndex >= currentIndex \? 1 : -1\)/)
  assert.match(source, /key=\{activeSectionId\}/)
  assert.match(source, /'--board-section-enter-x': `\$\{sectionDirection \* 9\}px`/)
  assert.match(css, /animation: preview-board-section-view-in 560ms cubic-bezier\(\.16, 1, \.3, 1\) both/)
})

test('board composer uploads bounded private attachments and cleans partial failures', () => {
  const source = boardSource()
  const client = read('src/preview-board-client.js')
  assert.match(source, /<BoardAttachmentPicker/)
  assert.match(source, /newPreviewBoardAttachmentDraftId\(\)/)
  assert.match(source, /uploadPreviewBoardAttachment\(files\[index\], draftId\)/)
  assert.match(source, /createPreviewBoardPost\(\{ sectionId, title, body, attachments: uploaded \}\)/)
  assert.match(source, /discardPreviewBoardAttachments\(uploaded\.map\(\(item\) => item\.storagePath\)\)/)
  assert.match(client, /BOARD_ATTACHMENT_LIMIT = 4/)
  assert.match(client, /BOARD_ATTACHMENT_MAX_BYTES = 6 \* 1024 \* 1024/)
  assert.match(client, /action', 'upload-attachment'/)
  assert.match(client, /action: 'discard-attachments'/)
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEYS/)
})

test('board originals reuse reminder save behavior and load lazily', () => {
  const source = boardSource()
  const gallery = read('src/preview-board-attachments.jsx')
  const client = read('src/preview-board-client.js')
  assert.match(source, /<BoardAttachmentGallery post=\{post\} \/>/)
  assert.match(gallery, /loadPreviewBoardAttachmentOriginal\(post\.id, id\)/)
  assert.match(gallery, /URL\.createObjectURL\(original\.blob\)/)
  assert.match(gallery, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/)
  assert.match(gallery, /await navigator\.share\(\{ files: \[file\]/)
  assert.match(gallery, /anchor\.download = original\.name \|\| '원본-파일'/)
  assert.match(gallery, /savingRef\.current = true/)
  assert.match(gallery, /DOWNLOAD_GESTURE_LOCK_MS = 700/)
  assert.match(gallery, /원본 저장/)
  assert.match(client, /payload: \{ action: 'attachment-url', postId, attachmentId: id \}/)
  assert.match(client, /attachmentUrlCache/)
  assert.doesNotMatch(client, /attachment-urls/)
})

test('attachment editor preserves a real zero-slot limit when four originals remain', () => {
  const gallery = read('src/preview-board-attachments.jsx')
  assert.match(gallery, /maxFiles == null \? BOARD_ATTACHMENT_LIMIT : maxFiles/)
  assert.doesNotMatch(gallery, /Number\(maxFiles \|\| BOARD_ATTACHMENT_LIMIT\)/)
  assert.match(gallery, /disabled=\{disabled \|\| safeLimit <= 0 \|\| selected\.length >= safeLimit\}/)
})

test('refresh width override fixes the legacy 34px text squeeze', () => {
  const base = read('src/preview-board.css')
  const finish = read('src/preview-board-finish.css')
  assert.match(base, /\.preview-board-refresh[\s\S]*width: 34px/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*width: auto !important/)
  assert.match(finish, /min-width: 64px !important/)
  assert.match(finish, /white-space: nowrap/)
})

test('post editor and comment controls keep stable compact action geometry', () => {
  const css = read('src/preview-board-complete.css')
  assert.match(css, /\.preview-board-edit-form \.preview-board-danger-zone \{[\s\S]*padding: 0;[\s\S]*border: 0;/)
  assert.match(css, /\.preview-board-edit-form \.preview-board-danger-zone:has\(p\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.preview-board-edit-form \.preview-board-sheet-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.preview-board-comment-actions:has\(button\.is-danger\) > button:first-child \{[\s\S]*display: none;/)
  assert.match(css, /\.preview-board-comment-editor > div \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.preview-board-comment-form \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 64px;/)
})
