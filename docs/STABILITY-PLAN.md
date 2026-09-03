# S-Hub Stability Plan

이 문서는 S-Hub V2 안정화 작업의 진행 상태를 기록한다. **작업을 재개할 때는 이 문서만 믿지 말고 항상 최신 `main`과 현재 파일을 다시 확인한다.**

기준 시점: 2026-09-04 KST
기록 기준 HEAD: `0e238c1648afa7ed3441a8c1805634e69957b65f`

## 완료된 구조 단일화

### Semantic navigation / input ownership

- DOM 버튼을 찾아 synthetic `.click()`으로 이동시키는 경로를 줄이고 semantic navigation owner로 이동했다.
- 반 명단 진입은 렌더 후 DOM을 버튼으로 개조하는 방식 대신 실제 React interactive owner가 직접 action을 실행하는 방향으로 정리했다.
- 새 navigation 기능은 visible text나 DOM 순서에 의존하지 않는다.

### Shared original file viewer

- 게시판과 리마인더의 원본 이미지/파일 viewer 중복 구현을 `OriginalFileViewer`로 통합했다.
- Apple share fallback, 일반 다운로드, 중복 저장 방지, close lifecycle 등의 공통 책임을 shared owner에 모았다.
- 이후 추가된 게시판 댓글 첨부도 기존 attachment UI와 shared original viewer를 재사용하는 방향으로 연결됐다.

### Single Service Worker update owner

- `index.html`과 React entry가 각각 update를 호출하던 중복 경로를 제거했다.
- Service Worker 등록/업데이트 lifecycle은 한 경로가 소유한다.
- 중복 update가 다시 추가되지 않도록 회귀 테스트를 두었다.

### Shared runtime icon owner

- 최종 런타임 아이콘은 `SHubIcon` registry를 source of truth로 사용하도록 정리했다.
- 기존 build patch의 중간 marker 호환성은 당장 깨지지 않도록 유지하고, 최종 transform에서 shared owner로 수렴시키는 방식으로 전환했다.

## 다음 우선순위

### 1. Motion / SegmentedControl 단일화

대상:

- 하단 navigation spring
- 우리반 상단 segmented pill
- 일정 segmented pill
- Study 오늘/전체 및 우리반/전교 pill

목표:

- 공통 spring primitive와 motion token 정의
- 공통 `SegmentedControl` 또는 동등한 shared primitive 사용
- 각 feature가 physics 계산을 복사하지 않도록 정리
- 60Hz/120Hz와 reduced motion 검증

주의: 모든 animation을 하나의 함수로 합치지 않는다. 같은 유형의 motion만 공통화한다.

### 2. Remaining overlay/dialog ownership

- class roster modal의 manual DOM/overlay 잔여 구조 점검
- Reminder Summary의 고유 expand/collapse는 유지하되 공통 lifecycle 재사용 범위 검토
- first-run / V2 update feature tour의 swipe/carousel engine 중복 통합

### 3. Unread declarative state

현재 남아 있는 DOM post-processing을 단계적으로 제거한다.

목표:

```text
data source
-> unread state/service
-> React component
-> UnreadDot
```

제거 대상:

- DOM에 unread child를 사후 append하는 로직
- visible text 기반 unread key 추론
- 내부 React DOM을 감시하는 unread MutationObserver

### 4. Internal MutationObserver / runtime post-processor cleanup

점검 대상:

- home live DOM 후처리
- timetable motion 후처리
- unread DOM key 보정
- polite-copy runtime DOM 치환
- 기타 document-level listener / interval / observer

원칙: 외부 변화를 감지하는 Observer는 유지할 수 있지만, **React가 직접 렌더한 DOM을 다시 조립하는 Observer는 제거 대상**이다.

### 5. Build-time patch migration/removal

가장 위험한 단계다. 반드시 전용 safety checkpoint를 만든다.

한 patch씩:

```text
patch 최종 효과 확인
-> 실제 source/component에 구현
-> 관련 회귀 테스트
-> 해당 patch 하나만 비활성/제거
-> npm test
-> Chromium/WebKit E2E
-> production build
-> commit/checkpoint
```

여러 patch를 한 번에 제거하지 않는다.

### 6. Data layer audit

점검 항목:

- 중복 Firestore subscription
- 불필요한 polling/interval
- 화면 unmount 후 남는 listener
- presence/read/unread/study/board 데이터 owner
- localStorage/cache와 network source의 책임 구분

기능 실시간성은 보존하면서 읽기/리스너 중복을 줄이는 것이 목표다.

### 7. Performance profiling

측정 후 수정한다.

- React render count
- document-level listener 수
- MutationObserver callback 빈도
- requestAnimationFrame loop
- layout measurement / reflow
- API/Firestore 호출
- modal drag / scroll / rapid tab switching frame drop

### 8. Full E2E coverage

최종적으로 다음 흐름을 자동화한다.

- Home -> 각 station
- 우리반 시간표/게시판
- Study 범위/기간 selector
- 일정 하위 메뉴
- 주요 Bottom Sheet open/close
- unread
- semantic notification routing
- cold start / cached start / offline -> online
- Chromium/WebKit + 주요 mobile/tablet viewport

### 9. Legacy removal

새 owner가 완전히 검증된 뒤에만 삭제한다.

- obsolete preview patch
- production recovery shim
- dead runtime DOM enhancer
- 중복 CSS
- 사용되지 않는 event/listener/helper

삭제 자체를 목표로 하지 않는다. **기능을 새 owner가 완전히 대체했다는 증거가 있을 때만 삭제한다.**

## 단계 완료 조건

각 단계는 다음 조건을 만족해야 완료로 표시한다.

1. 최신 `main` 기반 작업
2. 필요한 safety checkpoint 존재
3. 관련 unit/regression test 성공
4. production build 성공
5. UI 관련 변경이면 Chromium/WebKit E2E 성공
6. backend 영향이 있으면 backend test 성공
7. GitHub Actions 성공
8. 배포 상태가 pending/failed가 아님

## 업데이트 시 유지해야 할 핵심 원칙

- 기능 추가 때문에 새 synthetic click, DOM text routing, 내부 DOM MutationObserver를 만들지 않는다.
- 이미 존재하는 shared primitive를 먼저 사용한다.
- 한 기능을 수정하면서 다른 feature의 owner를 몰래 만들지 않는다.
- 기존 UI/기능을 보존하는 작은 migration을 반복한다.
