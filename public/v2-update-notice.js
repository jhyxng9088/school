(() => {
  const PROFILE_KEY = 'school.studentProfile.v1'
  const FIRST_TOUR_KEY = 'school.featureTour.v1'
  const UPDATE_TOUR_KEY = 'school.v2UpdateTour.v1'
  const UPDATE_STEP_KEY = 'school.v2UpdateTourStep.v1'
  let mounted = false

  const slides = [
    {
      eyebrow: 'S-Hub V2',
      title: 'S-Hub가 V2로 업데이트되었습니다.',
      body: '기존 기능은 그대로 유지하면서, 학교생활을 더 빠르게 확인하고 함께 사용할 수 있도록 구조와 기능을 확장했습니다.',
      visual: 'intro',
    },
    {
      eyebrow: '새로운 하단 메뉴',
      title: '자주 쓰는 기능을 5곳으로 다시 정리했습니다.',
      body: '홈, 우리 반, AI, 스터디, 일정으로 나누어 필요한 기능을 더 빠르게 찾을 수 있습니다.',
      visual: 'nav',
    },
    {
      eyebrow: '우리 반',
      title: '시간표와 게시판을 한곳에서 확인합니다.',
      body: '반 시간표와 게시판을 같은 공간에 묶고, 새 게시글이나 업데이트도 놓치지 않도록 표시합니다.',
      visual: 'class',
    },
    {
      eyebrow: '스터디',
      title: '함께 공부하는 흐름이 새로 추가되었습니다.',
      body: '공부를 시작하고 기록하며, 반 친구들의 활동과 순위를 확인할 수 있습니다.',
      visual: 'study',
    },
    {
      eyebrow: '더 풍부해진 홈',
      title: '홈에서 지금 필요한 정보를 더 많이 보여드립니다.',
      body: '현재 접속 인원, 게시판 새 소식, 스터디 새 활동, 남은 리마인더를 한눈에 확인할 수 있습니다.',
      visual: 'home',
    },
    {
      eyebrow: '일정 · AI',
      title: '기존 기능도 더 편하게 다듬었습니다.',
      body: '리마인더 섹션 관리와 일정 접근성을 개선하고, S-Hub AI도 V2 화면 구조에 맞게 정리했습니다.',
      visual: 'finish',
      final: true,
    },
  ]

  function hasProfile() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
      return Boolean(value?.name && value?.classNumber && value?.studentNumber)
    } catch {
      return false
    }
  }

  function storedStep() {
    const value = Number(localStorage.getItem(UPDATE_STEP_KEY) || 0)
    return Number.isInteger(value) ? Math.max(0, Math.min(slides.length - 1, value)) : 0
  }

  function shouldShow() {
    if (!hasProfile()) return false
    if (localStorage.getItem(FIRST_TOUR_KEY) !== 'done') return false
    return localStorage.getItem(UPDATE_TOUR_KEY) !== 'done'
  }

  function iconMarkup(type, className = 'v2-tour-icon') {
    const common = `class="${className}" viewBox="0 0 24 24" aria-hidden="true"`
    if (type === 'home') return `<svg ${common}><path d="M4 10.7 12 4l8 6.7v8.1a1.2 1.2 0 0 1-1.2 1.2h-4.4v-5.6H9.6V20H5.2A1.2 1.2 0 0 1 4 18.8Z"/></svg>`
    if (type === 'class') return `<svg ${common}><circle cx="8" cy="9" r="2.5"/><circle cx="16.2" cy="8.2" r="2.1"/><path d="M3.8 18.8c.4-3.2 2-5 4.6-5 2.7 0 4.3 1.8 4.7 5M13.7 13.5c2.8-.4 5.2 1.3 5.8 4.1"/></svg>`
    if (type === 'ai') return `<svg ${common}><path d="M12 3.7c.7 4.6 3.1 7 7.6 7.7-4.5.7-6.9 3.1-7.6 7.7-.7-4.6-3.1-7-7.6-7.7 4.5-.7 6.9-3.1 7.6-7.7Z"/><path d="M18.9 3.5c.2 1.4.9 2.1 2.2 2.3-1.3.2-2 1-2.2 2.3-.2-1.3-.9-2.1-2.2-2.3 1.3-.2 2-1 2.2-2.3Z"/></svg>`
    if (type === 'study') return `<svg ${common}><circle cx="12" cy="12" r="7.7"/><path d="M12 7.8v4.6l3 1.8"/></svg>`
    if (type === 'calendar') return `<svg ${common}><rect x="4" y="5.8" width="16" height="14" rx="3"/><path d="M8 3.7v4M16 3.7v4M4 10h16"/></svg>`
    if (type === 'timetable') return `<svg ${common}><rect x="4" y="4.5" width="16" height="15" rx="3"/><path d="M8 4.5v15M12 4.5v15M16 4.5v15M4 9.5h16M4 14.5h16"/></svg>`
    if (type === 'board') return `<svg ${common}><path d="M6 4.5h12a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2h-6l-4.3 2.1.7-2.1H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 12.5h5.5"/></svg>`
    if (type === 'people') return `<svg ${common}><circle cx="9" cy="9" r="2.5"/><path d="M4.2 18.6c.4-3.2 2-5 4.8-5 2.7 0 4.4 1.8 4.8 5M14 7.5c2.7-.2 4.1 1.4 4.1 3.2 0 1.3-.7 2.3-1.8 2.8M15.2 14.5c2.5.1 4 1.5 4.5 4.1"/></svg>`
    if (type === 'reminder') return `<svg ${common}><path d="M7 9.2a5 5 0 0 1 10 0c0 5 2 5.1 2 6.8H5c0-1.7 2-1.8 2-6.8Z"/><path d="M9.8 18.3c.4 1.2 1.1 1.8 2.2 1.8s1.8-.6 2.2-1.8"/></svg>`
    return `<svg ${common}><circle cx="12" cy="12" r="7"/></svg>`
  }

  function visualMarkup(type) {
    if (type === 'intro') {
      return `
        <div class="v2-tour-intro" aria-hidden="true">
          <span class="v2-tour-intro-halo"></span>
          <span class="v2-tour-intro-orbit orbit-one"><i></i></span>
          <span class="v2-tour-intro-orbit orbit-two"><i></i></span>
          <span class="v2-tour-intro-core"><strong>V2</strong></span>
          <b class="v2-tour-intro-speck speck-one"></b>
          <b class="v2-tour-intro-speck speck-two"></b>
          <b class="v2-tour-intro-speck speck-three"></b>
        </div>
      `
    }
    if (type === 'nav') {
      const items = [
        ['home', '홈'],
        ['class', '우리 반'],
        ['ai', 'AI'],
        ['study', '스터디'],
        ['calendar', '일정'],
      ]
      return `
        <div class="v2-tour-nav" aria-hidden="true">
          ${items.map(([icon, label], index) => `
            <i class="${icon === 'ai' ? 'is-ai' : ''}" style="--v2-order:${index}">
              ${iconMarkup(icon)}
              <span>${label}</span>
            </i>
          `).join('')}
          <b class="v2-tour-nav-indicator"></b>
        </div>
      `
    }
    if (type === 'class') {
      return `
        <div class="v2-tour-class" aria-hidden="true">
          <div class="v2-tour-class-card">
            <div class="v2-tour-class-head">
              <span class="v2-tour-class-icon">${iconMarkup('class')}</span>
              <strong>우리 반</strong>
              <i class="v2-tour-unread-dot"></i>
            </div>
            <div class="v2-tour-class-tabs">
              <span>${iconMarkup('timetable')}<b>시간표</b></span>
              <span>${iconMarkup('board')}<b>게시판</b><i class="v2-tour-mini-dot"></i></span>
            </div>
          </div>
          <span class="v2-tour-class-signal signal-one"></span>
          <span class="v2-tour-class-signal signal-two"></span>
        </div>
      `
    }
    if (type === 'study') {
      return `
        <div class="v2-tour-study" aria-hidden="true">
          <div class="v2-tour-study-ring">
            <span class="v2-tour-study-progress"></span>
            <b>42:18</b>
            <span>수학</span>
          </div>
          <div class="v2-tour-study-side">
            <div class="v2-tour-study-badge">${iconMarkup('people')}<span>함께 공부 중</span></div>
            <div class="v2-tour-study-bars"><i></i><i></i><i></i><i></i></div>
          </div>
        </div>
      `
    }
    if (type === 'home') {
      const cards = [
        ['people', '우리 반', '7/28명'],
        ['board', '게시판', '2개'],
        ['study', '스터디', '새 활동'],
        ['reminder', '리마인더', '3개'],
      ]
      return `
        <div class="v2-tour-home" aria-hidden="true">
          ${cards.map(([icon, label, value], index) => `
            <i style="--v2-order:${index}">
              <span class="v2-tour-home-icon">${iconMarkup(icon)}</span>
              <span>${label}</span>
              <b>${value}</b>
            </i>
          `).join('')}
        </div>
      `
    }
    return `
      <div class="v2-tour-finish" aria-hidden="true">
        <div class="v2-tour-finish-mark"><span></span><i class="v2-tour-finish-sheen"></i></div>
        <strong>S-Hub</strong>
        <b>V2</b>
        <div class="v2-tour-finish-tools">
          <i>${iconMarkup('calendar')}<span>일정</span></i>
          <i>${iconMarkup('ai')}<span>AI</span></i>
        </div>
      </div>
    `
  }

  function slideMarkup(slide, index) {
    return `
      <section class="feature-tour-slide v2-update-slide" data-index="${index}" aria-hidden="true">
        <div class="feature-tour-visual v2-update-visual">${visualMarkup(slide.visual)}</div>
        <div class="feature-tour-copy">
          <p>${slide.eyebrow}</p>
          <h2>${slide.title}</h2>
          <span>${slide.body}</span>
        </div>
      </section>
    `
  }

  function mount() {
    if (mounted || !shouldShow()) return
    if (document.querySelector('.feature-tour-layer')) return
    mounted = true
    localStorage.setItem(UPDATE_TOUR_KEY, 'pending')

    let index = storedStep()
    let startX = 0
    let startY = 0
    let startAt = 0
    let dragX = 0
    let dragging = false
    let horizontalGesture = false

    const layer = document.createElement('div')
    layer.className = 'first-run-notice-layer feature-tour-layer v2-update-tour-layer'
    layer.innerHTML = `
      <section class="first-run-notice-card feature-tour-shell v2-update-tour-shell" role="dialog" aria-modal="true" aria-label="S-Hub V2 업데이트 안내">
        <div class="feature-tour-viewport">
          <div class="feature-tour-track">
            ${slides.map(slideMarkup).join('')}
          </div>
        </div>
        <footer class="feature-tour-footer">
          <div class="feature-tour-progress" aria-label="업데이트 안내 진행 상태">
            ${slides.map((_, step) => `<i data-step="${step}" aria-hidden="true"></i>`).join('')}
          </div>
          <div class="feature-tour-actions">
            <button class="feature-tour-back" type="button">이전</button>
            <button class="feature-tour-next" type="button">다음</button>
          </div>
        </footer>
      </section>
    `

    const viewport = layer.querySelector('.feature-tour-viewport')
    const track = layer.querySelector('.feature-tour-track')
    const actions = layer.querySelector('.feature-tour-actions')
    const back = layer.querySelector('.feature-tour-back')
    const next = layer.querySelector('.feature-tour-next')
    const slideNodes = [...layer.querySelectorAll('.feature-tour-slide')]
    const progressNodes = [...layer.querySelectorAll('.feature-tour-progress i')]

    function paint({ animate = true } = {}) {
      if (!track) return
      track.classList.toggle('is-dragging', !animate)
      track.style.transform = `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`
      slideNodes.forEach((slideNode, step) => {
        const active = step === index
        slideNode.classList.toggle('is-active', active)
        slideNode.setAttribute('aria-hidden', active ? 'false' : 'true')
      })
      progressNodes.forEach((dot, step) => dot.classList.toggle('is-active', step === index))
      actions?.classList.toggle('has-back', index > 0)
      if (back) {
        back.disabled = index === 0
        back.setAttribute('aria-hidden', index === 0 ? 'true' : 'false')
      }
      if (next) next.textContent = index === slides.length - 1 ? 'V2 시작하기' : '다음'
    }

    function setIndex(nextIndex) {
      index = Math.max(0, Math.min(slides.length - 1, nextIndex))
      dragX = 0
      localStorage.setItem(UPDATE_STEP_KEY, String(index))
      paint({ animate: true })
    }

    function finish() {
      if (layer.classList.contains('is-finishing')) return
      localStorage.setItem(UPDATE_TOUR_KEY, 'done')
      localStorage.removeItem(UPDATE_STEP_KEY)
      layer.classList.add('is-finishing')
      window.setTimeout(() => {
        layer.remove()
        mounted = false
      }, 560)
    }

    function goNext() {
      if (index >= slides.length - 1) finish()
      else setIndex(index + 1)
    }

    function goBack() {
      if (index > 0) setIndex(index - 1)
    }

    back?.addEventListener('click', goBack)
    next?.addEventListener('click', goNext)

    viewport?.addEventListener('pointerdown', (event) => {
      if (event.target.closest?.('a, button')) return
      dragging = true
      horizontalGesture = false
      startX = event.clientX
      startY = event.clientY
      startAt = performance.now()
      dragX = 0
      viewport.setPointerCapture?.(event.pointerId)
      paint({ animate: false })
    })

    viewport?.addEventListener('pointermove', (event) => {
      if (!dragging) return
      const rawX = event.clientX - startX
      const rawY = event.clientY - startY
      if (!horizontalGesture && Math.abs(rawX) + Math.abs(rawY) > 8) {
        if (Math.abs(rawY) > Math.abs(rawX) * 1.1) {
          dragging = false
          dragX = 0
          paint({ animate: true })
          return
        }
        horizontalGesture = true
      }
      if (!horizontalGesture) return
      const width = Math.max(1, viewport.clientWidth)
      const edgeResistance = (index === 0 && rawX > 0) || (index === slides.length - 1 && rawX < 0)
      dragX = Math.max(-width * .34, Math.min(width * .34, rawX * (edgeResistance ? .28 : 1)))
      paint({ animate: false })
    })

    function finishDrag(event) {
      if (!dragging) return
      dragging = false
      const width = Math.max(1, viewport?.clientWidth || 1)
      const elapsed = Math.max(1, performance.now() - startAt)
      const velocity = Math.abs(dragX) / elapsed
      const shouldMove = Math.abs(dragX) > width * .14 || (Math.abs(dragX) > 24 && velocity > .45)
      if (horizontalGesture && shouldMove) {
        if (dragX < 0 && index < slides.length - 1) index += 1
        if (dragX > 0 && index > 0) index -= 1
        localStorage.setItem(UPDATE_STEP_KEY, String(index))
      }
      dragX = 0
      horizontalGesture = false
      paint({ animate: true })
      if (event?.pointerId != null) viewport?.releasePointerCapture?.(event.pointerId)
    }

    viewport?.addEventListener('pointerup', finishDrag)
    viewport?.addEventListener('pointercancel', finishDrag)

    document.body.appendChild(layer)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add('is-open')
      paint({ animate: true })
      next?.focus({ preventScroll: true })
    }))
  }

  const observer = new MutationObserver(() => {
    if (!mounted && shouldShow() && !document.querySelector('.feature-tour-layer')) mount()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener('focus', mount)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
})()
