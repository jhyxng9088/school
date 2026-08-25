const NEIS_BASE_URL = 'https://open.neis.go.kr/hub'
const MEAL_CACHE_KEY = 'school.meals.cache.v1'
const SCHOOL_CACHE_KEY = 'school.meals.school.v1'
const CACHE_MAX_AGE = 1000 * 60 * 60 * 12

function buildUrl(path, params) {
  const url = new URL(`${NEIS_BASE_URL}/${path}`)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', '100')

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

function getRows(payload, key) {
  const section = payload?.[key]
  if (!Array.isArray(section)) return []
  const rowBlock = section.find((item) => Array.isArray(item?.row))
  return rowBlock?.row || []
}

function compactDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function displayDate(value) {
  if (!/^\d{8}$/.test(value || '')) return value || ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function cleanDishName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDishes(value) {
  return String(value || '')
    .split(/<br\s*\/?>|\n/gi)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const allergenMatch = raw.match(/([0-9]+(?:\.[0-9]+)*\.?\*?)\s*$/)
      const allergenText = allergenMatch?.[1] || ''
      const allergens = allergenText
        .replace('*', '')
        .split('.')
        .map((item) => Number(item))
        .filter(Number.isFinite)

      const name = cleanDishName(allergenMatch ? raw.slice(0, allergenMatch.index) : raw)
      return { name, allergens }
    })
    .filter((item) => item.name)
}

function normalizeSchool(row) {
  return {
    officeCode: row.ATPT_OFCDC_SC_CODE,
    officeName: row.ATPT_OFCDC_SC_NM,
    schoolCode: row.SD_SCHUL_CODE,
    schoolName: row.SCHUL_NM,
    schoolType: row.SCHUL_KND_SC_NM,
    location: row.LCTN_SC_NM,
    address: row.ORG_RDNMA,
  }
}

function normalizeMeal(row) {
  return {
    date: displayDate(row.MLSV_YMD),
    rawDate: row.MLSV_YMD,
    mealCode: row.MMEAL_SC_CODE,
    mealName: row.MMEAL_SC_NM,
    dishes: parseDishes(row.DDISH_NM),
    calories: row.CAL_INFO || '',
    origin: row.ORPLC_INFO || '',
    nutrition: row.NTR_INFO || '',
  }
}

export async function searchSchools(query, { signal } = {}) {
  const name = String(query || '').trim()
  if (name.length < 2) return []

  const response = await fetch(buildUrl('schoolInfo', { SCHUL_NM: name }), {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`NEIS school search failed: ${response.status}`)

  const payload = await response.json()
  return getRows(payload, 'schoolInfo')
    .map(normalizeSchool)
    .filter((school) => school.officeCode && school.schoolCode && school.schoolName)
}

export async function fetchMeals(school, fromDate, toDate = fromDate, { signal } = {}) {
  if (!school?.officeCode || !school?.schoolCode) throw new Error('School is not configured')

  const start = fromDate instanceof Date ? fromDate : new Date(fromDate)
  const end = toDate instanceof Date ? toDate : new Date(toDate)
  const params = {
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    MLSV_FROM_YMD: compactDate(start),
    MLSV_TO_YMD: compactDate(end),
  }

  const response = await fetch(buildUrl('mealServiceDietInfo', params), {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`NEIS meal request failed: ${response.status}`)

  const payload = await response.json()
  return getRows(payload, 'mealServiceDietInfo')
    .map(normalizeMeal)
    .sort((a, b) => `${a.rawDate}-${a.mealCode}`.localeCompare(`${b.rawDate}-${b.mealCode}`))
}

export function loadMealSchool() {
  try {
    const value = JSON.parse(localStorage.getItem(SCHOOL_CACHE_KEY) || 'null')
    if (!value?.officeCode || !value?.schoolCode || !value?.schoolName) return null
    return value
  } catch {
    return null
  }
}

export function saveMealSchool(school) {
  if (!school) {
    localStorage.removeItem(SCHOOL_CACHE_KEY)
    return
  }
  localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(school))
}

export function loadMealCache(school) {
  try {
    const cached = JSON.parse(localStorage.getItem(MEAL_CACHE_KEY) || 'null')
    if (!cached?.savedAt || !Array.isArray(cached?.meals)) return null
    if (school && cached.schoolCode !== school.schoolCode) return null

    return {
      ...cached,
      stale: Date.now() - cached.savedAt > CACHE_MAX_AGE,
    }
  } catch {
    return null
  }
}

export function saveMealCache(school, meals) {
  if (!school?.schoolCode || !Array.isArray(meals)) return
  localStorage.setItem(MEAL_CACHE_KEY, JSON.stringify({
    schoolCode: school.schoolCode,
    savedAt: Date.now(),
    meals,
  }))
}

export function mealForDate(meals, date) {
  const key = compactDate(date)
  return (meals || []).filter((meal) => meal.rawDate === key)
}
