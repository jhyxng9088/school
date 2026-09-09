import React, { useEffect, useMemo, useRef, useState } from 'react'
import { maxGradeForSchoolKind, searchNeisSchools } from './school-directory.js'
import './school-setup.css'

export function StudentSetup({ initialName = '', onSave }) {
  const [schoolQuery, setSchoolQuery] = useState('')
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [schoolResults, setSchoolResults] = useState([])
  const [schoolSearching, setSchoolSearching] = useState(false)
  const [schoolError, setSchoolError] = useState('')
  const [grade, setGrade] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState(initialName)
  const requestRef = useRef(null)

  const trimmed = name.trim()
  const gradeValue = Number(grade)
  const classValue = Number(classNumber)
  const studentValue = Number(studentNumber)
  const maxGrade = selectedSchool ? maxGradeForSchoolKind(selectedSchool.schoolKind) : 3
  const gradeOptions = useMemo(() => Array.from({ length: maxGrade }, (_, index) => index + 1), [maxGrade])
  const validGrade = Number.isInteger(gradeValue) && gradeValue >= 1 && gradeValue <= maxGrade
  const validClass = Number.isInteger(classValue) && classValue >= 1 && classValue <= 30
  const validStudent = Number.isInteger(studentValue) && studentValue >= 1 && studentValue <= 60
  const canSubmit = Boolean(selectedSchool && trimmed && validGrade && validClass && validStudent)

  useEffect(() => {
    const term = schoolQuery.trim()
    if (selectedSchool && term === selectedSchool.schoolName) {
      setSchoolResults([])
      setSchoolSearching(false)
      setSchoolError('')
      return undefined
    }
    if (term.length < 2) {
      requestRef.current?.abort()
      requestRef.current = null
      setSchoolResults([])
      setSchoolSearching(false)
      setSchoolError('')
      return undefined
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      setSchoolSearching(true)
      setSchoolError('')
      try {
        const results = await searchNeisSchools(term, controller.signal)
        if (controller.signal.aborted) return
        setSchoolResults(results)
        if (!results.length) setSchoolError('검색 결과가 없어요. 학교 이름을 조금 더 정확히 입력해 주세요.')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setSchoolResults([])
        setSchoolError('학교 검색에 실패했어요. 인터넷 연결을 확인하고 다시 입력해 주세요.')
      } finally {
        if (requestRef.current === controller) requestRef.current = null
        if (!controller.signal.aborted) setSchoolSearching(false)
      }
    }, 260)

    return () => window.clearTimeout(timer)
  }, [schoolQuery, selectedSchool])

  useEffect(() => () => requestRef.current?.abort(), [])

  function updateSchoolQuery(value) {
    setSchoolQuery(value.slice(0, 60))
    if (selectedSchool && value !== selectedSchool.schoolName) {
      setSelectedSchool(null)
      setGrade('')
    }
  }

  function chooseSchool(school) {
    setSelectedSchool(school)
    setSchoolQuery(school.schoolName)
    setSchoolResults([])
    setSchoolError('')
    setGrade('')
  }

  function submit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onSave({
      name: trimmed,
      grade: gradeValue,
      classNumber: classValue,
      studentNumber: studentValue,
      officeCode: selectedSchool.officeCode,
      schoolCode: selectedSchool.schoolCode,
      schoolName: selectedSchool.schoolName,
      schoolKind: selectedSchool.schoolKind,
      regionName: selectedSchool.regionName,
      address: selectedSchool.address,
    })
  }

  return (
    <main className="onboarding-page">
      <form className="onboarding-card name-card" onSubmit={submit}>
        <p className="eyebrow">마지막 설정</p>
        <h1>학교와 학생 정보를 알려 주세요</h1>
        <p className="onboarding-copy">학교를 검색해 선택하면 NEIS 시간표·급식·학사일정을 선택한 학교 기준으로 연결해요. 같은 학교·학년·반 친구끼리 S-Hub 공유 정보가 연결돼요.</p>

        <label className="name-field school-search-field">
          <span>학교</span>
          <input
            value={schoolQuery}
            onChange={(event) => updateSchoolQuery(event.target.value)}
            placeholder="학교 이름 검색"
            autoComplete="off"
            autoFocus
            aria-autocomplete="list"
            aria-expanded={schoolResults.length > 0}
          />
          {selectedSchool ? (
            <div className="school-search-status">
              <strong>NEIS 연결됨</strong>
              <span>{[selectedSchool.regionName, selectedSchool.schoolKind].filter(Boolean).join(' · ')}</span>
            </div>
          ) : schoolSearching ? (
            <div className="school-search-status"><span>학교 찾는 중…</span></div>
          ) : schoolError ? (
            <div className="school-search-status"><span>{schoolError}</span></div>
          ) : schoolQuery.trim().length === 1 ? (
            <div className="school-search-status"><span>두 글자 이상 입력하면 검색해요.</span></div>
          ) : null}

          {schoolResults.length ? (
            <div className="school-search-results" role="listbox" aria-label="학교 검색 결과">
              {schoolResults.map((school) => (
                <button
                  className="school-search-result"
                  type="button"
                  role="option"
                  key={`${school.officeCode}-${school.schoolCode}`}
                  onClick={() => chooseSchool(school)}
                >
                  <strong>{school.schoolName}</strong>
                  <span>{[school.regionName, school.schoolKind, school.address].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <div className="student-setup-grid">
          <label className="name-field">
            <span>학년</span>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              disabled={!selectedSchool}
              aria-label="학년"
            >
              <option value="">선택</option>
              {gradeOptions.map((value) => <option value={value} key={value}>{value}학년</option>)}
            </select>
          </label>
          <label className="name-field">
            <span>반</span>
            <input
              value={classNumber}
              onChange={(event) => setClassNumber(event.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="예: 7"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className="name-field">
            <span>번호</span>
            <input
              value={studentNumber}
              onChange={(event) => setStudentNumber(event.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="예: 18"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
        </div>

        <label className="name-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름 입력"
            autoComplete="name"
            maxLength={20}
          />
        </label>
        <button className="primary-button" disabled={!canSubmit}>시작하기</button>
      </form>
    </main>
  )
}
