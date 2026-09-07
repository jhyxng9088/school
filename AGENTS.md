# S-Hub Repository Working Contract

이 파일은 이 저장소에서 코드를 수정하는 사람과 코딩 에이전트가 **작업을 시작할 때 가장 먼저 따라야 하는 계약**이다. 저장소 전체에 적용된다.

S-Hub의 장기 구조 기준은 `docs/ARCHITECTURE.md`, 실제 변경 체크리스트는 `docs/UPDATE-CHECKLIST.md`다. 둘을 읽지 않은 상태에서 구조·UI·데이터 흐름을 새로 만들지 않는다.

## 1. 절대 원칙: 같은 책임에는 owner가 하나만 존재한다

기능을 추가하거나 버그를 고칠 때 새 구현부터 만들지 않는다.

1. 최신 `main` HEAD와 최근 커밋을 확인한다.
2. 관련 파일을 현재 HEAD에서 다시 읽는다.
3. 수정할 책임의 canonical owner와 기존 shared primitive를 먼저 찾는다.
4. 기존 owner를 직접 수정한다.
5. 정말 새로운 책임일 때만 새 component/service를 만든다.

기존 owner를 수정할 수 있는데 병렬 component, runtime, listener, subscription, observer, helper, build patch를 추가하지 않는다.

## 2. 신규 코드에서 금지하는 우회 구현

- 신규 `*-patch.js` 또는 exact-string build-time source patch를 만들지 않는다.
- React가 렌더한 내부 DOM을 다시 고치기 위한 `MutationObserver`를 추가하지 않는다.
- `querySelector(...).click()`으로 다른 버튼을 대신 눌러 기능을 연결하지 않는다.
- visible text, `nth-of-type`, DOM 순서를 route/state/action의 식별자로 사용하지 않는다.
- 렌더 후 외부 스크립트가 role, tabindex, listener, child를 주입해 가짜 interactive element를 만들지 않는다.
- 같은 데이터에 두 번째 realtime subscription/listener를 만들어 동기화를 맞추지 않는다.
- 기능별로 portal/backdrop/scroll lock/sheet lifecycle을 복제하지 않는다.

기존 build patch와 legacy runtime은 호환 부채다. 개수는 유지하거나 줄일 수 있지만 **늘리면 안 된다**.

## 3. 우선 재사용할 canonical primitive

- Navigation: semantic route/action
- Icon: `SHubIcon`
- Bottom Sheet: `UnifiedBottomSheet`
- 원본 이미지/파일 viewer: `OriginalFileViewer`
- Segment motion: `useSHubSegmentSpring` 및 해당 공통 motion token
- Unread: canonical unread state/store -> React indicator 흐름
- PWA/Service Worker: 기존 단일 registration/update owner

이 목록은 새 복제본을 만들라는 뜻이 아니다. 정확한 현재 owner는 항상 최신 source와 architecture tests에서 다시 확인한다.

## 4. 단일화 작업에서 보존해야 하는 것

owner 이동, legacy 제거, patch 퇴역을 하는 동안 사용자에게 보이는 기능·터치 동작·데이터 의미·모션 상수·타이밍·physics를 임의로 바꾸지 않는다. 구조 변경과 UX 변경을 한 커밋에 섞지 않는다.

기존 patch를 제거할 때는:

1. 동작을 canonical raw source owner로 먼저 옮긴다.
2. upstream/downstream patch 의존성을 끊는다.
3. 해당 patch 하나만 제거한다.
4. 동일 동작을 regression test/E2E로 잠근다.

## 5. 데이터와 실시간 상태

- 공유 상태와 개인 상태의 경계를 유지한다.
- authoritative realtime source가 있으면 같은 데이터를 focus/online 이벤트마다 중복 full read하지 않는다.
- listener, interval, rAF는 owner lifecycle에서 생성하고 반드시 cleanup한다.
- 읽기 최적화 때문에 기존 실시간 기능을 없애지 않는다.

## 6. 테스트를 우회하지 않는다

`tests/single-owner-architecture.test.js`와 owner/structure 계열 테스트는 단일화 결과를 보호하는 구조 계약이다.

새 기능을 통과시키기 위해 이 테스트의 금지 범위를 넓혀 우회하거나 grandfathered 예외를 추가하지 않는다. canonical owner가 실제로 이동해 테스트 수정이 필요한 경우에는 source migration을 먼저 완료하고, 예외는 줄이는 방향으로만 갱신한다.

최소 검증:

```bash
npm test
npm run build

cd push-backend-v2
npm test
```

Navigation, input, modal/sheet, motion 등 UI lifecycle에 영향을 주면 Chromium과 WebKit E2E도 확인한다. CI 또는 배포가 pending/failed이면 완료로 기록하지 않는다.

## 7. 변경 전 마지막 질문

코드를 쓰기 전에 스스로 확인한다.

> "이 변경은 기존 owner에 연결하는가, 아니면 같은 일을 하는 두 번째 owner를 만드는가?"

두 번째라면 구현 방식을 다시 잡는다.
