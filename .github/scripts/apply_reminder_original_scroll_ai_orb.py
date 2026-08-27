from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one exact match, found {count}')
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, replacement, flags=re.S):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: expected one regex match, found {count}: {pattern[:100]}')
    write(path, next_text)


# 1) Fast authenticated binary route for existing Firestore-stored reminder originals.
write('push-backend-v2/lib/reminder-original-service.js', r'''const ORIGINAL_MAX_BYTES = 8_000_000
const ORIGINAL_MAX_CHUNKS = 24

export function safeReminderOriginalId(value) {
  const id = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 130)
  if (!id) throw Object.assign(new Error('Invalid original attachment id'), { status: 400, code: 'invalid_original_id' })
  return id
}

function safeClassId(value) {
  const classId = String(value || '').trim()
  if (!/^class-\d{1,2}$/.test(classId)) {
    throw Object.assign(new Error('Invalid class identity'), { status: 403, code: 'invalid_class_identity' })
  }
  return classId
}

export function assembleReminderOriginal(metadata, chunks) {
  const source = metadata && typeof metadata === 'object' ? metadata : {}
  const size = Number(source.size || 0)
  const chunkCount = Number(source.chunkCount || 0)
  if (!Number.isInteger(size) || size < 1 || size > ORIGINAL_MAX_BYTES) {
    throw Object.assign(new Error('Original attachment size is invalid'), { status: 502, code: 'invalid_original_metadata' })
  }
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > ORIGINAL_MAX_CHUNKS || chunks.length !== chunkCount) {
    throw Object.assign(new Error('Original attachment chunks are incomplete'), { status: 502, code: 'original_chunks_incomplete' })
  }
  const encoded = chunks.map((value) => String(value || '')).join('')
  if (!encoded) throw Object.assign(new Error('Original attachment is empty'), { status: 502, code: 'original_empty' })
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length !== size) {
    throw Object.assign(new Error('Original attachment size does not match metadata'), { status: 502, code: 'original_size_mismatch' })
  }
  return {
    name: String(source.name || '원본 사진').slice(0, 120),
    mimeType: String(source.mimeType || 'application/octet-stream').slice(0, 120),
    size,
    buffer,
  }
}

export async function loadReminderOriginal(db, classIdValue, originalIdValue) {
  const classId = safeClassId(classIdValue)
  const originalId = safeReminderOriginalId(originalIdValue)
  const originalRef = db.collection('classes').doc(classId).collection('originalAttachments').doc(originalId)
  const metadataSnapshot = await originalRef.get()
  if (!metadataSnapshot.exists) {
    throw Object.assign(new Error('Original attachment was not found'), { status: 404, code: 'original_not_found' })
  }
  const metadata = metadataSnapshot.data() || {}
  const chunkCount = Number(metadata.chunkCount || 0)
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > ORIGINAL_MAX_CHUNKS) {
    throw Object.assign(new Error('Original attachment metadata is invalid'), { status: 502, code: 'invalid_original_metadata' })
  }

  const refs = Array.from({ length: chunkCount }, (_, index) => (
    originalRef.collection('chunks').doc(String(index).padStart(3, '0'))
  ))
  const snapshots = await db.getAll(...refs)
  const chunks = snapshots.map((snapshot, index) => {
    if (!snapshot?.exists || snapshot.id !== String(index).padStart(3, '0')) {
      throw Object.assign(new Error('Original attachment chunks are incomplete'), { status: 502, code: 'original_chunks_incomplete' })
    }
    return String(snapshot.data()?.data || '')
  })
  return assembleReminderOriginal(metadata, chunks)
}
''')

write('push-backend-v2/api/reminder-original.js', r'''import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { loadReminderOriginal, safeReminderOriginalId } from '../lib/reminder-original-service.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Expose-Headers', 'X-File-Name, X-File-Size, Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const db = adminDb()
    const identity = await db.collection('users').doc(decoded.uid).get()
    if (!identity.exists) return res.status(403).json({ ok: false, error: 'identity_missing', message: '학생 정보를 확인하지 못했어.' })
    const classId = String(identity.data()?.classId || '').trim()
    const originalId = safeReminderOriginalId(req.query?.id)
    const original = await loadReminderOriginal(db, classId, originalId)

    res.setHeader('Content-Type', original.mimeType)
    res.setHeader('Content-Length', String(original.size))
    res.setHeader('X-File-Name', encodeURIComponent(original.name))
    res.setHeader('X-File-Size', String(original.size))
    return res.status(200).send(original.buffer)
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어. 앱을 다시 열어줘.' })
    const status = [400, 403, 404].includes(Number(error?.status)) ? Number(error.status) : 502
    const message = status === 404
      ? '이 리마인더의 원본 사진을 찾지 못했어.'
      : status === 400
        ? '원본 사진 요청 정보가 올바르지 않아.'
        : status === 403
          ? '학생 정보를 확인하지 못했어.'
          : '원본 사진을 불러오지 못했어.'
    console.error('reminder-original failed', { code: error?.code, status: error?.status, message: error?.message })
    return res.status(status).json({ ok: false, error: code || 'reminder_original_failed', message })
  }
}
''')

replace_once('push-backend-v2/vercel.json',
'''    "api/s-hub-ai.js": {
      "maxDuration": 60
    }
''',
'''    "api/s-hub-ai.js": {
      "maxDuration": 60
    },
    "api/reminder-original.js": {
      "maxDuration": 30
    }
''')

# 2) Prefer the one-request binary route on iPhone/mobile, preserving Firestore as a safe fallback.
replace_once('src/school-sync.js',
"const ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX = 10\n",
"const ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX = 10\nconst REMINDER_ORIGINAL_API_URL = 'https://school-reminder-backend.vercel.app/api/reminder-original'\nconst ORIGINAL_ATTACHMENT_SERVER_TIMEOUT_MS = 14_000\n")

sub_once('src/school-sync.js',
r'''export async function getReminderOriginal\(profile, todoId\) \{.*?\n\}\n\nfunction safeSharedTodo\(todo\)''',
r'''async function getReminderOriginalFromServer(safeId) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('로그인 정보를 확인하지 못했어.')
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), ORIGINAL_ATTACHMENT_SERVER_TIMEOUT_MS)
  try {
    const response = await fetch(`${REMINDER_ORIGINAL_API_URL}?id=${encodeURIComponent(safeId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      let payload = null
      try { payload = await response.json() } catch { payload = null }
      const error = new Error(String(payload?.message || '원본 사진을 불러오지 못했어.'))
      error.status = response.status
      error.code = String(payload?.error || `school-sync/original-http-${response.status}`)
      if (response.status === 404) {
        error.code = 'school-sync/original-not-found'
        error.message = '이 리마인더는 원본 저장 기능 적용 전에 만들어졌거나 원본이 없어.'
      }
      throw error
    }
    const blob = await response.blob()
    if (!blob.size || blob.size > ORIGINAL_ATTACHMENT_MAX_BYTES) throw new Error('원본 파일 정보가 올바르지 않아.')
    const rawName = String(response.headers.get('x-file-name') || '')
    let name = '원본 사진'
    if (rawName) {
      try { name = decodeURIComponent(rawName).slice(0, 120) || name } catch { name = rawName.slice(0, 120) || name }
    }
    return {
      name,
      mimeType: String(response.headers.get('content-type') || blob.type || 'application/octet-stream').split(';')[0],
      size: blob.size,
      blob,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('원본 사진 서버 응답이 늦어 기존 방식으로 다시 불러올게.')
      timeout.code = 'school-sync/original-server-timeout'
      throw timeout
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function getReminderOriginalFromFirestore(profile, safeId) {
  await ensureSignedIn()
  const metadataSnapshot = await getDoc(originalAttachmentRef(profile, safeId))
  if (!metadataSnapshot.exists()) {
    const error = new Error('이 리마인더는 원본 저장 기능 적용 전에 만들어져서 원본이 없어. 사진을 다시 올려줘.')
    error.code = 'school-sync/original-not-found'
    throw error
  }
  const metadata = metadataSnapshot.data() || {}
  const chunkCount = Number(metadata.chunkCount || 0)
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 24) throw new Error('원본 파일 정보가 올바르지 않아.')
  const chunkSnapshot = await getDocs(collection(originalAttachmentRef(profile, safeId), 'chunks'))
  const chunkDocs = [...chunkSnapshot.docs].sort((a, b) => a.id.localeCompare(b.id))
  if (chunkDocs.length !== chunkCount) throw new Error('원본 파일 일부를 불러오지 못했어.')
  return {
    name: String(metadata.name || '원본 사진').slice(0, 120),
    mimeType: String(metadata.mimeType || 'application/octet-stream'),
    size: Number(metadata.size || 0),
    dataBase64: chunkDocs.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
  }
}

export async function getReminderOriginal(profile, todoId) {
  const safeId = safeOriginalTodoId(todoId)
  if (!safeId) throw new Error('원본 파일을 찾을 수 없어.')
  const cacheKey = `${classKeyFor(profile)}:${safeId}`
  const cached = originalAttachmentMemoryCache.get(cacheKey)
  if (cached) return cached

  const request = (async () => {
    try {
      return await getReminderOriginalFromServer(safeId)
    } catch (error) {
      if (error?.code === 'school-sync/original-not-found') throw error
      console.warn('Fast reminder original route unavailable; falling back to Firestore.', error)
      return getReminderOriginalFromFirestore(profile, safeId)
    }
  })()

  originalAttachmentMemoryCache.set(cacheKey, request)
  while (originalAttachmentMemoryCache.size > ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX) {
    const oldestKey = originalAttachmentMemoryCache.keys().next().value
    if (!oldestKey) break
    originalAttachmentMemoryCache.delete(oldestKey)
  }
  try {
    return await request
  } catch (error) {
    if (originalAttachmentMemoryCache.get(cacheKey) === request) originalAttachmentMemoryCache.delete(cacheKey)
    throw error
  }
}

function safeSharedTodo(todo)''')

# 3) Summary sheet: native scrolling owns the content from the first open; drag gestures stay on the header/grabber.
replace_once('src/reminder-summary.jsx', "  const pullRef = useRef(null)\n", "")
replace_once('src/reminder-summary.jsx', "    pullRef.current = null\n", "")
sub_once('src/reminder-summary.jsx',
r'''\n  function scrollTouchStart\(event\) \{.*?\n  function prepareOriginal\(entry\) \{''',
r'''
  function prepareOriginal(entry) {''')
replace_once('src/reminder-summary.jsx',
'''      .then((original) => ({
        ...original,
        blob: base64ToBlob(original.dataBase64, original.mimeType),
      }))
''',
'''      .then((original) => ({
        ...original,
        blob: original?.blob instanceof Blob ? original.blob : base64ToBlob(original.dataBase64, original.mimeType),
      }))
''')
replace_once('src/reminder-summary.jsx', "    }, 120)\n", "    }, 0)\n")
replace_once('src/reminder-summary.jsx',
'''      <section
        ref={sheetRef}
        className={`reminder-summary-sheet ${expanded ? 'is-expanded' : 'is-collapsed'}`}
        aria-label={`${todo.title} 요약`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <div className="reminder-summary-grabber-wrap" aria-hidden="true">
          <span className="reminder-summary-grabber" />
        </div>

        <header className="reminder-summary-header">
          <div>
            <p>{originalEntries.length ? `첨부 · ${originalEntries.length}개` : '리마인더 요약'}</p>
            <h2>{todo.title}</h2>
          </div>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={() => requestClose(340)}>×</button>
        </header>

        <div
''',
'''      <section
        ref={sheetRef}
        className={`reminder-summary-sheet ${expanded ? 'is-expanded' : 'is-collapsed'}`}
        aria-label={`${todo.title} 요약`}
      >
        <div
          className="reminder-summary-drag-zone"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
        >
          <div className="reminder-summary-grabber-wrap" aria-hidden="true">
            <span className="reminder-summary-grabber" />
          </div>

          <header className="reminder-summary-header">
            <div>
              <p>{originalEntries.length ? `첨부 · ${originalEntries.length}개` : '리마인더 요약'}</p>
              <h2>{todo.title}</h2>
            </div>
            <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={() => requestClose(340)}>×</button>
          </header>
        </div>

        <div
''')
replace_once('src/reminder-summary.jsx',
'''          className="reminder-summary-scroll"
          onTouchStart={scrollTouchStart}
          onTouchMove={scrollTouchMove}
          onTouchEnd={scrollTouchEnd}
          onTouchCancel={scrollTouchEnd}
        >
''',
'''          className="reminder-summary-scroll"
        >
''')
replace_once('src/reminder-summary.jsx',
"    if (expanded && event.target.closest('.reminder-summary-scroll')) return\n",
"")

replace_once('src/reminder-summary.css',
"  grid-template-rows: auto auto minmax(0, 1fr);\n",
"  grid-template-rows: auto minmax(0, 1fr);\n")
replace_once('src/reminder-summary.css',
'''.reminder-summary-sheet.is-collapsed {
  touch-action: none;
}

''',
'''.reminder-summary-drag-zone {
  min-width: 0;
  touch-action: none;
}

''')
replace_once('src/reminder-summary.css',
'''  -webkit-overflow-scrolling: touch;
}
''',
'''  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
''')

# 4) Reusable animated S-Hub AI point-sphere. Canvas is tiny and capped at ~30fps.
write('src/s-hub-ai-orb.jsx', r'''import { useEffect, useRef } from 'react'

const POINT_COUNT = 96
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPHERE_POINTS = Array.from({ length: POINT_COUNT }, (_, index) => {
  const y = 1 - ((index + 0.5) / POINT_COUNT) * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = index * GOLDEN_ANGLE
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius }
})

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function SHubAIOrb({ size = 24, active = false, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const cssSize = clamp(Number(size) || 24, 18, 96)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(cssSize * dpr)
    canvas.height = Math.round(cssSize * dpr)
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let lastTick = performance.now()
    let lastDraw = 0
    let angle = 0
    let cachedColor = ''
    let colorCheckedAt = 0

    function profile(timeSeconds) {
      if (!active) return { radiusScale: 1, speed: 0.14, tilt: 0.28 }
      const cycle = timeSeconds % 9.6
      let radiusScale = 1
      let speed = 0.22
      if (cycle >= 1.8 && cycle < 4.0) {
        const phase = (cycle - 1.8) / 2.2
        radiusScale = 1 - 0.48 * Math.sin(Math.PI * phase)
      }
      if (cycle >= 4.0 && cycle < 6.8) {
        const phase = (cycle - 4.0) / 2.8
        speed = 0.22 + 1.08 * Math.sin(Math.PI * phase)
      } else if (cycle >= 6.8) {
        const phase = (cycle - 6.8) / 2.8
        speed = 0.22 + 0.5 * Math.pow(1 - clamp(phase, 0, 1), 2)
      }
      return {
        radiusScale,
        speed,
        tilt: 0.28 + 0.055 * Math.sin(timeSeconds * 0.72),
      }
    }

    function draw(time, force = false) {
      if (!force && time - lastDraw < 31) return
      const delta = Math.min(Math.max((time - lastTick) / 1000, 0), 0.06)
      lastTick = time
      lastDraw = time
      const state = profile(time / 1000)
      angle += state.speed * delta

      if (!cachedColor || time - colorCheckedAt > 700) {
        cachedColor = getComputedStyle(canvas).color || '#8e8e93'
        colorCheckedAt = time
      }

      const center = cssSize / 2
      const sphereRadius = cssSize * 0.39 * state.radiusScale
      const cosY = Math.cos(angle)
      const sinY = Math.sin(angle)
      const cosX = Math.cos(state.tilt)
      const sinX = Math.sin(state.tilt)
      const projected = SPHERE_POINTS.map((point) => {
        const xY = point.x * cosY + point.z * sinY
        const zY = -point.x * sinY + point.z * cosY
        const yX = point.y * cosX - zY * sinX
        const zX = point.y * sinX + zY * cosX
        const perspective = 1 / (1 - zX * 0.27)
        return {
          x: center + xY * sphereRadius * perspective,
          y: center + yX * sphereRadius * perspective,
          z: zX,
          perspective,
        }
      }).sort((a, b) => a.z - b.z)

      context.clearRect(0, 0, cssSize, cssSize)
      context.fillStyle = cachedColor
      const baseDot = Math.max(0.55, Math.min(1.08, cssSize * 0.018))
      projected.forEach((point) => {
        const depth = (point.z + 1) / 2
        context.globalAlpha = 0.24 + depth * 0.7
        context.beginPath()
        context.arc(point.x, point.y, baseDot * (0.72 + depth * 0.62) * point.perspective, 0, Math.PI * 2)
        context.fill()
      })
      context.globalAlpha = 1
    }

    function tick(time) {
      if (!document.hidden) draw(time)
      frame = window.requestAnimationFrame(tick)
    }

    if (reducedMotion.matches) draw(performance.now(), true)
    else frame = window.requestAnimationFrame(tick)

    const handleVisibility = () => {
      lastTick = performance.now()
      if (!document.hidden && reducedMotion.matches) draw(lastTick, true)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [active, size])

  return (
    <span
      className={`s-hub-ai-orb ${active ? 'is-thinking' : 'is-idle'} ${className}`.trim()}
      style={{ '--s-hub-ai-orb-size': `${size}px` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </span>
  )
}
''')

# Home trigger uses the S-Hub AI orb instead of a generic search icon.
replace_once('src/main.jsx',
"import { SchoolAISheet } from './s-hub-ai-sheet.jsx'\n",
"import { SchoolAISheet } from './s-hub-ai-sheet.jsx'\nimport { SHubAIOrb } from './s-hub-ai-orb.jsx'\n")
replace_once('src/main.jsx',
'''          <button className="home-ai-trigger" type="button" aria-label="S-Hub 검색 및 공지 분석" onClick={onOpenAI}>
            <Icon type="search" size={18} />
          </button>
''',
'''          <button className="home-ai-trigger" type="button" aria-label="S-Hub AI 열기" onClick={onOpenAI}>
            <SHubAIOrb size={23} />
          </button>
''')

# Thinking state reuses the exact same logo with a more expressive radius/speed cycle.
replace_once('src/s-hub-ai-sheet.jsx',
"import { normalizeImportItem } from './s-hub-ai-core.js'\n",
"import { normalizeImportItem } from './s-hub-ai-core.js'\nimport { SHubAIOrb } from './s-hub-ai-orb.jsx'\n")
replace_once('src/s-hub-ai-sheet.jsx',
'''      <div className="s-hub-ai-content">
        {state.mode === 'answer' ? (
''',
'''      <div className="s-hub-ai-content">
        {working ? (
          <div className="s-hub-ai-thinking-stage" role="status" aria-label="S-Hub AI가 생각 중">
            <SHubAIOrb size={64} active />
          </div>
        ) : null}

        {state.mode === 'answer' ? (
''')

# Orb/button/thinking-stage styling stays deliberately minimal.
replace_once('src/s-hub-ai.css',
'''.home-ai-trigger {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 320ms var(--motion-soft), color 320ms var(--motion-soft), transform 180ms var(--motion-ease);
}
''',
'''.home-ai-trigger {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 320ms var(--motion-soft), color 320ms var(--motion-soft), transform 180ms var(--motion-ease);
}
''')
insert_after = '''.home-ai-trigger:active {
  transform: scale(0.92);
  background: var(--surface-soft);
  color: var(--text);
}
'''
replace_once('src/s-hub-ai.css', insert_after, insert_after + r'''

.s-hub-ai-orb {
  display: block;
  width: var(--s-hub-ai-orb-size, 24px);
  height: var(--s-hub-ai-orb-size, 24px);
  color: currentColor;
  pointer-events: none;
}

.s-hub-ai-orb canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.s-hub-ai-thinking-stage {
  display: grid;
  place-items: center;
  min-height: 74px;
  margin: -2px 0 2px;
  color: var(--text);
  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;
}

@keyframes s-hub-ai-thinking-in {
  from { opacity: 0; transform: translate3d(0, 5px, 0) scale(0.97); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
''')

# 5) Make quota/rate-limit fallback intent explicit and regression-tested.
replace_once('push-backend-v2/lib/s-hub-ai-service.js',
'''function responseText(payload) {
''',
'''function shouldTryNextModel(error) {
  const status = Number(error?.status || 0)
  if ([401, 403].includes(status)) return false
  if (status === 400 && !String(error?.code || '').toUpperCase().includes('INVALID_ARGUMENT')) return false
  return true
}

function responseText(payload) {
''')
replace_once('push-backend-v2/lib/s-hub-ai-service.js',
'''      const status = Number(error?.status || 0)
      if ([401, 403].includes(status)) break
      if (status === 400 && !String(error?.code || '').toUpperCase().includes('INVALID_ARGUMENT')) break
''',
'''      if (!shouldTryNextModel(error)) break
''')

# 6) Cache/version + tests.
replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v146'", "const CACHE_NAME = 'school-shell-v147'")
for test_path in ['tests/s-hub-ai-auth.test.js', 'tests/s-hub-ai-server-route.test.js']:
    text = read(test_path)
    text = text.replace('school-shell-v146', 'school-shell-v147')
    write(test_path, text)

write('push-backend-v2/test/reminder-original-service.test.js', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleReminderOriginal, safeReminderOriginalId } from '../lib/reminder-original-service.js'

test('reminder original service assembles Firestore base64 chunks into exact binary bytes', () => {
  const source = Buffer.from('S-Hub original image bytes')
  const encoded = source.toString('base64')
  const result = assembleReminderOriginal({
    name: 'photo.png', mimeType: 'image/png', size: source.length, chunkCount: 2,
  }, [encoded.slice(0, 12), encoded.slice(12)])
  assert.equal(result.name, 'photo.png')
  assert.equal(result.mimeType, 'image/png')
  assert.deepEqual(result.buffer, source)
})

test('reminder original service rejects incomplete chunks and sanitizes ids', () => {
  assert.equal(safeReminderOriginalId('abc--a0'), 'abc--a0')
  assert.throws(() => assembleReminderOriginal({ size: 4, chunkCount: 2 }, ['AAAA']), /incomplete/i)
})
''')

# Append quota fallback test to existing backend AI service tests.
path = 'push-backend-v2/test/s-hub-ai-service.test.js'
text = read(path)
if "quota exhaustion falls back to another model" not in text:
    text += r'''

test('quota exhaustion falls back to another model', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return response(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exhausted' } })
    return response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'fallback-ok' }) }] } }] })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'hello', responseSchema: schema,
      timeoutMs: 8000, models: ['quota-model', 'fallback-model'],
    })
    assert.equal(result.value.answer, 'fallback-ok')
    assert.equal(result.modelName, 'fallback-model')
    assert.match(result.attempts[0], /RESOURCE_EXHAUSTED/)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
'''
    write(path, text)

write('tests/reminder-original-scroll-ai-orb.test.js', r'''import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reminder originals prefer one authenticated binary server request with Firestore fallback', () => {
  const sync = read('src/school-sync.js')
  const summary = read('src/reminder-summary.jsx')
  assert.match(sync, /api\/reminder-original/)
  assert.match(sync, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(sync, /await response\.blob\(\)/)
  assert.match(sync, /getReminderOriginalFromFirestore/)
  assert.match(summary, /original\?\.blob instanceof Blob/)
})

test('summary content owns native vertical scrolling from the first expanded open', () => {
  const sheet = read('src/reminder-summary.jsx')
  const css = read('src/reminder-summary.css')
  assert.match(sheet, /className="reminder-summary-drag-zone"[\s\S]*?onPointerDown=\{pointerDown\}/)
  assert.doesNotMatch(sheet, /className=\{`reminder-summary-sheet[\s\S]{0,220}onPointerDown=\{pointerDown\}/)
  assert.doesNotMatch(sheet, /onTouchMove=\{scrollTouchMove\}/)
  assert.match(css, /\.reminder-summary-scroll\s*\{[\s\S]*?touch-action:\s*pan-y;/)
  assert.match(css, /\.reminder-summary-drag-zone\s*\{[\s\S]*?touch-action:\s*none;/)
})

test('home and running S-Hub AI share one animated point-sphere identity', () => {
  const main = read('src/main.jsx')
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const orb = read('src/s-hub-ai-orb.jsx')
  assert.match(main, /<SHubAIOrb size=\{23\}/)
  assert.doesNotMatch(main, /home-ai-trigger[\s\S]{0,180}<Icon type="search"/)
  assert.match(sheet, /s-hub-ai-thinking-stage[\s\S]*?<SHubAIOrb size=\{64\} active/)
  assert.match(orb, /POINT_COUNT = 96/)
  assert.match(orb, /requestAnimationFrame/)
  assert.match(orb, /radiusScale = 1 - 0\.48/)
})
''')

# Guard final expected shape before CI takes over.
checks = {
  'src/school-sync.js': ['api/reminder-original', 'await response.blob()', 'getReminderOriginalFromFirestore'],
  'src/reminder-summary.jsx': ['reminder-summary-drag-zone', 'original?.blob instanceof Blob'],
  'src/s-hub-ai-orb.jsx': ['POINT_COUNT = 96', 'requestAnimationFrame', 'radiusScale'],
  'src/main.jsx': ['<SHubAIOrb size={23} />'],
  'src/s-hub-ai-sheet.jsx': ['<SHubAIOrb size={64} active />'],
  'push-backend-v2/api/reminder-original.js': ['loadReminderOriginal', 'X-File-Name'],
  'push-backend-v2/lib/s-hub-ai-service.js': ['shouldTryNextModel'],
  'public/sw.js': ["school-shell-v147"],
}
for path, needles in checks.items():
    content = read(path)
    for needle in needles:
        if needle not in content:
            raise RuntimeError(f'{path}: missing expected marker {needle!r}')

print('Reminder original, summary scroll and S-Hub AI orb patch applied successfully')
