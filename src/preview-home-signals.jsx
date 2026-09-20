import { useEffect, useMemo, useState } from 'react'
import { usePreviewBoardUnread } from './preview-board-unread.js'
import { previewStudyUnreadSnapshot, subscribePreviewStudyUnread } from './preview-study-unread.js'
import './preview-home-signals.css'

function safeCount(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function activeReminders(todos) {
  return (Array.isArray(todos) ? todos : [])
    .filter((todo) => todo && !todo.completed && !todo.hidden)
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
      || String(a.dueTime || '').localeCompare(String(b.dueTime || '')))
}

function activeReminderCount(todos) {
  return activeReminders(todos).length
}

function reminderDeadlineCopy(todo, now) {
  if (!todo?.dueDate) return '예정'
  const [year, month, day] = String(todo.dueDate).split('-').map(Number)
  if (!year || !month || !day) return '예정'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
  const due = new Date(year, month - 1, day, 12, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '내일'
  return `D-${days}`
}

function signalCopy({ boardUnread, studyUnread, presence, todos, now }) {
  const online = safeCount(presence?.online)
  const total = safeCount(presence?.total)
  const presenceReady = presence?.ready === true
  const studyReady = studyUnread?.initialized !== false
  const boardCount = safeCount(boardUnread?.sectionUnreadCount)
  const reminderCount = activeReminderCount(todos)
  const nextReminder = activeReminders(todos)[0] || null

  return [
    {
      id: 'class',
      label: '우리 반',
      value: presenceReady ? (total > 0 ? `${online}/${total}명` : `${online}명`) : (total > 0 ? `—/${total}명` : '—'),
      detail: presenceReady ? (online > 0 ? '현재 접속 중' : '현재 접속 없음') : '접속 상태 확인 중',
      active: presenceReady && online > 0,
      pending: !presenceReady,
    },
    {
      id: 'board',
      label: '게시판',
      value: boardCount > 0 ? `${boardCount}개` : '0개',
      detail: boardCount > 0 ? '새 게시글·업데이트' : '새 소식 없음',
      active: boardCount > 0,
      pending: false,
    },
    {
      id: 'study',
      label: '스터디',
      value: studyReady ? (studyUnread?.hasUnread ? '새 활동' : '확인 완료') : '—',
      detail: studyReady ? (studyUnread?.hasUnread ? '친구가 공부를 시작했어요' : '새 공부 시작 알림 없음') : '스터디 상태 확인 중',
      active: studyReady && Boolean(studyUnread?.hasUnread),
      pending: !studyReady,
    },
    {
      id: 'reminder',
      label: '리마인더',
      value: nextReminder ? reminderDeadlineCopy(nextReminder, now) : '없음',
      detail: nextReminder ? String(nextReminder.title || '다가오는 리마인더') : '남은 리마인더 없음',
      active: reminderCount > 0,
      pending: false,
    },
  ]
}

export function PreviewHomeSignals({ profile, presence, todos, now, onNavigate }) {
  const boardUnread = usePreviewBoardUnread(profile)
  const [studyUnread, setStudyUnread] = useState(() => previewStudyUnreadSnapshot(profile))

  useEffect(() => subscribePreviewStudyUnread(profile, setStudyUnread), [profile])

  const signals = useMemo(
    () => signalCopy({ boardUnread, studyUnread, presence, todos, now }),
    [boardUnread, studyUnread, presence, todos, now],
  )

  return (
    <section
      className="home-section preview-home-signals"
      aria-label="S-Hub 한눈에 보기"
      data-home-nav-ready="true"
    >
      <div className="section-heading preview-home-signals-heading">
        <h2>한눈에 보기</h2>
        <span>실시간</span>
      </div>
      <div className="preview-home-signals-grid">
        {signals.map((signal) => (
          <button
            type="button"
            className={`preview-home-signal ${signal.active ? 'is-active' : ''} ${signal.pending ? 'is-pending' : ''}`}
            key={signal.id}
            aria-label={`${signal.label} 열기`}
            onClick={() => onNavigate?.(signal.id)}
          >
            <div className="preview-home-signal-head">
              <span>{signal.label}</span>
              <i aria-hidden="true" />
            </div>
            <strong>{signal.value}</strong>
            <p>{signal.detail}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
