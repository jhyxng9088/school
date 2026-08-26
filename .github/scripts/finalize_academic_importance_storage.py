from pathlib import Path
import subprocess


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)

p = Path('src/class-activity.js')
t = p.read_text()

t = once(
    t,
    "function validDate(value) {\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || ''))\n}\n\nfunction safeAcademicEvent(value) {",
    "function validDate(value) {\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || ''))\n}\n\nconst ACADEMIC_IMPORTANT_PREFIX = '\\u2063school-important\\u2063'\n\nfunction decodeAcademicDetail(value) {\n  const raw = String(value || '').trim().slice(0, 500)\n  const important = raw.startsWith(ACADEMIC_IMPORTANT_PREFIX)\n  return {\n    important,\n    detail: important ? raw.slice(ACADEMIC_IMPORTANT_PREFIX.length).trimStart() : raw,\n  }\n}\n\nfunction encodeAcademicDetail(value, important) {\n  const room = Math.max(0, 500 - (important ? ACADEMIC_IMPORTANT_PREFIX.length : 0))\n  const detail = String(value || '').trim().slice(0, room)\n  return important ? `${ACADEMIC_IMPORTANT_PREFIX}${detail}` : detail\n}\n\nfunction safeAcademicEvent(value) {",
    'academic importance storage helpers',
)

t = once(
    t,
    "  if (!id || !title || !validDate(startDate) || !validDate(endDate) || endDate < startDate) return null\n  return {",
    "  if (!id || !title || !validDate(startDate) || !validDate(endDate) || endDate < startDate) return null\n  const detailState = decodeAcademicDetail(value.detail)\n  return {",
    'academic detail decode',
)

t = once(
    t,
    "    detail: String(value.detail || '').trim().slice(0, 500),\n    important: Boolean(value.important),",
    "    detail: detailState.detail,\n    important: Boolean(value.important) || detailState.important,",
    'safe academic detail',
)

t = once(
    t,
    "      detail: input?.detail,\n      important: Boolean(input?.important),",
    "      detail: encodeAcademicDetail(input?.detail, Boolean(input?.important)),\n      important: Boolean(input?.important),",
    'candidate academic detail',
)

t = once(
    t,
    "    await setDoc(ref, candidate)\n    return candidate",
    "    const { important: _important, ...storedCandidate } = candidate\n    storedCandidate.detail = encodeAcademicDetail(candidate.detail, candidate.important)\n    await setDoc(ref, storedCandidate)\n    return candidate",
    'store academic event without new firestore field',
)

p.write_text(t)

# The live Firebase rules are not deployed by GitHub Pages. Do not leave an undeployed rules diff behind.
subprocess.run(['git', 'checkout', '--', 'firestore.rules'], check=True)
