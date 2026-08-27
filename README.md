# S-Hub

우리 반에서 사용하는 React + Vite 기반 학교생활 PWA. iPhone을 우선으로 하고 Samsung Internet/Android와 iPad까지 같은 코드베이스에서 대응한다.

## 현재 핵심 기능

- 5탭 하단 내비게이션: 홈 · 리마인더 · 시간표 · 급식 · 학사일정
- 반 공유 데이터: 시간표, 리마인더 원본, 학사일정, 변경 활동
- 개인 데이터: 리마인더 완료/숨김 상태와 읽음 상태
- 리마인더 자연어/첨부 AI 분석
- NEIS 급식·학사 데이터
- Web Push 및 예약 리마인더 알림
- GitHub Pages PWA + Firebase/Firestore + Vercel 알림 백엔드

## 리마인더 상태 규칙

- `completed=true, hidden=false`: 이 학생은 완료했지만 리마인더 구독은 유지한다. 친구가 수정하면 수정 내용, unread 점, 수정 푸시를 다시 받을 수 있다.
- `hidden=true`: 이 학생에게서는 완전히 숨긴 상태다. 친구가 수정해도 목록, unread 점, 수정 푸시가 다시 나타나면 안 된다.
- 시간이 있는 리마인더는 해당 KST 시각에, 시간이 없는 리마인더는 해당 날짜 23:59:59 KST에 만료한다.

## 코드 지도

### 앱

- `src/main.jsx`: 앱 셸, 온보딩, 5탭 내비게이션, 홈/시간표 진입점
- `src/todo.js`: 리마인더 공개 API 조합. 활성 리마인더의 반 전체 삭제와 완료 항목의 개인 삭제를 구분한다.
- `src/todo.jsx`: 공유 리마인더 + 학생 개인 상태 동기화와 만료 처리
- `src/todo-stage5-ai.jsx`: 리마인더 화면, 입력/편집, AI 추가 UI
- `src/reminder-lifecycle.js`: 리마인더 만료/개인 표시 여부의 단일 규칙
- `src/school-sync.js`: Firebase 인증 및 공유/개인 데이터 접근
- `src/class-activity.js`: 반 활동/수정자 기록
- `src/unread-indicators-v2.js`: 탭/리마인더 unread 점
- `src/push-client.js`: Push 구독과 활동 알림 dispatch
- `src/unified-sheet.jsx`: 공통 bottom sheet 동작

### 스타일

- `src/styles.css`: 앱 셸과 하단 내비게이션
- `src/motion.css`: 공통 모션
- `src/todo.css`, `src/todo-stage5.css`: 리마인더
- `src/timetable.css`: 시간표
- `src/stage3.css`: 급식/학교 데이터 UI
- `src/academic-shared.css`: 학사일정
- `src/unified-sheet.css`: 공통 bottom sheet
- `public/*.css`: 앱 위에 얹는 소수의 기기/모션 보정만 둔다. 사용하지 않는 옛 패치 스타일은 보관하지 않는다.

### 백엔드

- `push-backend-v2/`: 예약 리마인더와 리마인더 활동 Push 백엔드
- `firestore.rules`: Firestore 규칙 원본
- `public/sw.js`: PWA 캐시와 Push 표시/알림 탭 라우팅

## 수정 원칙

1. 현재 `main`의 동작을 기준으로 필요한 범위만 수정한다.
2. 공유 상태와 개인 상태를 섞지 않는다.
3. 하단 탭 수는 React의 `tabs.length`와 CSS `--nav-count`를 통해 한 경로로 유지한다.
4. bottom sheet가 닫히는 동안 뒤 화면으로 터치가 관통하면 안 된다.
5. 모바일 native date/time input은 실제 hit target을 유지한다.
6. 일회성 패치 스크립트/워크플로는 작업이 끝난 뒤 저장소에 남기지 않는다.
7. 배포 전에 프론트 테스트, 프로덕션 빌드, 알림 백엔드 테스트를 모두 통과해야 한다.

## 검증

```bash
npm ci
npm test
npm run build

cd push-backend-v2
npm ci
npm test
```

`main`에 push되면 `.github/workflows/deploy.yml`이 같은 검증을 다시 수행한 뒤 GitHub Pages에 배포한다.
