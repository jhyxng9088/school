import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function builtBoard() {
  return patchPreviewBoardSource(read('src/preview-board.jsx'), '/workspace/src/preview-board.jsx')
}

test('visited board sections paint from cache before quiet revalidation', () => {
  const source = builtBoard()
  assert.match(source, /peekPreviewBoardCache\(activeSectionId\)/)
  assert.match(source, /if \(!cached\.isFresh\) refresh\(\{ quiet: true, signal: controller\.signal \}\)/)
  assert.match(source, /if \(peekPreviewBoardCache\(activeSectionId\)\?\.isFresh\) return/)
  assert.match(source, /const cached = peekPreviewBoardCache\(sectionId\)/)
  assert.match(source, /setPosts\(cached\.posts\)/)
  assert.match(source, /setLoading\(false\)/)
  assert.doesNotMatch(source, /setLoading\(true\)\n\s*setPosts\(\[\]\)\n\s*setActiveSectionId\(sectionId\)/)
})

test('manual refresh remains authoritative while quiet refresh stays read-efficient', () => {
  const source = builtBoard()
  assert.match(source, /forceSections = null/)
  assert.match(source, /const shouldForceSections = forceSections == null \? !quiet : Boolean\(forceSections\)/)
  assert.match(source, /forceSections: shouldForceSections/)
  const client = read('src/preview-board-client.js')
  assert.match(client, /BOARD_CACHE_FRESH_MS = 45_000/)
  assert.match(client, /url\.searchParams\.set\('sections', '0'\)/)
  assert.match(client, /Date\.now\(\) - sectionsCachedAt > 5 \* 60_000/)
})

test('section changes use S-Hub directional entrance motion without stale-post flash', () => {
  const source = builtBoard()
  const css = read('src/preview-board-finish.css')
  assert.match(source, /const \[sectionDirection, setSectionDirection\] = useState\(1\)/)
  assert.match(source, /setSectionDirection\(nextIndex >= currentIndex \? 1 : -1\)/)
  assert.match(source, /key=\{activeSectionId\}/)
  assert.match(source, /'--board-section-enter-x': \(sectionDirection \* 9\) \+ 'px'/)
  assert.match(css, /animation: preview-board-section-view-in 560ms cubic-bezier\(\.16, 1, \.3, 1\) both/)
})

test('board composer uploads bounded private attachments and cleans partial failures', () => {
  const source = builtBoard()
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

test('board detail opens originals lazily instead of signing every attachment on section load', () => {
  const source = builtBoard()
  const gallery = read('src/preview-board-attachments.jsx')
  const client = read('src/preview-board-client.js')
  assert.match(source, /<BoardAttachmentGallery post=\{post\} \/>/)
  assert.match(gallery, /getPreviewBoardAttachmentUrl\(post\.id, attachment\.id\)/)
  assert.match(gallery, /window\.open\('', '_blank'\)/)
  assert.match(gallery, /원본 보기/)
  assert.match(client, /payload: \{ action: 'attachment-url', postId, attachmentId: id \}/)
  assert.match(client, /attachmentUrlCache/)
  assert.doesNotMatch(client, /attachment-urls/)
  assert.doesNotMatch(gallery, /useEffect\([\s\S]*getPreviewBoardAttachment/)
})

test('refresh width override fixes the legacy 34px text squeeze', () => {
  const base = read('src/preview-board.css')
  const finish = read('src/preview-board-finish.css')
  assert.match(base, /\.preview-board-refresh[\s\S]*width: 34px/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*width: auto !important/)
  assert.match(finish, /min-width: 64px !important/)
  assert.match(finish, /white-space: nowrap/)
})
