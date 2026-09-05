import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const PHONE_PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)

function isLunchWindow(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 12 * 60 + 50 && minutes < 14 * 60
}

function nextPriorityBoundary(now = new Date()) {
  const lunchStart = new Date(now)
  lunchStart.setHours(12, 50, 0, 0)
  const lunchEnd = new Date(now)
  lunchEnd.setHours(14, 0, 0, 0)

  if (now < lunchStart) return lunchStart
  if (now < lunchEnd) return lunchEnd

  lunchStart.setDate(lunchStart.getDate() + 1)
  return lunchStart
}

function captureRects(stack) {
  if (!stack) return null
  return new Map(
    [...stack.children].map((node) => [node, node.getBoundingClientRect()]),
  )
}

function animateReorder(stack, before) {
  if (!stack || !before?.size) return 0
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches || SAMSUNG_INTERNET) return 0

  return window.requestAnimationFrame(() => {
    if (!stack.isConnected) return

    const children = [...stack.children]
    children.forEach((node, index) => {
      const previous = before.get(node)
      if (!previous) return
      const current = node.getBoundingClientRect()
      const deltaX = previous.left - current.left
      const deltaY = previous.top - current.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return

      node.getAnimations().forEach((animation) => {
        if (animation.id === 'home-lunch-reorder') animation.cancel()
      })

      const animation = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.94 },
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
        ],
        {
          duration: 920,
          delay: Math.min(index * 42, 168),
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        },
      )
      animation.id = 'home-lunch-reorder'
    })
  })
}

export function useHomeMealPriority(now) {
  const initialPriority = window.matchMedia(PHONE_PORTRAIT_QUERY).matches && isLunchWindow(now)
  const [mealPriority, setMealPriority] = useState(initialPriority)
  const priorityRef = useRef(initialPriority)
  const homeStackRef = useRef(null)
  const beforeRectsRef = useRef(null)
  const animationFrameRef = useRef(0)

  function syncPriority(currentNow = new Date(), phonePortrait = window.matchMedia(PHONE_PORTRAIT_QUERY).matches) {
    const nextPriority = Boolean(phonePortrait) && isLunchWindow(currentNow)
    if (nextPriority === priorityRef.current) return

    beforeRectsRef.current = captureRects(homeStackRef.current)
    priorityRef.current = nextPriority
    setMealPriority(nextPriority)
  }

  useEffect(() => {
    const phonePortrait = window.matchMedia(PHONE_PORTRAIT_QUERY)
    const syncMedia = () => syncPriority(new Date(), phonePortrait.matches)

    syncMedia()
    phonePortrait.addEventListener?.('change', syncMedia)
    return () => phonePortrait.removeEventListener?.('change', syncMedia)
  }, [])

  useEffect(() => {
    const phonePortrait = window.matchMedia(PHONE_PORTRAIT_QUERY)
    let boundaryTimer = 0

    function schedulePriorityBoundary(currentNow = new Date()) {
      syncPriority(currentNow, phonePortrait.matches)
      const boundary = nextPriorityBoundary(currentNow)
      const delay = Math.max(100, boundary.getTime() - currentNow.getTime() + 100)
      boundaryTimer = window.setTimeout(() => schedulePriorityBoundary(new Date()), delay)
    }

    schedulePriorityBoundary(now)
    return () => {
      if (boundaryTimer) window.clearTimeout(boundaryTimer)
    }
  }, [now])

  useLayoutEffect(() => {
    const stack = homeStackRef.current
    const before = beforeRectsRef.current
    beforeRectsRef.current = null
    if (!stack || !before?.size) return undefined

    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = animateReorder(stack, before)

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = 0
      }
    }
  }, [mealPriority])

  return { homeStackRef, mealPriority }
}
