import React, { useMemo, useState } from 'react'
import './academic-shared.css'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function pad(value) {
  return String(value).padStart(2, '0')
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function rawDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function dateFromKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function daysBetween(from, to) {
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12)
  const second = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 12)
  return Math.max(0, Math.round((second - first) / 86400000))
}

function isRoutineAcademic(event) {
  return /토요휴업일/.test(String(event?.name || event?.title || ''))
}

function isImportantExam(event) {
  return /중간|기말|정기시험|정기고사|지필|1차.*(시험|고사)|2차.*(시험|고사)|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/.test(String(event?.name || event?.title || ''))
}

function groupOfficialEvents(events) {
  const filtered = (events || [])
    .filter((event) => event?.date && event?.name && !isRoutineAcademic(event))
    .sort((a, b) => String(a.rawDate).localeCompare(String(b.rawDate)) || String(a.name).localeCompare(String(b.name)))
  const groups = []
  for (const event of filtered) {
    const last = groups[groups.length - 1]
    const consecutive = last && last.title === event.name && daysBetween(last.endDate, event.date) === 1
    if (consecutive) {
      last.endDate = event.date
      last.endRawDate = event.rawDate
      continue
    }
    groups.push({
      id: `official-${event.rawDate}-${event.name}`,
      source: 'official',
      title: event.name,
      detail: event.content || '',
      dayOffType: event.dayOffType || '',
      startDate: event.date,
      endDate: event.date,
      startRawDate: event.rawDate,
      endRawDate: event.rawDate,
    })
  }
  return groups
}

function customGroup(event) {
  const startDate = dateFromKey(event.startDate)
  const endDate = dateFromKey(event.endDate)
  if (!startDate || !endDate) return null
  return {
    ...event,
    source: 'custom',
    startDate,
    endDate,
    startRawDate: rawDate(startDate),
    endRawDate: rawDate(endDate),
  }
}

function allGroups(schoolData, academicData) {
  return [
    ...groupOfficialEvents(schoolData?.academicEvents),
    ...(academicData?.events || []).map(customGroup).filter(Boolean),
  ].sort((a, b) => a.startRawDate.localeCompare(b.startRawDate) || a.title.localeCompare(b.title))
}

function dDayLabel(now, date) {
  const days = daysBetween(now, date)
  return days === 0 ? '오늘' : `D-${days}`
}

function dateRangeLabel(group) {
  const start = group.startDate
  const end = group.endDate
  if (rawDate(start) === rawDate(end)) return `${start.getMonth() + 1}/${start.getDate()} ${WEEKDAY_LABELS[start.getDay()]}`
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`
}

function attribution(event) {
  if (event.source !== 'custom' || !event.lastEditedByName) return ''
  return `${event.lastEditedByName}이 ${event.lastAction === 'added' ? '추가함' : '수정함'}`
}

function emptyDraft(now) {
  const today = dateKey(now)
  return { id: '', title: '', startDate: today, endDate: today, detail: '' }
}

export function SharedAcademicPreview({ now, schoolData, academicData }) {
  const groups = useMemo(() => allGroups(schoolData, academicData), [schoolData?.academicEvents, academicData?.events])
  const today = rawDate(now)
  const upcoming = groups.filter((group) => group.endRawDate >= today)
  const exam = upcoming.find(isImportantExam) || null
  const others = upcoming.filter((group) => group !== exam).slice(0, exam ? 2 : 3)

  return (
    <section className="home-section stage3-home-block academic-preview">
      <div className="section-heading"><h2>학사일정</h2></div>
      <div className="academic-home-list">
        {exam ? (
          <div className="academic-home-item is-important">
            <div>
              <span>{exam.source === 'custom' ? dateRangeLabel(exam) : '시험'}</span>
              <strong>{exam.title}</strong>
              {attribution(exam) ? <small className="activity-attribution">{attribution(exam)}</small> : null}
            </div>
            <b>{dDayLabel(now, exam.startDate)}</b>
          </div>
        ) : null}
        {others.map((group) => (
          <div className="academic-home-item" key={group.id}>
            <div>
              <span>{dateRangeLabel(group)}</span>
              <strong>{group.title}</strong>
              {attribution(group) ? <small className="activity-attribution">{attribution(group)}</small> : null}
            </div>
            <b>{dDayLabel(now, group.startDate)}</b>
          </div>
        ))}
        {!exam && !others.length ? (
          <p className="stage3-home-muted">
            {schoolData?.academicLoading ? '학사일정 불러오는 중…' : schoolData?.academicError ? '학사일정을 불러오지 못했어.' : '다가오는 학사일정이 없어.'}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function SharedAcademicPage({ now, schoolData, academicData }) {
  const groups = useMemo(() => allGroups(schoolData, academicData), [schoolData?.academicEvents, academicData?.events])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState(() => emptyDraft(now))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const todayRaw = rawDate(now)
  const upcoming = groups.filter((group) => group.endRawDate >= todayRaw)
  const exam = upcoming.find(isImportantExam) || null

  function openCreate() {
    setDraft(emptyDraft(now))
    setError('')
    setSheetOpen(true)
  }

  function openEdit(group) {
    if (group.source !== 'custom') return
    setDraft({
      id: group.id,
      title: group.title,
      startDate: dateKey(group.startDate),
      endDate: dateKey(group.endDate),
      detail: group.detail || '',
    })
    setError('')
    setSheetOpen(true)
  }

  async function save() {
    if (!draft.title.trim() || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate || saving) return
    setSaving(true)
    setError('')
    try {
      await academicData.saveEvent(draft)
      setSheetOpen(false)
    } catch (saveError) {
      setError(saveError?.message || '학사일정을 저장하지 못했어.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft.id || saving) return
    setSaving(true)
    setError('')
    try {
      await academicData.deleteEvent(draft.id)
      setSheetOpen(false)
    } catch (deleteError) {
      setError(deleteError?.message || '학사일정을 삭제하지 못했어.')
    } finally {
      setSaving(false)
    }
  }

  const editingEvent = draft.id ? academicData.events.find((event) => event.id === draft.id) : null
  const canDelete = Boolean(editingEvent && editingEvent.creatorStudentKey === academicData.studentKey)

  return (
    <section className="stage3-page academic-page shared-academic-page">
      <header className="page-header stage3-page-header shared-academic-header">
        <div>
          <p className="date-label">2학년 · 수지고등학교</p>
          <h1>학사일정</h1>
        </div>
        <button className="academic-add-button" type="button" onClick={openCreate}>추가</button>
      </header>

      {exam ? (
        <section className="academic-focus-card">
          <p>가장 가까운 중요 시험</p>
          <div><h2>{exam.title}</h2><strong>{dDayLabel(now, exam.startDate)}</strong></div>
          <span>{dateRangeLabel(exam)}</span>
          {attribution(exam) ? <small className="activity-attribution">{attribution(exam)}</small> : null}
        </section>
      ) : null}

      <div className="academic-list-head"><h2>다가오는 일정</h2><span>{upcoming.length}개</span></div>
      <div className="academic-list">
        {upcoming.map((group) => (
          <article className={`academic-list-item ${isImportantExam(group) ? 'is-important' : ''} ${group.source === 'custom' ? 'is-custom' : ''}`} key={group.id}>
            <div className="academic-list-date">
              <strong>{group.startDate.getDate()}</strong>
              <span>{group.startDate.getMonth() + 1}월</span>
            </div>
            <div className="academic-list-copy">
              <h3>{group.title}</h3>
              <p>{dateRangeLabel(group)}{group.detail ? ` · ${group.detail}` : group.dayOffType && group.dayOffType !== '해당없음' ? ` · ${group.dayOffType}` : ''}</p>
              {attribution(group) ? <small className="activity-attribution">{attribution(group)}</small> : null}
            </div>
            <div className="academic-item-actions">
              <b>{dDayLabel(now, group.startDate)}</b>
              {group.source === 'custom' ? <button type="button" onClick={() => openEdit(group)}>수정</button> : null}
            </div>
          </article>
        ))}
      </div>

      {!upcoming.length ? (
        <div className="stage3-status academic-status">
          <strong>{schoolData?.academicLoading ? '학사일정 불러오는 중' : schoolData?.academicError ? '학사일정을 불러오지 못했어' : '다가오는 일정이 없어'}</strong>
          {schoolData?.academicError ? <button onClick={() => schoolData.refreshAcademic(true)}>다시 불러오기</button> : null}
        </div>
      ) : null}

      {sheetOpen ? (
        <section className="change-editor academic-editor" data-school-sheet>
          <div className="change-editor-head">
            <div>
              <h2>{draft.id ? '학사일정 수정' : '학사일정 추가'}</h2>
              <p>반 전체에 바로 공유돼.</p>
            </div>
          </div>
          <div className="change-form academic-form">
            <label className="change-field full">
              <span>일정 이름</span>
              <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 80) }))} placeholder="예: 체육대회" autoComplete="off" />
            </label>
            <label className="change-field">
              <span>시작일</span>
              <input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} />
            </label>
            <label className="change-field">
              <span>종료일</span>
              <input type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
            </label>
            <label className="change-field full">
              <span>메모 · 선택</span>
              <input value={draft.detail} onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value.slice(0, 500) }))} placeholder="필요한 설명이 있으면 적어." autoComplete="off" />
            </label>
            {error ? <p className="change-warning">{error}</p> : null}
            {draft.id ? (
              canDelete
                ? <button className="academic-delete-button" type="button" onClick={remove} disabled={saving}>삭제</button>
                : <p className="academic-delete-owner-note">삭제는 이 일정을 처음 추가한 학생만 할 수 있어.</p>
            ) : null}
            <div className="change-submit-row">
              <button type="button" onClick={() => setSheetOpen(false)}>취소</button>
              <button className="save-change" type="button" onClick={save} disabled={saving || !draft.title.trim() || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
