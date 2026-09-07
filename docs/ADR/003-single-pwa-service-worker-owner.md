# ADR 003: Single PWA Service Worker Lifecycle Owner

- Status: Accepted
- Date: 2026-09-04

## Context

과거에는 `index.html`과 React entry가 각각 Service Worker registration/update lifecycle에 관여했다. 같은 load에서 update가 중복 호출되면 불필요한 네트워크 작업과 lifecycle 경쟁이 생기고, PWA 캐시 문제를 추적하기도 어려워진다.

Push 구독 경로에는 기존 registration을 먼저 조회하고, 아직 registration이 없는 경우에만 같은 `sw.js`를 등록하는 recovery fallback이 있다. 이 fallback은 push 구독 복구를 위한 안전망이며 Service Worker update lifecycle을 소유하지 않는다.

## Decision

Service Worker update lifecycle은 한 owner만 가진다.

현재 정책:

- 앱 entry가 `sw.js`의 primary registration과 scheduled `registration.update()`를 소유한다.
- `updateViaCache: 'none'` 등 업데이트 정책도 앱 entry가 관리한다.
- `index.html`이나 별도 runtime script는 독립적으로 `registration.update()`를 호출하지 않는다.
- `push-client.js`는 먼저 `getRegistration()`으로 기존 registration을 재사용한다.
- Push 구독 복구를 위해 registration이 없을 때만 동일한 `sw.js`를 fallback 등록할 수 있지만, `registration.update()`나 별도의 update lifecycle은 소유하지 않는다.

## Consequences

- PWA update 흐름을 앱 entry 한 곳에서 추적할 수 있다.
- 중복 update/network 작업을 줄인다.
- Push 구독은 primary registration이 아직 준비되지 않은 경우에도 기존 recovery fallback을 유지한다.
- 향후 waiting worker, activation, reload UX를 추가할 때도 update lifecycle은 같은 owner에서 확장해야 한다.

## Validation

Service Worker 관련 변경은 최소한 다음을 확인한다.

- cold start
- 기존 설치 PWA 재실행
- 새 배포 반영
- offline -> online 복귀
- cache version 변경
- primary registration/update owner가 추가되지 않는지
- push fallback이 update lifecycle을 새로 만들지 않는지
- 중복 `registration.update()`가 다시 생기지 않는지 회귀 테스트
