import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewBoard } from './preview-board-complete.jsx'

const now = Date.now()

globalThis.__S_HUB_E2E_BOARD_FIXTURE__ = {
  activeSectionId: 'all',
  sections: [
    { id: 'general', label: '일반', color: '#90939a', builtin: true, ownedByMe: false },
    { id: 'question', label: '질문', color: '#7c83ff', builtin: true, ownedByMe: false },
    { id: 'notes', label: '필기', color: '#56a781', builtin: true, ownedByMe: false },
  ],
  posts: [
    {
      id: 'e2e-board-post',
      sectionId: 'general',
      kind: 'general',
      resolved: false,
      title: 'E2E 게시글',
      body: 'Bottom Sheet 닫기 lifecycle 검증용 게시글입니다.',
      authorName: '테스트 학생',
      authorStudentKey: 'e2e-owner',
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
      comments: [],
      attachments: [],
    },
  ],
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PreviewBoard profile={{ name: '테스트 학생', classNumber: 1, studentNumber: 1 }} />
  </React.StrictMode>,
)
