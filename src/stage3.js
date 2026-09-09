import { useSchoolData as useSchoolDataCore } from './stage3-core.js'
import { readStudentProfile } from './school-sync.js'

export function useSchoolData(now) {
  return useSchoolDataCore(now, readStudentProfile())
}

export { default as MealPreview } from './home-meal-preview.jsx'
export { default as MealPage } from './meal-page.jsx'
