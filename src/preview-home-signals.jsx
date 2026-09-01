import { useEffect, useMemo, useState } from 'react'
import { usePreviewBoardUnread } from './preview-board-unread.js'
import { previewStudyUnreadSnapshot, subscribePreviewStudyUnread } from './preview-study-unread.js'
import './preview-home-signals.css'

function safeCount(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function activeReminderCount(todos) {
  return (Array.isArray(todos) ? todos : []).filter((todo) => todo && !todo.completed && !todo.hidden).length
}

function signalCopy({ boardUnread, studyUnread, presence, todos }) {
  const online = safeCount(presence?.online)
  const total = safeCount(presence?.total)
  const boardCount = safeCount(boardUnread?.sectionUnreadCount)
  const reminderCount = activeReminderCount(todos)

  return [
    {
      id: 'class',
      label: '우리 반',
      value: total > 0 ? `${online}/${total}명` : `${online}명`,
      detail: online > 0 ? '현재 접속 중' : '현재 접속 없음',
      active: online > 0,
    },
    {
      id: 'board',
      label: '게시판',
      value: boardCount > 0 ? `${boardCount}개` : '0개',
      detail: boardCount > 0 ? '새 게시글·업데이트' : '새 소식 없음',
      active: boardCount > 0,
    },
    {
      id: 'study',
      label: '스터디',
      value: studyUnread?.hasUnread ? '새 활동' : '확인 완료',
      detail: studyUnread?.hasUnread ? '친구가 공부를 시작했어요' : '새 공부 시작 알림 없음',
      active: Boolean(studyUnread?.hasUnread),
    },
    {
      id: 'reminder',
      label: '리마인더',
      value: `${reminderCount}개`,
      detail: reminderCount > 0 ? '아직 남아 있어요' : '남은 리마인더 없음',
      active: reminderCount > 0,
    },
  ]
}

export function PreviewHomeSignals({ profile, presence, todos, onNavigate }) {
  const boardUnread = usePreviewBoardUnread(profile)
  const [studyUnread, setStudyUnread] = useState(() => previewStudyUnreadSnapshot(profile))

  useEffect(() => subscribePreviewStudyUnread(profile, setStudyUnread), [profile])

  const signals = useMemo(
    () => signalCopy({ boardUnread, studyUnread, presence, todos }),
    [boardUnread, studyUnread, presence, todos],
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
          <article
            className={`preview-home-signal ${signal.active ? 'is-active' : ''}`}
            key={signal.id}
            role="button"
            tabIndex={0}
            aria-label={`${signal.label} 열기`}
            onClick={() => onNavigate?.(signal.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onNavigate?.(signal.id)
            }}
          >
            <div className="preview-home-signal-head">
              <span>{signal.label}</span>
              <i aria-hidden="true" />
            </div>
            <strong>{signal.value}</strong>
            <p>{signal.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
