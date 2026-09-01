import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanupPreviewStationNavRecoverySource,
  preparePreviewStationNavRecoverySource,
} from '../src/preview-station-nav-recovery-compat.js'

const navHook = `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n`
const aiContext = `  const aiContext = useMemo(() => {\n    return {}\n  }, [])\n`

test('production data-split shape gets a temporary station-nav anchor and no runtime residue', () => {
  const recovered = `${navHook}${aiContext}`
  const prepared = preparePreviewStationNavRecoverySource(recovered, '/src/main.jsx')

  assert.match(prepared, /__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__/)
  assert.match(prepared, /useNavSpring\(activeIndex\)\n\n  useEffect\(\(\) => \{/)

  const cleaned = cleanupPreviewStationNavRecoverySource(prepared, '/src/main.jsx')
  assert.equal(cleaned, recovered)
  assert.doesNotMatch(cleaned, /__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__/)
})

test('baseline source with its real effect is left untouched', () => {
  const baseline = `${navHook}  useEffect(() => {\n    refreshSharedTimetable()\n  }, [])\n`
  assert.equal(preparePreviewStationNavRecoverySource(baseline, '/src/main.jsx'), baseline)
})

test('non-main modules are never modified', () => {
  const source = `${navHook}${aiContext}`
  assert.equal(preparePreviewStationNavRecoverySource(source, '/src/todo.jsx'), source)
  assert.equal(cleanupPreviewStationNavRecoverySource(source, '/src/todo.jsx'), source)
})
