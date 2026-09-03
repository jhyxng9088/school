# ADR 001: Single Ownership and Semantic Actions

- Status: Accepted
- Date: 2026-09-04

## Context

S-Hub에는 과거에 React가 렌더한 버튼/요소를 runtime script가 다시 찾아 click listener를 붙이거나, 다른 기능이 해당 DOM을 찾아 `.click()`을 호출하는 연결 방식이 존재했다. 이 방식은 UI 구조나 텍스트만 바뀌어도 navigation과 기능이 함께 깨질 수 있고, pointer/click ownership도 여러 군데로 분산시킨다.

## Decision

같은 책임에는 owner를 하나만 둔다.

- 내부 navigation은 semantic route/action이 소유한다.
- interactive UI는 실제 React button/component가 직접 action을 호출한다.
- visible text, DOM 순서, `nth-of-type`으로 기능을 추론하지 않는다.
- React 마운트 후 내부 기능을 연결하기 위해 synthetic `.click()`을 사용하지 않는다.
- 앱이 직접 렌더한 DOM을 기능 구현 목적으로 다시 개조하지 않는다.

## Consequences

장점:

- UI 디자인/배치 변경이 기능 로직을 깨뜨릴 가능성이 낮아진다.
- 이벤트 중복 실행과 DOM ownership 충돌을 줄일 수 있다.
- 새 기능이 semantic API에 연결되는 형태가 되어 영향 범위를 예측하기 쉬워진다.

비용:

- 기존 DOM proxy/compatibility shim을 단계적으로 걷어내야 한다.
- 한 번에 제거하면 회귀 위험이 있으므로 작은 migration과 E2E가 필요하다.

## Rejected Pattern

```text
render
-> querySelector / visible text search
-> targetElement.click()
-> another listener
-> state change
```

## Preferred Pattern

```text
user input
-> Button
-> semantic action
-> state/service
-> render
```
