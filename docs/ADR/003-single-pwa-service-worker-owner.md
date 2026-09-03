# ADR 003: Single PWA Service Worker Lifecycle Owner

- Status: Accepted
- Date: 2026-09-04

## Context

과거에는 `index.html`과 React entry가 각각 Service Worker registration/update lifecycle에 관여했다. 같은 load에서 update가 중복 호출되면 불필요한 네트워크 작업과 lifecycle 경쟁이 생기고, PWA 캐시 문제를 추적하기도 어려워진다.

## Decision

Service Worker register/update lifecycle은 한 owner만 가진다.

현재 정책:

- 앱 entry가 `sw.js`를 등록한다.
- `updateViaCache: 'none'` 등 업데이트 정책도 같은 owner가 관리한다.
- `index.html`이나 별도 runtime script는 독립적으로 `registration.update()`를 호출하지 않는다.

## Consequences

- PWA update 흐름을 한 파일에서 추적할 수 있다.
- 중복 update/network 작업을 줄인다.
- 향후 waiting worker, activation, reload UX를 추가할 때도 같은 owner에서 확장해야 한다.

## Validation

Service Worker 관련 변경은 최소한 다음을 확인한다.

- cold start
- 기존 설치 PWA 재실행
- 새 배포 반영
- offline -> online 복귀
- cache version 변경
- 중복 registration/update가 다시 생기지 않는지 회귀 테스트
