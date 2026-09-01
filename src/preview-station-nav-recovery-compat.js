const NAV_HOOK = `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n`
const NEXT_CONTEXT = `  const aiContext = useMemo(() => {`
const SENTINEL_EFFECT = `  useEffect(() => {\n    /* __S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__ */\n  }, [])\n\n`
const REFINEMENT_STATE = `  const [classNavCollapsing, setClassNavCollapsing] = useState(false)`

export function preparePreviewStationNavRecoverySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (!cleanId.endsWith('/main.jsx')) return current
  if (current.includes('__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__')) return current

  // Production's data-split layer intentionally removes the stale timetable
  // refresh effect that used to sit immediately after useNavSpring(). The V2
  // station layers historically anchored their class-capsule effects to that
  // neighbouring useEffect. Restore one temporary structural anchor and keep it
  // until station refinement has consumed the same shape.
  const recoveredShape = `${NAV_HOOK}${NEXT_CONTEXT}`
  if (!current.includes(recoveredShape)) return current
  return current.replace(recoveredShape, `${NAV_HOOK}${SENTINEL_EFFECT}${NEXT_CONTEXT}`)
}

export function cleanupPreviewStationNavRecoverySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (!cleanId.endsWith('/main.jsx')) return current
  if (!current.includes('__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__')) return current

  // The first cleanup call runs immediately after the base station patch. At
  // that point the refinement patch still needs this effect as its structural
  // neighbour, so do not remove it yet. Once refinement adds its state, the
  // anchor has served its purpose and must disappear before compilation.
  if (!current.includes(REFINEMENT_STATE)) return current
  return current.replace(SENTINEL_EFFECT, '')
}
