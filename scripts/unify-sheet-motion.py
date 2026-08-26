from pathlib import Path


def replace_once(text, old, new, label):
    assert old in text, f'{label} guard failed'
    return text.replace(old, new, 1)


# Timetable: replace spring physics with deterministic 560ms open / 320ms close timing.
path = Path('public/school-sheet.js')
text = path.read_text()
text = replace_once(
    text,
    "  const androidBrowser = /Android|SamsungBrowser/i.test(navigator.userAgent)\n  let activeController = null\n",
    "  const androidBrowser = /Android|SamsungBrowser/i.test(navigator.userAgent)\n  const OPEN_MS = 560\n  const CLOSE_MS = 320\n  let activeController = null\n",
    'sheet timing constants',
)
start = text.index('    function springTo(target, options = {}) {')
end = text.index('\n\n    function requestClose', start)
replacement = r'''    function cubicCoordinate(t, p1, p2) {
      const inverse = 1 - t
      return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t
    }

    function cubicSlope(t, p1, p2) {
      const inverse = 1 - t
      return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2)
    }

    function cubicBezier(x1, y1, x2, y2) {
      return (progress) => {
        if (progress <= 0 || progress >= 1) return progress
        let t = progress
        for (let index = 0; index < 6; index += 1) {
          const slope = cubicSlope(t, x1, x2)
          if (Math.abs(slope) < 0.0001) break
          t -= (cubicCoordinate(t, x1, x2) - progress) / slope
          t = Math.min(Math.max(t, 0), 1)
        }
        return cubicCoordinate(t, y1, y2)
      }
    }

    const OPEN_EASE = cubicBezier(0.16, 1, 0.3, 1)
    const CLOSE_EASE = cubicBezier(0.4, 0, 1, 1)

    function tweenTo(target, options = {}) {
      stopAnimation()
      const onComplete = options.onComplete
      const duration = Math.max(1, Number(options.duration || OPEN_MS))
      const easing = options.easing || OPEN_EASE
      const startY = state.y
      let startTime = null
      state.velocity = 0

      if (reducedMotion.matches) {
        state.y = target
        paint()
        onComplete?.()
        return
      }

      function step(time) {
        if (startTime === null) startTime = time
        const progress = Math.min(Math.max((time - startTime) / duration, 0), 1)
        const eased = easing(progress)
        state.y = startY + (target - startY) * eased
        paint()

        if (progress >= 1) {
          state.y = target
          state.frame = null
          state.lastFrame = 0
          paint()
          onComplete?.()
          return
        }
        state.frame = requestAnimationFrame(step)
      }

      state.frame = requestAnimationFrame(step)
    }'''
text = text[:start] + replacement + text[end:]
text = replace_once(
    text,
    """      springTo(closedY(), {
        velocity: Math.max(velocity, 340),
        onComplete: () => finishNativeAction(button),
      })
""",
    """      tweenTo(closedY(), {
        duration: CLOSE_MS,
        easing: CLOSE_EASE,
        onComplete: () => finishNativeAction(button),
      })
""",
    'timetable close tween',
)
text = replace_once(
    text,
    """    function settleOpen(velocity = state.velocity) {
      state.closing = false
      springTo(0, { velocity: Math.min(velocity, 520) })
    }
""",
    """    function settleOpen() {
      state.closing = false
      const ratio = Math.min(Math.max(state.y / Math.max(closedY(), 1), 0), 1)
      const duration = ratio > 0.72 ? OPEN_MS : Math.max(180, Math.round(OPEN_MS * ratio))
      tweenTo(0, { duration, easing: OPEN_EASE })
    }
""",
    'timetable open tween',
)
text = replace_once(
    text,
    """    function onBackdropClick() {
      if (samsungInternet) finishNativeAction(closeButton)
      else requestClose(closeButton, 340)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (samsungInternet) finishNativeAction(closeButton)
      else requestClose(closeButton, 340)
    }
""",
    """    function onBackdropClick() {
      requestClose(closeButton, 340)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      requestClose(closeButton, 340)
    }
""",
    'timetable samsung close animation',
)
text = replace_once(
    text,
    """  document.addEventListener('click', (event) => {
    if (samsungInternet) return
    const target = event.target.closest('button')
""",
    """  document.addEventListener('click', (event) => {
    const target = event.target.closest('button')
""",
    'timetable samsung action interception',
)
path.write_text(text)


# Reminder: Samsung uses the same 320ms close path rather than an immediate passthrough.
path = Path('public/reminder-sheet.js')
text = path.read_text()
text = replace_once(
    text,
    """    function onBackdropClick() {
      if (SAMSUNG_INTERNET) passthrough(actions.cancel)
      else close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (SAMSUNG_INTERNET) passthrough(actions.cancel)
      else close(actions.cancel)
    }
""",
    """    function onBackdropClick() {
      close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      close(actions.cancel)
    }
""",
    'reminder samsung close animation',
)
text = replace_once(
    text,
    """  document.addEventListener('click', (event) => {
    if (SAMSUNG_INTERNET) return
    const button = event.target.closest('button')
""",
    """  document.addEventListener('click', (event) => {
    const button = event.target.closest('button')
""",
    'reminder samsung action interception',
)
path.write_text(text)


# Backdrop exit timing follows the same 320ms close rhythm.
path = Path('public/reminder-sheet.css')
text = path.read_text()
text = replace_once(
    text,
    """.reminder-sheet-backdrop.is-closing {
  opacity: 0;
  transition-duration: 260ms;
}
""",
    """.reminder-sheet-backdrop.is-closing {
  opacity: 0;
  transition-duration: 320ms;
}
""",
    'reminder backdrop timing',
)
path.write_text(text)

print('sheet motion unified')
