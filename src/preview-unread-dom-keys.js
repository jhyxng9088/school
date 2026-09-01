const SEGMENT_LABEL_TO_KEY = {
  '시간표': 'timetable',
  '게시판': 'board',
  '리마인더': 'todo',
  '학사일정': 'academic',
  '급식': 'meal',
}

function annotateUnreadSegments(root = document) {
  root.querySelectorAll?.('.class-top-segment-button').forEach((button) => {
    const key = SEGMENT_LABEL_TO_KEY[String(button.textContent || '').trim()] || ''
    if (key && button.dataset.unreadKey !== key) button.dataset.unreadKey = key
  })
}

function boot() {
  annotateUnreadSegments()
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue
        if (node.matches?.('.class-top-segment-button')) annotateUnreadSegments(node.parentElement || node)
        else if (node.querySelector?.('.class-top-segment-button')) annotateUnreadSegments(node)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
else boot()
