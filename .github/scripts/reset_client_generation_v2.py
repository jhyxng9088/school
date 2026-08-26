from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 marker, found {count}')
    return text.replace(old, new, 1)


# Bump client data generation and make pre-generation legacy installs reset once too.
p = 'src/school-sync.js'
t = read(p)
t = replace_once(
    t,
    "const CLIENT_DATA_GENERATION = '1'",
    "const CLIENT_DATA_GENERATION = '2'",
    'client data generation bump',
)
old = """export function prepareClientDataGeneration() {
  try {
    const stored = localStorage.getItem(CLIENT_DATA_GENERATION_KEY)
    if (!stored) {
      localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
      return false
    }
    if (stored === CLIENT_DATA_GENERATION) return false

    const installDone = localStorage.getItem('school.installGuideDone')
    Object.keys(localStorage)
      .filter((key) => key.startsWith('school.'))
      .forEach((key) => localStorage.removeItem(key))
    if (installDone !== null) localStorage.setItem('school.installGuideDone', installDone)
    localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
    return true
  } catch {
    return false
  }
}
"""
new = """export function prepareClientDataGeneration() {
  try {
    const stored = localStorage.getItem(CLIENT_DATA_GENERATION_KEY)
    const existingSchoolKeys = Object.keys(localStorage).filter((key) => key.startsWith('school.'))
    const hasLegacySchoolData = existingSchoolKeys.some((key) => (
      key !== CLIENT_DATA_GENERATION_KEY && key !== 'school.installGuideDone'
    ))

    if (stored === CLIENT_DATA_GENERATION) return false
    if (!stored && !hasLegacySchoolData) {
      localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
      return false
    }

    const installDone = localStorage.getItem('school.installGuideDone')
    existingSchoolKeys.forEach((key) => localStorage.removeItem(key))
    if (installDone !== null) localStorage.setItem('school.installGuideDone', installDone)
    localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
    return true
  } catch {
    return false
  }
}
"""
t = replace_once(t, old, new, 'client reset logic')
write(p, t)

# Force installed PWAs to fetch the reset generation immediately.
p = 'public/sw.js'
t = read(p)
t = replace_once(t, "const CACHE_NAME = 'school-shell-v108'", "const CACHE_NAME = 'school-shell-v109'", 'service worker generation')
write(p, t)

print('client generation v2 reset patch applied')
