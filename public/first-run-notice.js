(() => {
  const PROFILE_KEY = 'school.studentProfile.v1'
  const TOUR_KEY = 'school.featureTour.v1'
  const TOUR_STEP_KEY = 'school.featureTourStep.v1'
  const LEGACY_NOTICE_KEY = 'school.contactNotice.v1'
  const INSTAGRAM_URL = 'https://www.instagram.com/j.hyxng?igsi=eW9rczVqczBnMnBz&utm_source=qr'
  const hadProfileAtBoot = hasProfile()
  let profileCreatedThisRun = false
  let mounted = false

  const slides = [
    {
      eyebrow: 'S-Hub AI',
      title: '학교생활, 궁금한 건 물어보세요.',
      body: '시간표·리마인더·학사일정처럼 S-Hub에 있는 정보를 바탕으로 답해요.',
      visual: 'ai',
    },
    {
      eyebrow: '공지 AI 분석',
      title: '공지는 AI가 읽어드려요.',
      body: '사진·캡처·PDF에서 과제, 수행평가, 학사일정, 시간표 변경을 찾아요.',
      visual: 'notice',
    },
    {
      eyebrow: 'AI 일정 정리',
      title: '일정까지 바로 정리해요.',
      body: '찾은 내용을 기존 일정과 비교하고 중복을 확인한 뒤 바로 추가할 수 있어요.',
      visual: 'organize',
    },
    {
      eyebrow: '학교생활 통합',
      title: '학교 정보를 한곳에서 확인해요.',
      body: '시간표, 급식, 리마인더, 학사일정을 한곳에서 빠르게 확인해요.',
      visual: 'hub',
    },
    {
      eyebrow: '우리 반 공유',
      title: '우리 반과 함께 업데이트해요.',
      body: '리마인더와 시간표 변경을 같은 반 친구들과 실시간으로 공유해요.',
      visual: 'share',
    },
    {
      eyebrow: 'S-Hub',
      title: '@j.hyxng',
      body: '수정이나 문의가 있으면 언제든 알려 주세요.',
      visual: 'creator',
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
    const value = Number(localStorage.getItem(TOUR_STEP_KEY) || 0)
    return Number.isInteger(value) ? Math.max(0, Math.min(slides.length - 1, value)) : 0
  }

  function shouldShow() {
    if (!hasProfile()) return false
    const state = localStorage.getItem(TOUR_KEY)
    if (state === 'done') return false
    if (state === 'pending') return true
    return profileCreatedThisRun && !hadProfileAtBoot
  }

  function visualMarkup(type) {
    if (type === 'ai') {
      return `
        <div class="feature-tour-ai-orb" aria-hidden="true">
          <span class="feature-tour-ai-ring ring-one"></span>
          <span class="feature-tour-ai-ring ring-two"></span>
          <i class="dot d1"></i><i class="dot d2"></i><i class="dot d3"></i><i class="dot d4"></i><i class="dot d5"></i>
        </div>
      `
    }
    if (type === 'notice') {
      return `
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <rect x="34" y="23" width="52" height="72" rx="12"></rect>
          <path d="M47 45h26M47 56h18M47 67h23"></path>
          <path class="feature-tour-accent-line" d="M25 39v-9a7 7 0 0 1 7-7h9M95 39v-9a7 7 0 0 0-7-7h-9M25 79v9a7 7 0 0 0 7 7h9M95 79v9a7 7 0 0 1-7 7h-9"></path>
        </svg>
      `
    }
    if (type === 'organize') {
      return `
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <rect x="26" y="29" width="68" height="62" rx="15"></rect>
          <path d="M42 47h36M42 61h25M42 75h30"></path>
          <circle cx="88" cy="82" r="15"></circle>
          <path class="feature-tour-accent-line" d="m81.5 82 4.5 4.5 8-9"></path>
        </svg>
      `
    }
    if (type === 'hub') {
      return `
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <rect x="25" y="25" width="29" height="29" rx="9"></rect>
          <rect x="66" y="25" width="29" height="29" rx="9"></rect>
          <rect x="25" y="66" width="29" height="29" rx="9"></rect>
          <rect x="66" y="66" width="29" height="29" rx="9"></rect>
          <path class="feature-tour-accent-line" d="M54 39.5h12M39.5 54v12M80.5 54v12M54 80.5h12"></path>
        </svg>
      `
    }
    if (type === 'share') {
      return `
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="34" r="13"></circle>
          <circle cx="34" cy="82" r="13"></circle>
          <circle cx="86" cy="82" r="13"></circle>
          <path class="feature-tour-accent-line" d="M53.5 45.5 40.5 70M66.5 45.5 79.5 70M47 82h26"></path>
        </svg>
      `
    }
    return `
      <div class="feature-tour-creator-mark" aria-hidden="true">
        <span>S</span>
      </div>
    `
  }

  function slideMarkup(slide, index) {
    const creatorLink = slide.final
      ? `<a class="feature-tour-creator-link" href="${INSTAGRAM_URL}" target="_blank" rel="noreferrer">Instagram에서 보기</a>`
      : ''
    return `
      <section class="feature-tour-slide" data-index="${index}" aria-hidden="true">
        <div class="feature-tour-visual ${slide.final ? 'is-creator' : ''}">${visualMarkup(slide.visual)}</div>
        <div class="feature-tour-copy">
          <p>${slide.eyebrow}</p>
          <h2>${slide.title}</h2>
          <span>${slide.body}</span>
          ${creatorLink}
        </div>
      </section>
    `
  }

  function mount() {
    if (mounted || !shouldShow()) return
    mounted = true
    localStorage.setItem(TOUR_KEY, 'pending')

    let index = storedStep()
    let startX = 0
    let startY = 0
    let startAt = 0
    let dragX = 0
    let dragging = false
    let horizontalGesture = false

    const layer = document.createElement('div')
    layer.className = 'first-run-notice-layer feature-tour-layer'
    layer.innerHTML = `
      <section class="first-run-notice-card feature-tour-shell" role="dialog" aria-modal="true" aria-label="S-Hub 기능 소개">
        <div class="feature-tour-viewport">
          <div class="feature-tour-track">
            ${slides.map(slideMarkup).join('')}
          </div>
        </div>
        <footer class="feature-tour-footer">
          <div class="feature-tour-progress" aria-label="소개 진행 상태">
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
      if (next) next.textContent = index === slides.length - 1 ? 'S-Hub 시작하기' : '다음'
    }

    function setIndex(nextIndex) {
      const bounded = Math.max(0, Math.min(slides.length - 1, nextIndex))
      index = bounded
      dragX = 0
      localStorage.setItem(TOUR_STEP_KEY, String(index))
      paint({ animate: true })
    }

    function finish() {
      if (layer.classList.contains('is-finishing')) return
      localStorage.setItem(TOUR_KEY, 'done')
      localStorage.setItem(LEGACY_NOTICE_KEY, 'done')
      localStorage.removeItem(TOUR_STEP_KEY)
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
      event.preventDefault()
      const width = Math.max(1, viewport.clientWidth)
      const edgeResistance = (index === 0 && rawX > 0) || (index === slides.length - 1 && rawX < 0)
      const resistance = edgeResistance ? 0.22 : 0.84
      dragX = Math.max(-width * 0.34, Math.min(width * 0.34, rawX * resistance))
      paint({ animate: false })
    })

    function endDrag(event) {
      if (!dragging) return
      dragging = false
      const elapsed = Math.max(1, performance.now() - startAt)
      const velocity = dragX / elapsed
      const width = Math.max(1, viewport?.clientWidth || 1)
      const threshold = Math.min(72, width * 0.17)
      const shouldAdvance = dragX < -threshold || (dragX < -22 && velocity < -0.32)
      const shouldReturn = dragX > threshold || (dragX > 22 && velocity > 0.32)
      if (shouldAdvance && index < slides.length - 1) setIndex(index + 1)
      else if (shouldReturn && index > 0) setIndex(index - 1)
      else {
        dragX = 0
        paint({ animate: true })
      }
      try { viewport?.releasePointerCapture?.(event.pointerId) } catch {}
    }

    viewport?.addEventListener('pointerup', endDrag)
    viewport?.addEventListener('pointercancel', endDrag)

    layer.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') goNext()
      else if (event.key === 'ArrowLeft') goBack()
    })

    document.body.appendChild(layer)
    paint({ animate: false })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add('is-open')
      paint({ animate: true })
      next?.focus({ preventScroll: true })
    }))
  }

  window.addEventListener('school:student-profile-saved', () => {
    if (hadProfileAtBoot) return
    profileCreatedThisRun = true
    localStorage.setItem(TOUR_KEY, 'pending')
    localStorage.setItem(TOUR_STEP_KEY, '0')
    mount()
  })

  const observer = new MutationObserver(() => {
    if (localStorage.getItem(TOUR_KEY) === 'pending') mount()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('focus', mount)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
})()
