import { chromium, webkit } from 'playwright'

const baseUrl = process.env.V2_QA_URL || 'http://127.0.0.1:4173/school/'
const appOrigin = new URL(baseUrl).origin
const profile = JSON.stringify({ name: 'QA', classNumber: 1, studentNumber: 1 })
const STORAGE_PREFIX = 'school.preview.'
const PROFILE_KEY = `${STORAGE_PREFIX}studentProfile.v1`
const FIRST_TOUR_KEY = `${STORAGE_PREFIX}featureTour.v1`
const UPDATE_TOUR_KEY = `${STORAGE_PREFIX}v2UpdateTour.v1`
const UPDATE_STEP_KEY = `${STORAGE_PREFIX}v2UpdateTourStep.v1`
const legacyStorage = {
  cookies: [],
  origins: [{
    origin: appOrigin,
    localStorage: [
      { name: PROFILE_KEY, value: profile },
      { name: FIRST_TOUR_KEY, value: 'done' },
    ],
  }],
}

const targets = [
  {
    name: 'iPhone WebKit',
    browser: webkit,
    context: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'dark',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
  },
  {
    name: 'iPad WebKit',
    browser: webkit,
    context: {
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: true,
      colorScheme: 'dark',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    },
  },
  {
    name: 'Samsung phone Chromium',
    browser: chromium,
    context: {
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'dark',
      userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S938N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    },
    samsung: true,
  },
  {
    name: 'Samsung tablet Chromium',
    browser: chromium,
    context: {
      viewport: { width: 800, height: 1280 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'dark',
      userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-X920) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Safari/537.36',
    },
    samsung: true,
  },
  {
    name: 'Desktop Chromium',
    browser: chromium,
    context: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      colorScheme: 'dark',
    },
    desktop: true,
  },
]

function fail(name, message) {
  throw new Error(`[${name}] ${message}`)
}

for (const target of targets) {
  const browser = await target.browser.launch({ headless: true })
  try {
    // Preview builds deliberately namespace every school.* localStorage key as
    // school.preview.*. Seed that isolated namespace so the first boot is a true
    // legacy-user boot without touching or depending on production storage.
    const context = await browser.newContext({ ...target.context, storageState: legacyStorage })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))

    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    try {
      await page.waitForSelector('.v2-update-tour-layer.is-open', { state: 'visible', timeout: 15000 })
    } catch (error) {
      const debug = await page.evaluate(({ PROFILE_KEY, FIRST_TOUR_KEY, UPDATE_TOUR_KEY, UPDATE_STEP_KEY }) => ({
        url: location.href,
        readyState: document.readyState,
        profile: localStorage.getItem(PROFILE_KEY),
        firstTour: localStorage.getItem(FIRST_TOUR_KEY),
        updateTour: localStorage.getItem(UPDATE_TOUR_KEY),
        updateStep: localStorage.getItem(UPDATE_STEP_KEY),
        layer: document.querySelector('.feature-tour-layer')?.className || '',
        scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
      }), { PROFILE_KEY, FIRST_TOUR_KEY, UPDATE_TOUR_KEY, UPDATE_STEP_KEY })
      console.error(`DEBUG ${target.name}`, JSON.stringify(debug))
      throw error
    }

    const initial = await page.evaluate(() => {
      const html = document.documentElement
      const shell = document.querySelector('.v2-update-tour-shell')?.getBoundingClientRect()
      const viewport = document.querySelector('.feature-tour-viewport')?.getBoundingClientRect()
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: html.scrollWidth,
        htmlOverflowY: getComputedStyle(html).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        clientWidth: html.clientWidth,
        shell: shell && { x: shell.x, y: shell.y, width: shell.width, height: shell.height, right: shell.right, bottom: shell.bottom },
        viewport: viewport && { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height, right: viewport.right, bottom: viewport.bottom },
        samsung: html.classList.contains('school-samsung'),
        desktop: html.classList.contains('school-desktop-laptop'),
        bg: getComputedStyle(html).getPropertyValue('--bg').trim(),
        surface: getComputedStyle(html).getPropertyValue('--surface').trim(),
      }
    })

    if (!initial.shell || !initial.viewport) fail(target.name, 'V2 tour shell/viewport missing')
    if (initial.scrollWidth > initial.innerWidth + 1) fail(target.name, `horizontal overflow ${initial.scrollWidth}px > ${initial.innerWidth}px`)
    if (initial.shell.x < -1 || initial.shell.right > initial.innerWidth + 1) fail(target.name, 'tour shell escapes horizontal viewport')
    if (initial.shell.y < -1 || initial.shell.bottom > initial.innerHeight + 1) fail(target.name, 'tour shell escapes vertical viewport')
    if (initial.viewport.x < -1 || initial.viewport.right > initial.innerWidth + 1) fail(target.name, 'card viewport escapes horizontal viewport')

    if (target.samsung) {
      if (!initial.samsung) fail(target.name, 'school-samsung class was not applied before rendering')
      if (initial.bg.toLowerCase() !== '#000000') fail(target.name, `Samsung dark bg mismatch: ${initial.bg}`)
      if (initial.surface.toLowerCase() !== '#1c1c1e') fail(target.name, `Samsung dark surface mismatch: ${initial.surface}`)
    } else if (initial.samsung) {
      fail(target.name, 'Samsung class leaked to a non-Samsung target')
    }

    if (target.desktop) {
      if (!initial.desktop) fail(target.name, 'school-desktop-laptop class missing')
      if (initial.htmlOverflowY !== 'hidden') fail(target.name, `desktop html overflow-y should lock during tour, got ${initial.htmlOverflowY}`)
      if (initial.bodyOverflowY !== 'hidden') fail(target.name, `desktop body overflow-y should lock during tour, got ${initial.bodyOverflowY}`)
    } else if (initial.desktop) {
      fail(target.name, 'desktop class leaked to phone/tablet target')
    }

    for (let step = 0; step < 6; step += 1) {
      const active = page.locator('.v2-update-slide.is-active')
      await active.waitFor({ state: 'visible' })
      const index = await active.getAttribute('data-index')
      if (Number(index) !== step) fail(target.name, `expected slide ${step}, got ${index}`)

      const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        activeCount: document.querySelectorAll('.v2-update-slide.is-active').length,
        nextVisible: Boolean(document.querySelector('.feature-tour-next')?.getBoundingClientRect().height),
      }))
      if (geometry.scrollWidth > geometry.innerWidth + 1) fail(target.name, `slide ${step} introduced horizontal overflow`)
      if (geometry.activeCount !== 1) fail(target.name, `slide ${step} has ${geometry.activeCount} active slides`)
      if (!geometry.nextVisible) fail(target.name, `slide ${step} CTA is not visible`)

      if (step === 1) {
        const iconCount = await active.locator('.v2-tour-nav .v2-tour-icon').count()
        if (iconCount !== 5) fail(target.name, `nav slide expected 5 icons, got ${iconCount}`)
      }
      if (step === 2) {
        const iconCount = await active.locator('.v2-tour-class .v2-tour-icon').count()
        if (iconCount < 3) fail(target.name, 'class slide icons missing')
      }
      if (step === 4) {
        const iconCount = await active.locator('.v2-tour-home .v2-tour-icon').count()
        if (iconCount !== 4) fail(target.name, `home slide expected 4 icons, got ${iconCount}`)
      }

      await page.locator('.feature-tour-next').click()
      if (step < 5) await page.waitForFunction((expected) => Number(document.querySelector('.v2-update-slide.is-active')?.dataset.index) === expected, step + 1)
    }

    await page.waitForSelector('.v2-update-tour-layer', { state: 'detached', timeout: 5000 })
    const finished = await page.evaluate(({ UPDATE_TOUR_KEY }) => ({
      state: localStorage.getItem(UPDATE_TOUR_KEY),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      clientWidth: document.documentElement.clientWidth,
    }), { UPDATE_TOUR_KEY })
    if (finished.state !== 'done') fail(target.name, `tour completion state is ${finished.state}`)
    if (finished.scrollWidth > finished.innerWidth + 1) fail(target.name, 'horizontal overflow after closing tour')
    if (target.desktop && finished.htmlOverflowY !== 'scroll') fail(target.name, `desktop overflow-y did not restore: ${finished.htmlOverflowY}`)
    if (target.desktop && Math.abs(finished.clientWidth - initial.clientWidth) > 1) fail(target.name, `desktop clientWidth jumped ${initial.clientWidth} -> ${finished.clientWidth}`)

    if (pageErrors.length) fail(target.name, `page errors: ${pageErrors.join(' | ')}`)
    const relevantConsoleErrors = consoleErrors.filter((message) => !/favicon|Failed to load resource.*404/i.test(message))
    if (relevantConsoleErrors.length) fail(target.name, `console errors: ${relevantConsoleErrors.join(' | ')}`)

    console.log(`PASS ${target.name}`)
    await context.close()
  } finally {
    await browser.close()
  }
}

console.log(`Cross-device V2 browser QA passed for ${targets.length} targets.`)
