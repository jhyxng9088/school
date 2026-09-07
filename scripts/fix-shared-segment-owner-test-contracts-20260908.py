from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Retired build owner must disappear from the direct patch-effect inventory.
path = Path('tests/build-patch-effect.test.js')
source = path.read_text()
source = replace_once(
    source,
    "  ['patchSharedSegmentSpringOwnerSource', 'shared-segment-spring-owner-patch.js'],\n",
    '',
    'build patch effect retired segment owner',
)
path.write_text(source)

# Unread semantic ownership now lives in the upstream class segment generator.
path = Path('tests/preview-unread-hierarchy.test.js')
source = path.read_text()
source = replace_once(
    source,
    "  const owner = read('src/shared-segment-spring-owner-patch.js')\n",
    "  const owner = read('src/preview-class-top-segment-patch.js')\n",
    'unread owner source',
)
source = replace_once(
    source,
    "  assert.match(owner, /SEGMENT_BUTTON_KEY_MARKER/)\n",
    "  assert.match(owner, /return useSHubSegmentSpring\\(activeIndex, \\{/)\n",
    'unread source owner contract',
)
path.write_text(source)

# Shared-icon tests should not import or invoke a retired downstream segment owner.
path = Path('tests/shared-icon-owner.test.js')
source = path.read_text()
source = replace_once(
    source,
    "import { patchSharedSegmentSpringOwnerSource } from '../src/shared-segment-spring-owner-patch.js'\n",
    '',
    'shared icon retired segment import',
)
source = replace_once(
    source,
    "  source = patchSharedSegmentSpringOwnerSource(source, id)\n",
    '',
    'shared icon retired segment invocation',
)
old = """test('Vite calls the shared segment spring owner directly after visual polish', () => {
  const vite = read('vite.config.js')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  const shared = vite.indexOf('patchSharedSegmentSpringOwnerSource(next, cleanId)')
  assert.ok(visual >= 0)
  assert.ok(shared > visual)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-icon-owner-patch.js', import.meta.url)), false)
})"""
new = """test('Vite keeps icon ownership source-owned and retired segment/icon build owners absent', () => {
  const vite = read('vite.config.js')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  assert.ok(visual >= 0)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\\.js/)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../src/shared-icon-owner-patch.js', import.meta.url)), false)
})"""
source = replace_once(source, old, new, 'shared icon Vite owner contract')
path.write_text(source)

# The final main source legitimately contains other spring runtimes. Restrict this
# assertion to the class top-segment wrapper that is being source-owned here.
path = Path('tests/preview-class-top-segment.test.js')
source = path.read_text()
old = """  assert.match(source, /data-unread-key=\\{item\\.id\\}/)
  assert.doesNotMatch(source, /physics\\.velocity \\+= acceleration \\* dt/)
})
"""
new = """  assert.match(source, /data-unread-key=\\{item\\.id\\}/)
  const springStart = source.indexOf('function useClassTopSegmentSpring(activeIndex) {')
  const springEnd = source.indexOf('function ClassTopSegment', springStart)
  assert.ok(springStart >= 0 && springEnd > springStart)
  assert.doesNotMatch(source.slice(springStart, springEnd), /physics\\.velocity \\+= acceleration \\* dt/)
})
"""
source = replace_once(source, old, new, 'class test scoped retired physics assertion')
path.write_text(source)
