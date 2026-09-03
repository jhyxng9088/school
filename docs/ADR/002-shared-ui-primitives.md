# ADR 002: Shared UI Primitives Before Feature Copies

- Status: Accepted, incremental migration
- Date: 2026-09-04

## Context

S-Hub의 기능이 빠르게 늘면서 Bottom Sheet lifecycle, 파일 원본 viewer, SVG icon, segmented spring 같은 공통 책임이 feature별로 복제된 적이 있다. 복제는 초기 개발은 빠르지만 이후 한 기능의 버그 수정이 다른 복제본에는 반영되지 않는 문제를 만든다.

## Decision

새 기능은 기존 shared primitive를 우선 재사용한다.

현재 대표 owner:

- `UnifiedBottomSheet`: 일반 Bottom Sheet lifecycle
- `OriginalFileViewer`: 원본 이미지/파일 확인, 저장/공유 lifecycle
- `SHubIcon`: 최종 런타임 아이콘 registry

다음 migration 목표:

- shared segmented control
- shared spring/motion primitives
- overlay/dialog 공통 lifecycle
- declarative unread indicator

feature 고유 UX가 있는 경우 공통 primitive 위에 feature behavior를 얹는다. 모든 UI를 하나의 거대한 component로 합치지는 않는다.

## Consequences

- 새 기능에서 이미 해결된 접근성/애니메이션/cleanup 문제를 재사용할 수 있다.
- 디자인 변경의 source of truth가 줄어든다.
- 공통 component 변경은 영향 범위가 커질 수 있으므로 회귀 테스트가 더 중요해진다.

## Rule for New Features

새 UI를 구현하기 전에 다음 질문을 먼저 한다.

1. 기존 primitive가 이 책임을 이미 소유하는가?
2. 기존 primitive에 prop/variant를 추가하는 것이 feature 복제보다 안전한가?
3. 정말 새로운 책임이라면 어느 계층이 owner가 되어야 하는가?

공통 primitive를 재사용할 수 있는데 feature 전용 복사본을 새로 만들지 않는다.
