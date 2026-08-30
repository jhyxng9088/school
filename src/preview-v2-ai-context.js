import { ensureSignedIn, readStudentProfile } from './school-sync.js'

const API_URL = 'https://school-reminder-backend.vercel.app/api/class-roster'
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'

function inPreview() {
  const path = window.location.pathname
  return path.includes('/preview-v2/') || path.startsWith('/preview/')
}

function safeText(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function readMeals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEAL_CACHE_KEY) || 'null')
    const ranges = parsed?.ranges && typeof parsed.ranges === 'object' ? parsed.ranges : {}
    const seen = new Set()
    const meals = []
    Object.values(ranges).forEach((entry) => {
      ;(entry?.meals || []).forEach((meal) => {
        const rawDate = safeText(meal?.rawDate, 8)
        const key = `${rawDate}-${safeText(meal?.mealCode, 4)}`
        if (!rawDate || seen.has(key)) return
        seen.add(key)
        meals.push({
          date: /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate,
          mealName: safeText(meal?.mealName, 20),
          dishes: Array.isArray(meal?.dishes) ? meal.dishes.slice(0, 16).map((dish) => safeText(dish, 80)).filter(Boolean) : [],
          calories: safeText(meal?.calories, 40),
        })
      })
    })
    return meals.sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  } catch {
    return []
  }
}

async function request(token, resource = '') {
  const url = new URL(API_URL)
  if (resource) url.searchParams.set('resource', resource)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) return null
  return payload
}

function safeBoard(payload) {
  return (payload?.posts || []).slice(0, 24).map((post) => ({
    kind: post?.kind === 'question' ? 'question' : 'general',
    title: safeText(post?.title, 80),
    body: safeText(post?.body, 700),
    authorName: safeText(post?.authorName, 20),
    resolved: Boolean(post?.resolved),
    createdAt: Number(post?.createdAt || 0),
    comments: (post?.comments || []).slice(-10).map((comment) => ({
      authorName: safeText(comment?.authorName, 20),
      body: safeText(comment?.body, 320),
      createdAt: Number(comment?.createdAt || 0),
    })),
  }))
}

function safeStudy(payload) {
  return {
    date: safeText(payload?.date, 10),
    active: (payload?.active || []).slice(0, 80).map((item) => ({
      name: safeText(item?.name, 20),
      subject: safeText(item?.subject, 24),
      startedAt: Number(item?.startedAt || 0),
    })),
    classRanking: (payload?.totals || []).slice(0, 80).map((item) => ({
      name: safeText(item?.name, 20),
      totalMs: Math.max(0, Number(item?.totalMs || 0)),
    })),
    globalRanking: (payload?.globalTotals || []).slice(0, 120).map((item) => ({
      name: safeText(item?.name, 20),
      classNumber: Number(item?.classNumber || 0),
      totalMs: Math.max(0, Number(item?.totalMs || 0)),
    })),
  }
}

function safeRoster(payload) {
  return {
    classNumber: Number(payload?.classNumber || 0),
    total: Math.max(0, Number(payload?.total || 0)),
    online: Math.max(0, Number(payload?.online || 0)),
    members: (payload?.members || []).slice(0, 80).map((member) => ({
      name: safeText(member?.name, 20),
      online: Boolean(member?.online),
    })),
  }
}

export async function enrichPreviewAIContext(context = {}) {
  if (!inPreview()) return context

  const profile = readStudentProfile()
  let token = ''
  try {
    const user = await ensureSignedIn()
    token = String(await user.getIdToken()).trim()
  } catch {
    token = ''
  }

  const [board, study, roster] = token
    ? await Promise.all([
        request(token, 'board').catch(() => null),
        request(token, 'study').catch(() => null),
        request(token).catch(() => null),
      ])
    : [null, null, null]

  return {
    ...context,
    student: profile ? {
      name: safeText(profile.name, 20),
      classNumber: Number(profile.classNumber || 0),
      studentNumber: Number(profile.studentNumber || 0),
    } : null,
    meals: readMeals(),
    classBoard: safeBoard(board),
    study: safeStudy(study),
    classRoster: safeRoster(roster),
    accessPolicy: {
      scope: 'student-visible-only',
      adminFeaturesIncluded: false,
      superAdminFeaturesIncluded: false,
      instruction: '관리자·슈퍼관리자 전용 데이터와 기능은 사용하거나 추측하지 않는다.',
    },
  }
}
