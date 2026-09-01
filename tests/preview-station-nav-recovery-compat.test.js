import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanupPreviewStationNavRecoverySource,
  preparePreviewStationNavRecoverySource,
} from '../src/preview-station-nav-recovery-compat.js'

const navHook = `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n`
const aiContext = `  const aiContext = useMemo(() => {\n    return {}\n  }, [])\n`

test('production data-split shape keeps the temporary station-nav anchor until refinement consumes it', () => {
  const recovered = `${navHook}${aiContext}`
  const prepared = preparePreviewStationNavRecoverySource(recovered, '/src/main.jsx')

  assert.match(prepared, /__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__/)
  assert.match(prepared, /useNavSpring\(activeIndex\)\n\n  useEffect\(\(\) => \{/)

  const earlyCleanup = cleanupPreviewStationNavRecoverySource(prepared, '/src/main.jsx')
  assert.equal(earlyCleanup, prepared)

  const refined = prepared.replace(
    navHook,
    `${navHook}  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n`,
  )
  const cleaned = cleanupPreviewStationNavRecoverySource(refined, '/src/main.jsx')
  assert.doesNotMatch(cleaned, /__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__/)
  assert.match(cleaned, /classNavCollapsing/)
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
