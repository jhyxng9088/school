# S-Hub Update Checklist

이 체크리스트는 S-Hub에 UI 변경, 기능 추가, 버그 수정, 구조 정리를 할 때 사용한다.

## 작업 시작 전

- [ ] 최신 `main` HEAD SHA를 확인했다.
- [ ] 최근 커밋을 확인했다.
- [ ] 관련 파일을 현재 HEAD에서 다시 읽었다.
- [ ] 다른 채팅/작업의 최근 변경과 겹치는 파일이 있는지 확인했다.
- [ ] 현재 정상 동작을 테스트 또는 기존 CI로 확인했다.
- [ ] 위험도가 높은 작업이면 safety branch/tag/checkpoint를 만들었다.

## 구현 설계

- [ ] 기존 semantic navigation/action으로 연결할 수 있는지 먼저 확인했다.
- [ ] 실제 interactive element가 직접 action을 소유한다.
- [ ] `querySelector(...).click()`으로 내부 기능을 연결하지 않았다.
- [ ] visible text를 읽어서 route/state/key를 추론하지 않았다.
- [ ] `nth-of-type`이나 DOM 순서에 기능을 연결하지 않았다.
- [ ] 기존 `SHubIcon`, `UnifiedBottomSheet`, `OriginalFileViewer` 등 shared primitive를 먼저 검토했다.
- [ ] 같은 책임을 가진 새 중복 component/helper를 만들지 않았다.
- [ ] React가 렌더한 내부 DOM을 다시 가공하기 위한 새 `MutationObserver`를 만들지 않았다.
- [ ] 신규 기능을 위해 새 exact-string build patch를 추가하지 않았다.
- [ ] Service Worker register/update owner를 중복 생성하지 않았다.
- [ ] iPhone/iPad/Android/Samsung 및 light/dark mode 영향을 고려했다.

## 단일 owner 변경 규칙

- [ ] 수정하려는 기능의 현재 canonical owner를 먼저 찾고, 그 owner를 직접 수정했다.
- [ ] 기존 owner를 수정할 수 있는데 병렬 component/runtime/listener/subscription/patch를 새로 만들지 않았다.
- [ ] 같은 기능의 UI owner, data owner, motion owner가 둘 이상 생기지 않았는지 확인했다.
- [ ] 안정화/단일화 작업에서는 사용자 기능, 터치 동작, 화면 결과, 모션 상수·타이밍·physics를 변경하지 않았다.
- [ ] owner를 이동하거나 legacy owner를 제거했다면 변경 전후 최종 동작이 동일함을 기존 회귀 테스트, E2E 또는 동등성 검증으로 증명했다.
- [ ] 신규 build-time source patch를 추가하지 않았고, 필요한 변경은 canonical raw source owner에서 수행했다.
- [ ] 기존 build patch를 제거할 때 직접 import뿐 아니라 active patch의 간접 import까지 확인했다.
- [ ] 임시 우회 owner를 남기지 않았으며, 불가피한 compatibility 계층은 명확한 제거 조건과 검증 근거를 남겼다.

## 모션/UI 변경

- [ ] 같은 유형의 기존 motion primitive/token을 재사용했다.
- [ ] `prefers-reduced-motion`을 유지했다.
- [ ] 빠른 연타/터치에서 pointerdown과 click이 중복 실행되지 않는다.
- [ ] modal/sheet close 중 뒤 화면으로 터치가 관통하지 않는다.
- [ ] scroll lock이 정상 복구된다.
- [ ] 120Hz에서 불필요한 timer/layout thrash가 없는지 확인했다.

## 데이터/실시간 기능 변경

- [ ] 같은 데이터에 중복 subscription/listener를 추가하지 않았다.
- [ ] unmount/cleanup 시 listener, interval, rAF가 정리된다.
- [ ] 공유 상태와 개인 상태를 섞지 않았다.
- [ ] offline/cache fallback과 실시간 source의 우선순위가 명확하다.
- [ ] 읽기 최적화를 이유로 기존 실시간 기능을 소실시키지 않았다.

## 반영 전

- [ ] `main` HEAD를 다시 확인했다.
- [ ] 작업 시작 후 다른 커밋이 들어왔다면 변경 파일 겹침을 확인했다.
- [ ] 다른 작업을 force push로 덮지 않았다.
- [ ] 변경 범위가 요청보다 불필요하게 넓어지지 않았다.
- [ ] 기능/디자인 소실이 없는지 diff를 다시 읽었다.

## 검증

- [ ] `npm test` 성공
- [ ] `npm run build` 성공
- [ ] UI lifecycle 변경이면 Chromium E2E 성공
- [ ] UI lifecycle 변경이면 WebKit E2E 성공
- [ ] backend 영향이 있으면 `push-backend-v2` 테스트 성공
- [ ] GitHub Actions 성공
- [ ] 배포가 pending/failed 상태가 아님
- [ ] 가능하면 실제 배포 페이지/PWA에서 주요 흐름 확인

## 완료 보고

완료라고 말하기 전에 다음을 명시한다.

- 최종 `main` HEAD SHA
- 변경한 책임/파일 범위
- 생성한 safety checkpoint
- 테스트 결과
- GitHub Actions 결과
- Production/Pages/Vercel 상태
- 남아 있는 known risk 또는 다음 단계

CI나 Production이 pending/failed라면 완료로 표시하지 않는다.
