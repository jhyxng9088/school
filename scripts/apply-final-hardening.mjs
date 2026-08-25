import fs from 'node:fs'

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search)
  if (first < 0) throw new Error(`${label}: source not found`)
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source is not unique`)
  return source.slice(0, first) + replacement + source.slice(first + search.length)
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`)
  return source.replace(pattern, replacement)
}

const syncPath = 'src/school-sync.js'
const aiPath = 'src/firebase-ai.js'
const rulesPath = 'firestore.rules'
const summaryCssPath = 'src/reminder-summary.css'
const swPath = 'public/sw.js'

let sync = fs.readFileSync(syncPath, 'utf8')
let ai = fs.readFileSync(aiPath, 'utf8')
let rules = fs.readFileSync(rulesPath, 'utf8')
let summaryCss = fs.readFileSync(summaryCssPath, 'utf8')
let sw = fs.readFileSync(swPath, 'utf8')

sync = replaceOnce(
  sync,
  `  getDoc,\n  getFirestore,\n  onSnapshot,\n  setDoc,`,
  `  getCountFromServer,\n  getDoc,\n  getFirestore,\n  onSnapshot,\n  query,\n  setDoc,\n  where,`,
  'aggregate count imports',
)

sync = replaceOnce(
  sync,
  `const PRESENCE_ACTIVE_MS = 90 * 1000\nconst PRESENCE_HEARTBEAT_MS = 30 * 1000\nconst PRESENCE_RECOUNT_MS = 15 * 1000`,
  `const PRESENCE_ACTIVE_MS = 150 * 1000\nconst PRESENCE_REFRESH_MS = 60 * 1000`,
  'presence timing',
)

sync = replaceOnce(
  sync,
  `function classPresenceRef(profile, uid) {\n  return doc(db, 'classes', classKeyFor(profile), 'presence', uid)\n}`,
  `function classPresenceRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'presence', studentKeyFor(profile))\n}`,
  'student presence reference',
)

sync = replaceRegexOnce(
  sync,
  /export function useClassPresence\(profile\) \{[\s\S]*?\n\}\n\nexport async function writeSharedTodo/gu,
  `export function useClassPresence(profile) {\n  const signature = profileSignature(profile)\n  const [counts, setCounts] = useState({ online: 0, total: 0 })\n\n  useEffect(() => {\n    if (!signature) return undefined\n\n    let stopped = false\n    let refreshTimer = null\n\n    const heartbeat = async () => {\n      if (stopped || document.hidden) return\n      await ensureSignedIn()\n      if (stopped) return\n      const studentKey = studentKeyFor(profile)\n      await setDoc(classPresenceRef(profile), {\n        studentKey,\n        lastSeenMs: Date.now(),\n      })\n    }\n\n    const recount = async () => {\n      if (stopped) return\n      await ensureSignedIn()\n      if (stopped) return\n      const threshold = Date.now() - PRESENCE_ACTIVE_MS\n      const [memberSnapshot, onlineSnapshot] = await Promise.all([\n        getCountFromServer(classMembersCollection(profile)),\n        getCountFromServer(query(\n          classPresenceCollection(profile),\n          where('lastSeenMs', '>=', threshold),\n        )),\n      ])\n      if (stopped) return\n      setCounts({\n        online: onlineSnapshot.data().count,\n        total: memberSnapshot.data().count,\n      })\n    }\n\n    const refreshPresence = async () => {\n      if (stopped || document.hidden) return\n      try {\n        await heartbeat()\n        await recount()\n      } catch (error) {\n        console.error('Class presence refresh failed:', error)\n      }\n    }\n\n    const handleVisibility = () => {\n      if (!document.hidden) refreshPresence()\n    }\n\n    ensureSignedIn()\n      .then(async () => {\n        if (stopped) return\n        const member = classMemberRef(profile)\n        const existing = await getDoc(member)\n        if (!existing.exists()) {\n          await setDoc(member, { joinedAt: Date.now() })\n        }\n        if (stopped) return\n\n        await refreshPresence()\n        if (stopped) return\n        refreshTimer = window.setInterval(refreshPresence, PRESENCE_REFRESH_MS)\n        document.addEventListener('visibilitychange', handleVisibility)\n        window.addEventListener('focus', refreshPresence)\n      })\n      .catch((error) => console.error('Class presence connection failed:', error))\n\n    return () => {\n      stopped = true\n      if (refreshTimer) window.clearInterval(refreshTimer)\n      document.removeEventListener('visibilitychange', handleVisibility)\n      window.removeEventListener('focus', refreshPresence)\n    }\n  }, [signature])\n\n  return counts\n}\n\nexport async function writeSharedTodo`,
  'aggregate presence hook',
)

ai = replaceOnce(
  ai,
  `async function prepareAttachment(file) {\n  if (!(file instanceof Blob)) throw reminderError('첨부 파일을 읽을 수 없어.', 'school-ai/invalid-file')\n  const originalName = String(file.name || '첨부파일').slice(0, 120)\n  const originalType = String(file.type || '').toLowerCase()`,
  `function inferredAttachmentType(file) {\n  const explicit = String(file?.type || '').toLowerCase().trim()\n  if (SUPPORTED_ATTACHMENT_TYPES.has(explicit)) return explicit\n  const name = String(file?.name || '').toLowerCase()\n  const extensionMap = [\n    ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],\n    ['.webp', 'image/webp'], ['.bmp', 'image/bmp'], ['.heic', 'image/heic'],\n    ['.heif', 'image/heif'], ['.pdf', 'application/pdf'], ['.json', 'application/json'],\n    ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.rtf', 'text/rtf'],\n    ['.html', 'text/html'], ['.htm', 'text/html'], ['.xml', 'text/xml'],\n  ]\n  return extensionMap.find(([extension]) => name.endsWith(extension))?.[1] || explicit\n}\n\nasync function prepareAttachment(file) {\n  if (!(file instanceof Blob)) throw reminderError('첨부 파일을 읽을 수 없어.', 'school-ai/invalid-file')\n  const originalName = String(file.name || '첨부파일').slice(0, 120)\n  const originalType = inferredAttachmentType(file)`,
  'attachment MIME inference',
)

rules = replaceOnce(
  rules,
  `      allow create, update: if signedIn()\n        && presenceId == request.auth.uid\n        && validPresence();`,
  `      allow create, update: if signedIn()\n        && presenceId == request.resource.data.studentKey\n        && validPresence();`,
  'student presence security rule',
)

summaryCss = replaceOnce(
  summaryCss,
  `  pointer-events: auto;\n  animation: reminder-summary-backdrop-in 280ms ease both;`,
  `  pointer-events: auto;\n  touch-action: none;\n  animation: reminder-summary-backdrop-in 280ms ease both;`,
  'summary backdrop touch lock',
)

sw = replaceOnce(sw, "const CACHE_NAME = 'school-shell-v67'", "const CACHE_NAME = 'school-shell-v68'", 'service worker cache')

fs.writeFileSync(syncPath, sync)
fs.writeFileSync(aiPath, ai)
fs.writeFileSync(rulesPath, rules)
fs.writeFileSync(summaryCssPath, summaryCss)
fs.writeFileSync(swPath, sw)

console.log('Final presence and attachment hardening applied with all guards satisfied.')
