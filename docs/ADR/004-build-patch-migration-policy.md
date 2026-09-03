# ADR 004: Build-time Patch Migration Policy

- Status: Accepted
- Date: 2026-09-04

## Context

S-Hub V2는 여러 preview/recovery source patch를 거치며 최종 런타임 코드를 만드는 역사적 구조를 가지고 있다. 일부 patch는 exact string marker와 적용 순서에 의존하며, 한 patch의 출력이 다음 patch의 marker가 되기도 한다. 이 구조는 source of truth를 흐리고 작은 source 변경이 build 실패나 예상치 못한 회귀로 이어질 수 있다.

## Decision

Build-time patch는 장기 아키텍처가 아니라 compatibility layer로 취급한다.

- 신규 기능의 기본 구현 수단으로 exact-string source patch를 추가하지 않는다.
- 새 기능은 실제 source/component/service에 구현한다.
- 기존 patch를 한 번에 대량 삭제하지 않는다.
- patch 제거 전 그 patch의 최종 동작과 후속 patch 의존성을 확인한다.
- 최종 동작을 실제 source로 먼저 옮긴다.
- 그 다음 해당 patch 하나만 비활성/제거하고 검증한다.
- 실패 시 즉시 직전 정상 checkpoint로 되돌릴 수 있어야 한다.

## Required Migration Sequence

```text
latest main 확인
-> safety checkpoint
-> patch 입력/출력/후속 marker 확인
-> 실제 source에 동일 동작 구현
-> 회귀 테스트 추가/갱신
-> patch 하나 제거
-> npm test
-> Chromium/WebKit E2E
-> production build
-> Actions/deploy 확인
-> 다음 patch
```

## Consequences

- patch 제거 속도는 느리지만 기능 소실 위험을 크게 낮춘다.
- 실제 `src`가 점진적으로 source of truth가 된다.
- compatibility patch가 남아 있는 동안에는 적용 순서를 문서와 테스트로 보호해야 한다.

## Prohibited Shortcut

```text
여러 patch 삭제
-> build 한 번
-> 깨진 부분을 recovery patch로 다시 덮기
```

이 방식은 기술 부채를 다른 patch로 이동시키므로 사용하지 않는다.
