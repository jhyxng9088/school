from pathlib import Path

path = Path('src/reminder-summary.jsx')
text = path.read_text()
late = """  useEffect(() => {
    if (!todo?.id || !canShowOriginal || !originalEntries[0]) return undefined
    preloadTimerRef.current = window.setTimeout(() => {
      preloadTimerRef.current = null
      void prepareOriginal(originalEntries[0]).catch(() => {
        // Silent preload only. A visible error is shown if the user actually opens it.
      })
    }, 120)
    return () => {
      if (preloadTimerRef.current) window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [todo?.id])

"""
if text.count(late) != 1:
    raise SystemExit(f'expected one late prefetch effect, found {text.count(late)}')
text = text.replace(late, '', 1)
marker = """  }, [todo?.id])

  if (!todo?.summary) return null
"""
early = """  }, [todo?.id])

  useEffect(() => {
    if (!todo?.id || !canShowOriginal || !originalEntries[0]) return undefined
    preloadTimerRef.current = window.setTimeout(() => {
      preloadTimerRef.current = null
      void prepareOriginal(originalEntries[0]).catch(() => {
        // Silent preload only. A visible error is shown if the user actually opens it.
      })
    }, 120)
    return () => {
      if (preloadTimerRef.current) window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [todo?.id])

  if (!todo?.summary) return null
"""
if text.count(marker) != 1:
    raise SystemExit(f'conditional return marker mismatch: {text.count(marker)}')
path.write_text(text.replace(marker, early, 1))
