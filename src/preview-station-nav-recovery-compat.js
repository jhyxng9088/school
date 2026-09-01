const NAV_HOOK = `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n`
const NEXT_CONTEXT = `  const aiContext = useMemo(() => {`
const SENTINEL_EFFECT = `  useEffect(() => {\n    /* __S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__ */\n  }, [])\n\n`

export function preparePreviewStationNavRecoverySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (!cleanId.endsWith('/main.jsx')) return current
  if (current.includes('__S_HUB_V2_STATION_NAV_RECOVERY_COMPAT__')) return current

  // Production's data-split layer intentionally removes the stale timetable
  // refresh effect that used to sit immediately after useNavSpring(). The V2
  // station patch historically anchored its class-capsule effect to that exact
  // neighbouring useEffect. Restore a temporary structural anchor only for the
  // patch pass; cleanup removes it before Vite compiles the module.
  const recoveredShape = `${NAV_HOOK}${NEXT_CONTEXT}`
  if (!current.includes(recoveredShape)) return current
  return current.replace(recoveredShape, `${NAV_HOOK}${SENTINEL_EFFECT}${NEXT_CONTEXT}`)
}

export function cleanupPreviewStationNavRecoverySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (!cleanId.endsWith('/main.jsx')) return current
  return current.replace(SENTINEL_EFFECT, '')
}
