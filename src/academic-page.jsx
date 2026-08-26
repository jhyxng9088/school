import React, { useMemo, useState } from 'react'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function rawDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function dateFromKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function keyFromDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

function daysBetween(from, to) {
  return Math.round((dayStart(to) - dayStart(from)) / 86400000)
}

function isRoutineAcademic(event) {
  return /토요휴업일/.test(event.name)
}

function isImportantExam(event) {
  return /중간|기말|정기시험|정기고사|지필|1차.*(시험|고사)|2차.*(시험|고사)|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/.test(event.name)
}

function groupAcademicEvents(events) {
  const filtered = (events || [])
    .filter((event) => event?.date && event?.name && !isRoutineAcademic(event))
    .sort((a, b) => String(a.rawDate).localeCompare(String(b.rawDate)) || a.name.localeCompare(b.name))

  const groups = []
  for (const event of filtered) {
    if (event.custom) {
      groups.push({
        id: event.id,
        custom: true,
        name: event.name,
        content: event.content || '',
        dayOffType: '',
        startDate: event.date,
        endDate: event.endDate || event.date,
        startRawDate: event.rawDate,
        endRawDate: event.endRawDate || event.rawDate,
        createdByStudentKey: event.createdByStudentKey || '',
        audit: event.audit || null,
      })
      continue
    }

    const last = groups[groups.length - 1]
    const consecutive = last && !last.custom && last.name === event.name && daysBetween(last.endDate, event.date) === 1
    if (consecutive) {
      last.endDate = event.date
      last.endRawDate = event.rawDate
    } else {
      groups.push({
        id: '',
        custom: false,
        name: event.name,
        content: event.content || '',
        dayOffType: event.dayOffType || '',
        startDate: event.date,
        endDate: event.date,
        startRawDate: event.rawDate,
        endRawDate: event.rawDate,
        audit: null,
      })
    }
  }
  return groups.sort((a, b) => a.startRawDate.localeCompare(b.startRawDate) || a.name.localeCompare(b.name))
}

function dDayLabel(now, date) {
  const days = Math.max(0, daysBetween(now, date))
  return days === 0 ? '오늘' : `D-${days}`
}

function dateRange(group) {
  const start = group.startDate
  const end = group.endDate
  const startLabel = `${start.getMonth() + 1}/${start.getDate()} ${WEEKDAY_LABELS[start.getDay()]}`
  if (rawDate(start) === rawDate(end)) return startLabel
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`
}

function fullDateRange(group) {
  const start = group.startDate
  const end = group.endDate
  const startText = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ${WEEKDAY_LABELS[start.getDay()]}요일`
  if (rawDate(start) === rawDate(end)) return startText
  return `${startText} – ${end.getMonth() + 1}월 ${end.getDate()}일 ${WEEKDAY_LABELS[end.getDay()]}요일`
}

function auditLabel(audit) {
  if (!audit?.name) return ''
  return `${audit.name}이 ${audit.action === 'modified' ? '수정함' : '추가함'}`
}

function emptyDraft(now) {
  const date = keyFromDate(now)
  return { id: '', name: '', startDate: date, endDate: date }
}

function AcademicEditor({ draft, setDraft, canDelete, saving, onClose, onSave, onDelete }) {
  const valid = Boolean(draft.name.trim() && draft.startDate && draft.endDate && draft.endDate >= draft.startDate)

  return (
    <div className="academic-editor-layer" role="dialog" aria-modal="true" aria-label={draft.id ? '학사일정 수정' : '학사일정 추가'}>
      <button className="academic-editor-backdrop" type="button" aria-label="닫기" onClick={onClose} />
      <section className="academic-editor-sheet">
        <div className="academic-editor-head">
          <div>
            <p>반 학사일정</p>
            <h2>{draft.id ? '일정 수정' : '일정 추가'}</h2>
          </div>
          <button type="button" className="academic-editor-close" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <label className="academic-field">
          <span>일정 이름</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value.slice(0, 80) }))}
            placeholder="예: 진로 체험"
            autoComplete="off"
          />
        </label>

        <div className="academic-date-grid">
          <label className="academic-field">
            <span>시작</span>
            <input
              type="date"
              value={draft.startDate}
              onChange={(event) => setDraft((current) => ({
                ...current,
                startDate: event.target.value,
                endDate: current.endDate < event.target.value ? event.target.value : current.endDate,
              }))}
            />
          </label>
          <label className="academic-field">
            <span>종료</span>
            <input
              type="date"
              min={draft.startDate}
              value={draft.endDate}
              onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
            />
          </label>
        </div>

        <div className="academic-editor-actions">
          {draft.id && canDelete ? (
            <button type="button" className="academic-delete" disabled={saving} onClick={onDelete}>삭제</button>
          ) : <span />}
          <div>
            <button type="button" onClick={onClose}>취소</button>
            <button type="button" className="academic-save" disabled={!valid || saving} onClick={onSave}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function AcademicPage({ now, schoolData, academicData }) {
  const groups = useMemo(() => groupAcademicEvents(schoolData.academicEvents), [schoolData.academicEvents])
  const todayRaw = rawDate(now)
  const upcoming = groups.filter((group) => group.endRawDate >= todayRaw)
  const exam = upcoming.find((group) => isImportantExam(group)) || null
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openCreate() {
    setError('')
    setDraft(emptyDraft(now))
  }

  function openEdit(group) {
    if (!group.custom) return
    setError('')
    setDraft({
      id: group.id,
      name: group.name,
      startDate: keyFromDate(group.startDate),
      endDate: keyFromDate(group.endDate),
      createdByStudentKey: group.createdByStudentKey,
    })
  }

  async function saveDraft() {
    if (!draft || saving) return
    setSaving(true)
    setError('')
    try {
      await academicData.saveEvent(draft)
      setDraft(null)
    } catch (saveError) {
      console.error('Academic event save failed:', saveError)
      setError(saveError?.message || '학사일정을 저장하지 못했어.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteDraft() {
    if (!draft?.id || saving) return
    setSaving(true)
    setError('')
    try {
      await academicData.deleteEvent(draft.id)
      setDraft(null)
    } catch (deleteError) {
      console.error('Academic event delete failed:', deleteError)
      setError(deleteError?.message || '이 일정을 삭제할 수 없어.')
    } finally {
      setSaving(false)
    }
  }

  const draftEvent = draft?.id ? academicData.events.find((event) => event.id === draft.id) : null
  const canDeleteDraft = Boolean(draftEvent && academicData.canDelete(draftEvent))

  return (
    <section className="stage3-page academic-page academic-page-editable">
      <header className="page-header stage3-page-header academic-editable-header">
        <div>
          <p className="date-label">2학년 · 수지고등학교</p>
          <h1>학사일정</h1>
        </div>
        <button className="academic-add-button" type="button" onClick={openCreate}>추가</button>
      </header>

      {exam ? (
        <section className="academic-focus-card">
          <p>가장 가까운 중요 시험</p>
          <div><h2>{exam.name}</h2><strong>{dDayLabel(now, exam.startDate)}</strong></div>
          <span>{fullDateRange(exam)}</span>
          {auditLabel(exam.audit) ? <small className="change-attribution">{auditLabel(exam.audit)}</small> : null}
        </section>
      ) : null}

      <div className="academic-list-head">
        <h2>다가오는 일정</h2>
        <span>{upcoming.length}개</span>
      </div>

      <div className="academic-list">
        {upcoming.map((group) => (
          <article className={`academic-list-item ${isImportantExam(group) ? 'is-important' : ''} ${group.custom ? 'is-custom' : ''}`} key={group.custom ? group.id : `${group.startRawDate}-${group.name}`}>
            <div className="academic-list-date">
              <strong>{group.startDate.getDate()}</strong>
              <span>{group.startDate.getMonth() + 1}월</span>
            </div>
            <div className="academic-list-copy">
              <h3>{group.name}</h3>
              <p>{dateRange(group)}{group.dayOffType && group.dayOffType !== '해당없음' ? ` · ${group.dayOffType}` : ''}</p>
              {auditLabel(group.audit) ? <small className="change-attribution">{auditLabel(group.audit)}</small> : null}
            </div>
            <div className="academic-list-side">
              <b>{dDayLabel(now, group.startDate)}</b>
              {group.custom ? <button type="button" onClick={() => openEdit(group)}>수정</button> : null}
            </div>
          </article>
        ))}
      </div>

      {!upcoming.length ? (
        <div className="stage3-status academic-status">
          <strong>{schoolData.academicLoading ? '학사일정 불러오는 중' : schoolData.academicError ? '학사일정을 불러오지 못했어' : '다가오는 일정이 없어'}</strong>
          {schoolData.academicError ? <button onClick={() => schoolData.refreshAcademic(true)}>다시 불러오기</button> : null}
        </div>
      ) : null}

      {error ? <p className="academic-page-error">{error}</p> : null}
      {draft ? (
        <AcademicEditor
          draft={draft}
          setDraft={setDraft}
          canDelete={canDeleteDraft}
          saving={saving}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          onDelete={deleteDraft}
        />
      ) : null}
    </section>
  )
}
