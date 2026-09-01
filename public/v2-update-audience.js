(() => {
  const PROFILE_KEY = 'school.studentProfile.v1'
  const UPDATE_TOUR_KEY = 'school.v2UpdateTour.v1'

  if (localStorage.getItem(UPDATE_TOUR_KEY)) return

  let hasExistingProfile = false
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    hasExistingProfile = Boolean(profile?.name && profile?.classNumber && profile?.studentNumber)
  } catch {
    hasExistingProfile = false
  }

  // This script runs before the V2 onboarding scripts. If there was no student
  // profile at that moment, the user is joining after V2 and should never see
  // the legacy-user update tour on a later launch.
  if (!hasExistingProfile) localStorage.setItem(UPDATE_TOUR_KEY, 'done')
})()
