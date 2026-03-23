# STATUS.md

## Purpose
- 현재 구현 상태와 운영 검증 결과를 빠르게 확인하는 작업 보드
- `AGENTS.md`의 방향을 실제 코드와 운영 흐름 기준으로 점검하는 기록
- 구현이나 검증이 끝난 항목은 바로 갱신

## Status Rules
- 상태 값은 `todo`, `doing`, `done`, `blocked`
- 시작한 작업은 먼저 `doing`
- 코드 변경과 검증이 끝난 항목만 `done`
- 외부 권한이나 운영 변수 때문에 멈추면 이유와 함께 `blocked`
- 작업이 끝나면 `Next Up`도 함께 갱신

## Current Snapshot
- Product phase: production end-to-end publish 검증 완료
- Current focus: research selection 품질 강화와 `insta-econ-fzr1` 기준 production 재배포 검증
- Biggest risk: production env의 실제 도메인 반영 여부, 게시 히스토리 누적 이후 research 유사도 튜닝, Instagram token 수명 관리

## Completed
- [done] 카드뉴스 생성 UI와 기본 파이프라인 구성
- [done] OpenAI 기반 콘텐츠 생성과 QA 보정 루프 구성
- [done] run 상태 머신과 artifact 저장 구조 구성
- [done] Telegram 초안 승인 요청/응답 API 및 webhook 연결
- [done] Telegram inline button 기반 승인 UX 연결
- [done] 승인된 초안을 기존 카드뉴스 생성 파이프라인에 연결
- [done] PNG 렌더 및 Telegram 이미지 전송 API 추가
- [done] Instagram publish adapter와 publish 제어 API 추가
- [done] publish 시도 이력과 approval history 저장 구조 추가
- [done] published history 저장과 similarity check 기반 중복 방지 로직 추가
- [done] research agent가 새 주제를 고르고 초안 run을 만드는 흐름 추가
- [done] research dispatch lock과 active run 차단 로직 추가
- [done] stale active run 자동 fail 처리 추가
- [done] Telegram `보류`/`스킵` 응답을 approval history와 run 상태에 반영
- [done] Telegram webhook secret 검증 추가
- [done] publish/operator mutation API operator secret 검증 추가
- [done] production Vercel env에 `TELEGRAM_WEBHOOK_SECRET`, `OPERATOR_API_SECRET` 반영
- [done] production Telegram webhook을 secret 검증 기반으로 재설정
- [done] run-level `process`/`publish` lock 추가로 중복 실행 방지
- [done] failed 이후 상태를 덮어쓰지 못하도록 patch guard 추가
- [done] 운영 UI에 research 시작, 이미지 전송, run 종료, 상태 복구 버튼 추가
- [done] run 조회/export/regenerate API를 operator secret으로 보호
- [done] operator secret과 research dispatch secret 헤더 경로 정리
- [done] Telegram 승인 버튼과 텍스트 응답을 현재 approval message에 정확히 바인딩
- [done] 승인 후 자동 `process`/`publish` 시작 실패를 soft error로 기록
- [done] publish 성공 후 history 저장 실패가 run을 다시 failed로 돌리지 않도록 분리
- [done] 이미지 Telegram 전송을 `image_pending_approval` 단계와 lock 기준으로 제한
- [done] 운영 UI에 수동 `process` 복구 버튼 추가
- [done] Telegram/운영 UI의 깨진 문구와 mojibake 문자열 정리
- [done] `GET /api/runs` 최신 run 목록 API 추가
- [done] Vercel production stale run lock 문제 보강
- [done] Vercel production Playwright 렌더 경로를 `@sparticuz/chromium` 기반으로 안정화
- [done] production `research -> Telegram script approval -> process -> image send -> image approval` 실전 검증
- [done] `/api/instagram/preflight` 추가
- [done] 운영 UI에 Instagram preflight 패널 추가
- [done] `run-prod-check.ps1`에 Instagram preflight 호출 추가
- [done] Instagram page access token 교체와 production preflight `ready` 확인
- [done] Instagram carousel container ready polling 추가로 `Media ID is not available` 실패 보강
- [done] blob storage 즉시 재조회로 `published` 상태가 다시 `publishing`으로 덮이는 문제 수정
- [done] production run `6730bbf4-5827-45c6-a38e-bf6b74db6077` 실제 Instagram 게시 성공
- [done] 게시 permalink 확인: `https://www.instagram.com/p/DWGhWc1FNNq/`
- [done] 게시 run 상태와 published history 복구 및 최종 `published` 확인
- [done] `npm run typecheck`, `npm run lint`, `npm run build` 통과
- [done] production Playwright PNG 렌더에 임베드 한글 폰트를 주입해 실제 게시본 텍스트 깨짐 문제 수정
- [done] publish 직전에 Instagram preflight를 강제해 만료 토큰/권한/공개 PNG URL 문제를 먼저 차단
- [done] Graph API Explorer 임시 토큰 대신 Page access token 운영 가이드를 `docs/instagram-token-playbook.md`에 추가
- [done] GitHub `main` 브랜치와 Vercel `insta-econ-fzr1` 프로젝트를 연결하고 최신 앱 코드를 push
- [done] `insta-econ-fzr1` 배포에서 새 `INSTAGRAM_PAGE_ACCESS_TOKEN`이 인식되고 Instagram account probe가 성공하는 것 확인
- [done] research topic catalog에 `series`, `aliases`, `curriculumPosition`, `teachingAngle` 메타데이터 추가
- [done] research selection을 `정적 후보 전체 평가 -> heuristic 점수 -> LLM shortlist rerank` 구조로 강화
- [done] research artifact에 selection metadata와 diagnostics를 저장해 선택 근거를 추적 가능하게 보강
- [done] published history 비교에 caption, slide body, alias, research metadata를 반영해 유사도 판정 심화
- [done] Telegram script approval 메시지에 시리즈 흐름/이전 주제 연결/선정 이유 노출 추가
- [done] runtime base URL 해석을 Vercel production domain fallback까지 포함하도록 보강
- [done] `scripts/debug-research-selection.mjs` 추가로 real/synthetic research selection 재현 테스트 경로 마련
- [done] local validation: `node scripts/debug-research-selection.mjs --mode real` 통과
- [done] local validation: `node scripts/debug-research-selection.mjs` synthetic 시나리오에서 `scarcity -> saving-and-interest` 개선 확인
- [done] `npm run typecheck`, `npm run lint`, `npm run build` 재통과

## In Progress
- [doing] 변경된 research/pipeline 코드를 GitHub `main`에 push하고 `insta-econ-fzr1` 자동 배포 반영 확인
- [doing] 수정된 렌더와 새 page token 기준으로 재게시 검증
- [doing] 장기 토큰 기반 운영 흐름과 재인증 절차 정리

## Next Up
1. GitHub `main`에 push하고 `insta-econ-fzr1` 배포가 최신 커밋을 반영했는지 확인
2. `run-prod-check.ps1 -BaseUrl https://insta-econ-fzr1.vercel.app`로 production dispatch/preflight/webhook 재확인
3. 새 run으로 이미지 승인/게시를 다시 검증
4. Instagram token 만료 감지와 사전 알림 로직 추가
5. 두 번째 production publish까지 확인한 뒤 scheduler 자동화 재개

## Backlog
- [todo] 운영 UI에서 stale run 목록과 수동 정리 기능 보강
- [todo] similarity check의 설명 각도 중복 판정 정교화
- [todo] publish 실패 유형별 운영 가이드 분기 강화
- [todo] scheduler 실패 알림과 재시도 정책 고도화
- [todo] Instagram token refresh 또는 재인증 운영 흐름 자동화

## Blocked
- [blocked] 4시간 자동 scheduler 상시 운영
  - 이유: 디자인 보정과 한 번 더 production publish 검증을 마친 뒤 켜는 편이 안전함

## Notes
- 로컬 개발에서는 `.data` 구조를 계속 사용
- Vercel에서는 `BLOB_READ_WRITE_TOKEN`이 있으면 run 상태, artifact, history, dispatch lock을 Blob으로 저장
- 활성 운영 Vercel 프로젝트는 `insta-econ-fzr1`
- 활성 운영 도메인은 현재 `https://insta-econ-fzr1.vercel.app`
- `PUBLIC_BASE_URL`, Telegram webhook, 공개 슬라이드 URL은 위 도메인 기준으로 맞춰야 함
- operator API는 `OPERATOR_API_SECRET` 또는 fallback `RESEARCH_DISPATCH_SECRET`로 보호
- 2026-03-20 production 검증 결과:
  - 새 page access token 반영 완료
  - `INSTAGRAM_IG_USER_ID=17841442765319010` 확인 완료
  - production `/api/instagram/preflight`가 `ready`
  - 실제 publish 성공 후 permalink 생성 확인
  - run `6730bbf4-5827-45c6-a38e-bf6b74db6077`는 현재 `published`
  - publish metadata:
    - `instagram_creation_id=18061663358425511`
    - `instagram_media_id=18113676862708450`
    - `permalink=https://www.instagram.com/p/DWGhWc1FNNq/`
- 2026-03-21 게시본 깨짐 원인 분석:
  - Playwright가 `standalone_html`을 직접 캡처할 때 production 런타임에 한글 폰트가 없어 텍스트가 거의 비어 보이는 PNG가 생성됨
  - 앱 UI의 `next/font` 설정은 standalone HTML 렌더에 자동으로 적용되지 않음
  - 해결: `public/fonts`의 IBM Plex Sans KR를 data URI로 임베드하고 폰트 로드 완료 후 스크린샷
- 2026-03-21 production 재점검:
  - `run-prod-check.ps1` 기준 dispatch와 Telegram webhook은 정상
  - Instagram preflight는 `Session has expired on Friday, 20-Mar-26 03:00:00 PDT`로 응답해 token 갱신이 필요함
  - 현재 로컬 Vercel CLI 인증 토큰이 유효하지 않아 production 재배포는 새 deploy token 또는 재로그인 없이는 진행 불가
- 2026-03-22 token 운영 보강:
  - publish workflow가 실제 업로드 전에 `/api/instagram/preflight` 수준의 readiness 검사를 통과해야만 진행되도록 변경
  - token/권한 오류면 재시도보다 `manual_fix_required`로 멈추고 Graph API Explorer 임시 토큰 대신 Page access token 교체 안내를 남김
- 2026-03-23 GitHub/Vercel 정리:
  - `main`에 최신 앱 코드 `70950e0`를 push했고 `insta-econ-fzr1`가 더 이상 기본 Next 앱이 아닌 실제 앱을 서빙하는 것 확인
  - `insta-econ-fzr1`의 `/api/instagram/preflight`에서 새 `INSTAGRAM_PAGE_ACCESS_TOKEN`과 `@borii_econ` account probe 성공 확인
  - 현재 남은 운영 경고는 `PUBLIC_BASE_URL`이 예전 도메인으로 남아 있는 점
- 2026-03-23 research hardening:
  - research는 이제 static topic pool의 첫 clear 후보를 그대로 쓰지 않고, published history와 series continuity를 함께 반영한 heuristic + LLM rerank로 선택
  - similarity는 title 외에 concept id, alias, caption, slide body, research metadata까지 반영하도록 확장
  - synthetic validation에서 예전 로직 기준 첫 clear 후보는 `scarcity`였지만, 새 로직은 `money-functions -> inflation` 다음 흐름으로 `saving-and-interest`를 선택
  - production runtime은 `PUBLIC_BASE_URL`이 낡았더라도 Vercel production domain fallback을 우선 보도록 보강
