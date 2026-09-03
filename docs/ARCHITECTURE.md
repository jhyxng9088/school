# S-Hub Architecture Guardrails

이 문서는 S-Hub의 기능을 추가하거나 UI를 변경할 때 지켜야 하는 구조 원칙을 정의한다. 목표는 기능 추가 자체보다 **한 곳을 수정했을 때 다른 기능이 예상치 못하게 깨지는 확률을 낮추는 것**이다.

> 핵심 원칙: **같은 책임에는 주인이 하나만 존재한다.**

이 문서는 특정 시점의 구현 세부사항보다 우선하는 장기 구조 기준이다. 실제 수정 전에는 반드시 최신 `main`과 현재 파일을 다시 확인한다.

## 1. 책임 소유권

### Navigation

- 앱 내부 이동은 semantic route/action이 소유한다.
- React가 이미 마운트된 뒤 `querySelector(...).click()`으로 다른 버튼을 대신 누르지 않는다.
- 표시 문자열(예: `게시판`, `시간표`)을 읽어서 route를 추론하지 않는다.
- 새 화면/하위 화면은 명시적인 route key 또는 state로 연결한다.

### Interactive UI

- 버튼처럼 동작하는 요소는 실제 `<button>` 또는 해당 역할을 가진 React component가 직접 action을 호출한다.
- 렌더 후 외부 스크립트가 `role="button"`, `tabindex`, click/keydown listener를 주입해 버튼으로 개조하지 않는다.
- `pointerdown`과 `click`이 같은 상태를 서로 다른 owner에서 중복 변경하지 않는다.
- `nth-of-type`, 화면에 보이는 텍스트, DOM 순서에 기능을 연결하지 않는다. `data-*`, prop, semantic id 같은 명시적 키를 사용한다.

### Overlay / Modal

- 일반 Bottom Sheet는 `UnifiedBottomSheet` 계열을 우선 사용한다.
- 원본 이미지/파일 확인과 저장·공유는 `OriginalFileViewer`를 재사용한다.
- portal, backdrop, scroll lock, 닫기 lifecycle, drag/close motion을 기능별로 다시 구현하지 않는다.
- Reminder Summary처럼 고유한 expand/collapse UX가 필요한 경우에도 공통 lifecycle primitive를 재사용할 수 있는지 먼저 검토한다.

### Icons

- 실제 런타임 아이콘의 최종 source of truth는 `SHubIcon` registry다.
- 같은 의미의 SVG를 기능 파일마다 복사하지 않는다.
- AI Orb처럼 제품 정체성을 가진 특수 오브젝트는 일반 아이콘 registry와 분리할 수 있다.

### Motion

- 공통 spring/motion token을 우선 사용한다.
- Bottom navigation, segmented pill, sheet, list/page transition은 각 유형별 primitive로 통합한다.
- 모든 애니메이션을 하나의 함수로 억지로 통일하지 않는다. 역할이 다른 motion은 별도 primitive를 가진다.
- `prefers-reduced-motion`을 보존한다.

### Unread

- 목표 구조는 `data source -> unread state/store -> React -> <UnreadDot />`이다.
- 앱이 직접 렌더한 DOM에 `<i>`를 `appendChild()`해서 unread를 표시하는 방식을 신규 코드에 추가하지 않는다.
- 표시 텍스트를 읽어 unread key를 추론하지 않는다.

### PWA / Service Worker

- Service Worker 등록/업데이트 lifecycle은 한 owner만 가진다.
- 현재 정책은 앱 진입점에서 등록하고 update lifecycle을 관리하는 것이다.
- `index.html`이나 별도 runtime script가 별도로 `registration.update()`를 호출하지 않는다.

## 2. React DOM 소유권

S-Hub 내부 React가 직접 렌더한 DOM은 React가 소유한다.

다음 패턴은 신규 구현에 사용하지 않는다.

```text
React render
-> MutationObserver / document listener
-> DOM을 다시 탐색
-> class/role/listener/child를 사후 주입
-> 기능 실행
```

목표 흐름은 다음과 같다.

```text
user input
-> React Button / component
-> explicit action
-> state/service
-> render
```

`MutationObserver`는 브라우저/외부 시스템이 실제로 DOM을 변경해 앱이 그 변화를 감지해야 하는 경우에만 사용한다. 앱 자신의 렌더 결과를 다시 가공하기 위한 Observer는 제거 대상이다.

## 3. Build-time patch 정책

현재 S-Hub에는 역사적으로 여러 build-time source patch가 존재한다. 이들은 **호환 계층**으로 취급하고 신규 기능의 기본 구현 수단으로 사용하지 않는다.

- 신규 기능을 위해 새 문자열 치환 patch를 추가하는 것을 기본적으로 금지한다.
- 기존 patch가 필요한 경우 현재 source와 적용 순서를 먼저 확인한다.
- patch 제거는 한 번에 하지 않는다.
- 최종 동작을 실제 source/component에 먼저 옮긴 뒤 해당 patch 하나만 제거한다.
- patch 하나를 제거할 때마다 unit test, production build, 관련 E2E를 통과시킨다.
- exact-string patch가 다른 patch의 marker로 사용되는 경우 의존 관계를 먼저 끊는다.

## 4. 새 기능을 추가하는 순서

새 기능은 먼저 기존 owner/primitive를 찾는다.

```text
새 요구사항
-> 기존 Navigation / Button / Icon / Overlay / Motion / Data primitive 확인
-> 재사용 가능하면 기존 owner에 연결
-> 정말 새로운 책임일 때만 새 component/service 생성
-> 회귀 테스트
-> build / E2E / deploy 검증
```

기존 primitive를 재사용할 수 있는데 기능별 복제본을 만들지 않는다. 예를 들어 게시판 댓글 첨부처럼 기존 attachment card와 shared viewer를 그대로 조합하는 방식이 우선이다.

## 5. 동시 작업 안전 규칙

여러 채팅/작업이 같은 저장소를 동시에 수정할 수 있으므로 다음 순서를 고정한다.

1. 작업 시작 직전 `main` HEAD SHA를 다시 확인한다.
2. 최근 커밋을 확인한다.
3. 관련 파일을 최신 HEAD에서 다시 읽는다.
4. 과거에 읽은 코드나 기억만 기준으로 수정하지 않는다.
5. 위험 작업은 별도 safety branch/tag/checkpoint를 만든다.
6. 반영 직전 `main` HEAD를 다시 확인한다.
7. `main`이 바뀌었다면 변경 파일이 겹치는지 확인하고 최신 HEAD 위에서 다시 작업한다.
8. 강제 push로 다른 작업을 덮지 않는다.

## 6. 검증 계약

구조 변경은 코드가 컴파일되는 것만으로 완료가 아니다.

최소 검증:

```bash
npm test
npm run build

cd push-backend-v2
npm test
```

UI lifecycle이나 navigation/overlay/input에 영향을 주는 변경은 Chromium과 WebKit E2E를 함께 확인한다. GitHub Actions 또는 Production 배포가 실패/대기 상태라면 완료로 기록하지 않는다.

## 7. 관련 문서

- `docs/STABILITY-PLAN.md`: 안정화 진행 상태와 남은 단계
- `docs/UPDATE-CHECKLIST.md`: 기능/UI 업데이트 시 체크리스트
- `docs/data-architecture-v1.md`: 데이터 구조
- `docs/ADR/`: 주요 구조 결정과 이유
