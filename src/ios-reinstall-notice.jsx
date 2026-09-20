import React, { useState } from 'react'
import './ios-reinstall-notice.css'

const IOS_REINSTALL_NOTICE_KEY = 'school.iosLayoutReinstallNotice.v2'

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
          iOS 홈 화면 앱의 상태바 영역 계산 방식을 다시 수정했어. 위쪽 여백이 크게 보이거나
          상태바와 앱 화면이 따로 노는 경우에는 기존 S-Hub을 삭제한 뒤 Safari에서 다시 열어
          ‘홈 화면에 추가’로 설치해야 새 상태바 설정이 설치 시점부터 적용돼.
        </p>
        <p className="ios-reinstall-notice-note">
          재설치 뒤에는 이름·학교 정보를 다시 확인해야 할 수 있어.
        </p>
      </div>
      <button type="button" onClick={dismiss}>확인했어</button>
    </section>
  )
}
