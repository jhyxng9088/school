import React, { useEffect, useState } from 'react'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function pad(value) {
  return String(value).padStart(2, '0')
}

function rawDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function mealForDate(meals, date) {
  const key = rawDate(date)
  const sameDay = (meals || []).filter((meal) => meal.rawDate === key)
  return sameDay.find((meal) => meal.mealCode === '2') || sameDay[0] || null
}

function formatWeekRange(dates) {
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.getMonth() === last.getMonth()) return `${first.getMonth() + 1}월 ${first.getDate()}–${last.getDate()}일`
  return `${first.getMonth() + 1}월 ${first.getDate()}일–${last.getMonth() + 1}월 ${last.getDate()}일`
}

function formatDate(date) {
  if (!date) return ''
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[date.getDay()]}요일`
}

function relativeWeekLabel(offset) {
  if (offset === 0) return '이번 주'
  if (offset === 1) return '다음 주'
  if (offset === -1) return '지난 주'
  return offset > 1 ? `${offset}주 후` : `${Math.abs(offset)}주 전`
}

function stableDishKey(dish, index, dishes) {
  const occurrence = dishes.slice(0, index + 1).filter((item) => item === dish).length
  return `${dish}::${occurrence}`
}

export default function MealPage({ schoolData }) {
  const initialIndex = (() => {
    const day = new Date().getDay()
    return day >= 1 && day <= 5 ? day - 1 : 0
  })()

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  const week = schoolData.mealWeek(weekOffset)
  const selectedDate = week.dates[selectedIndex] || week.dates[0]
  const meal = mealForDate(week.meals, selectedDate)

  useEffect(() => {
    schoolData.ensureMealWeek(weekOffset)
  }, [weekOffset, schoolData])

  function selectDay(index) {
    if (index !== selectedIndex) setSelectedIndex(index)
  }

  function moveWeek(delta) {
    setWeekOffset((value) => value + delta)
  }

  function backToCurrentWeek() {
    if (weekOffset !== 0) setWeekOffset(0)
  }

  let detailContent

  if (meal) {
    const dateLine = `${formatDate(selectedDate)} · ${meal.mealName}`
    detailContent = (
      <>
        <p className="stage3-detail-date" key={dateLine}>{dateLine}</p>
        <h2>급식</h2>
        <ul className="stage3-meal-list">
          {meal.dishes.map((dish, index) => (
            <li key={stableDishKey(dish, index, meal.dishes)}>{dish}</li>
          ))}
        </ul>
        {meal.calories ? <p className="stage3-detail-meta" key={meal.calories}>{meal.calories}</p> : null}
      </>
    )
  } else if (week.loading) {
    detailContent = (
      <div className="stage3-status" key={`loading-${week.key}`}>
        <strong>급식 불러오는 중</strong>
        <p>{formatWeekRange(week.dates)} 급식을 확인하고 있어.</p>
      </div>
    )
  } else {
    const statusKey = `${week.error ? 'error' : 'empty'}-${rawDate(selectedDate)}`
    detailContent = (
      <div className="stage3-status" key={statusKey}>
        <strong>{week.error ? '급식을 불러오지 못했어' : '등록된 급식이 없어'}</strong>
        <p>
          {week.error
            ? '인터넷 연결이나 NEIS 응답을 확인해줘.'
            : `${formatDate(selectedDate)} 급식이 아직 NEIS에 등록되지 않았어.`}
        </p>
        {week.error ? <button onClick={() => schoolData.ensureMealWeek(weekOffset, true)}>다시 불러오기</button> : null}
      </div>
    )
  }

  return (
    <section className="stage3-page meal-page">
      <header className="page-header stage3-page-header">
        <p className="date-label">수지고등학교</p>
        <h1>급식</h1>
      </header>

      <div className="stage3-week-nav">
        <button onClick={() => moveWeek(-1)} aria-label="이전 주">‹</button>
        <button className="stage3-week-title" onClick={backToCurrentWeek}>
          <strong>{relativeWeekLabel(weekOffset)}</strong>
          <span>{formatWeekRange(week.dates)}</span>
        </button>
        <button onClick={() => moveWeek(1)} aria-label="다음 주">›</button>
      </div>

      <div className="stage3-day-strip">
        {week.dates.map((date, index) => (
          <button
            className={`stage3-day-button ${index === selectedIndex ? 'is-selected' : ''} ${rawDate(date) === rawDate(new Date()) ? 'is-today' : ''}`}
            onClick={() => selectDay(index)}
            key={rawDate(date)}
          >
            <strong>{WEEKDAY_LABELS[date.getDay()]}</strong>
            <span>{date.getMonth() + 1}/{date.getDate()}</span>
          </button>
        ))}
      </div>

      <section className="stage3-detail">
        <div className="stage3-detail-body stage3-detail-body-motion">
          {detailContent}
        </div>
      </section>
    </section>
  )
}
