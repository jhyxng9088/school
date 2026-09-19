import React, { useState } from 'react'
import './ios-reinstall-notice.css'

const IOS_REINSTALL_NOTICE_KEY = 'school.iosLayoutReinstallNotice.v1'

function isIOSStandalone() {
  const ua = navigator.userAgent
  const iPadDesktopUA = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  const iOSLike = /iPhone|iPad|iPod/i.test(ua) || iPadDesktopUA
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone === true
  return iOSLike && standalone
}

function shouldShowNotice() {
  if (!isIOSStandalone()) return false
  try {
    return localStorage.getItem(IOS_REINSTALL_NOTICE_KEY) !== 'dismissed'
  } catch {
    return true
  }
}

export function IOSReinstallNotice() {
  const [visible, setVisible] = useState(shouldShowNotice)

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(IOS_REINSTALL_NOTICE_KEY, 'dismissed')
    } catch {
      // Hiding for the current session is still useful when storage is unavailable.
    }
    setVisible(false)
  }

  return (
    <section className="ios-reinstall-notice" role="status" aria-label="iPhone 화면 수정 안내">
      <div>
        <p className="ios-reinstall-notice-kicker">iPhone · iPad</p>
        <h2>상단 화면이 이상하면 한 번만 다시 설치해 줘</h2>
        <p>
          최근 iOS 홈 화면 앱의 상단 표시 방식을 수정했어. 위쪽 여백이 크게 보이거나
          상태바 색이 따로 보이면 홈 화면의 S-Hub을 삭제한 뒤 Safari에서 다시 열어
          ‘홈 화면에 추가’로 설치하면 수정된 화면 설정이 적용돼.
        </p>
        <p className="ios-reinstall-notice-note">
          재설치 뒤에는 이름·학교 정보를 다시 확인해야 할 수 있어.
        </p>
      </div>
      <button type="button" onClick={dismiss}>확인했어</button>
    </section>
  )
}
