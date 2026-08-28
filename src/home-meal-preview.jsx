import { useEffect, useMemo } from 'react'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function pad(value) {
  return String(value).padStart(2, '0')
}

function rawDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

function addDays(date, days) {
  const next = dayStart(date)
  next.setDate(next.getDate() + days)
  return next
}

function mealForDate(meals, date) {
  const key = rawDate(date)
  const sameDay = (meals || []).filter((meal) => meal.rawDate === key)
  return sameDay.find((meal) => meal.mealCode === '2') || sameDay[0] || null
}

function weekContainsDate(week, date) {
  const key = rawDate(date)
  return (week?.dates || []).some((item) => rawDate(item) === key)
}

function dateLabel(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[date.getDay()]}요일`
}

export default function HomeMealPreview({ now, schoolData }) {
  const afterLunch = now.getHours() >= 14
  const weekend = now.getDay() === 0 || now.getDay() === 6
  const targetDate = useMemo(
    () => weekend ? dayStart(now) : afterLunch ? addDays(now, 1) : dayStart(now),
    [now.getFullYear(), now.getMonth(), now.getDate(), afterLunch, weekend],
  )

  const currentWeek = schoolData.mealWeek(0)
  const nextWeek = schoolData.mealWeek(1)
  const targetWeekOffset = weekContainsDate(currentWeek, targetDate) ? 0 : 1
  const week = targetWeekOffset === 0 ? currentWeek : nextWeek
  const meal = mealForDate(week.meals, targetDate)

  useEffect(() => {
    schoolData.ensureMealWeek(targetWeekOffset)
  }, [schoolData.ensureMealWeek, targetWeekOffset])

  const title = weekend ? '오늘 급식' : afterLunch ? '내일 급식' : '오늘 급식'
  const statusCopy = week.loading
    ? '급식 정보를 불러오는 중이에요.'
    : week.error
      ? '급식 정보를 불러오지 못했어요.'
      : `${dateLabel(targetDate)} 급식이 등록되지 않았어요.`

  return (
    <section className="home-section meal-preview stage3-home-block">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="stage3-home-surface">
        {meal ? (
          <>
            <p className="stage3-meal-home-menu">{meal.dishes.slice(0, 5).join(' · ')}</p>
            <span className="stage3-home-meta">
              {meal.dishes.length > 5 ? `외 ${meal.dishes.length - 5}개 · ` : ''}
              {meal.calories || dateLabel(targetDate)}
            </span>
          </>
        ) : (
          <p className="stage3-home-empty">{statusCopy}</p>
        )}
      </div>
    </section>
  )
}
