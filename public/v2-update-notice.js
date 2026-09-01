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

  function visualMarkup(type) {
    if (type === 'intro') {
      return '<div class="v2-tour-intro" aria-hidden="true"><i></i><strong>V2</strong><span></span></div>'
    }
    if (type === 'nav') {
      return '<div class="v2-tour-nav" aria-hidden="true"><i>홈</i><i>우리 반</i><i>AI</i><i>스터디</i><i>일정</i></div>'
    }
    if (type === 'class') {
      return '<div class="v2-tour-class" aria-hidden="true"><div><strong>우리 반</strong><span>시간표</span><span>게시판</span></div><i></i><i></i><i></i></div>'
    }
    if (type === 'study') {
      return '<div class="v2-tour-study" aria-hidden="true"><div class="v2-tour-study-ring"><b>42:18</b><span>수학</span></div><div class="v2-tour-study-bars"><i></i><i></i><i></i><i></i></div></div>'
    }
    if (type === 'home') {
      return '<div class="v2-tour-home" aria-hidden="true"><i><span>우리 반</span><b>7/28명</b></i><i><span>게시판</span><b>2개</b></i><i><span>스터디</span><b>새 활동</b></i><i><span>리마인더</span><b>3개</b></i></div>'
    }
    return '<div class="v2-tour-finish" aria-hidden="true"><span></span><strong>S-Hub</strong><b>V2</b></div>'
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
