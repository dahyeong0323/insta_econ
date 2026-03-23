# Run Storage Transition

## Decision

- `run` 메타데이터는 `DB mirror` 구조를 계속 확장하는 방향이 맞다.
- 카드 HTML, PNG, ZIP 같은 무거운 아티팩트는 파일 저장을 유지한다.
- 즉 목표는 `파일 저장을 없애는 것`이 아니라 `상태와 운영 이벤트는 DB에서 바로 읽을 수 있게 만드는 것`이다.

## Why Now

- 이 프로젝트는 `research -> script approval -> render -> image approval -> publish` 상태 머신으로 운영된다.
- 승인 이력, publish 시도, 보류 사유 같은 운영 이벤트가 늘어나면서 `run.json`만으로는 조회와 운영 대응이 느려진다.
- automation, Telegram 운영, Instagram publish가 함께 돌기 시작하면 `최근 상태 조회`, `멈춘 단계 찾기`, `재시도 후보 찾기`를 파일 스캔 없이 처리해야 한다.

## Why Not Full Migration Yet

- 현재 생성 결과물은 `slide-*.html`, PNG, ZIP처럼 파일 기반 산출물이 많다.
- 지금 전체를 DB BLOB 저장으로 옮기면 범위가 커지고 기존 생성 파이프라인을 흔들 수 있다.
- 그래서 `상태와 운영 이벤트는 DB`, `무거운 결과물은 파일`로 나누는 편이 더 안전하다.

## Trigger Criteria

아래 중 2개 이상이 만족되면 DB mirror를 더 넓히는 게 자연스럽다.

1. automation이 실제로 활성화되어 run이 주기적으로 생성된다.
2. Telegram 승인과 Instagram publish를 운영 환경에서 실제로 사용한다.
3. 특정 단계에서 멈춘 run을 목록으로 바로 조회하거나 재시도해야 한다.
4. 파일 스캔보다 빠른 운영 조회가 중요해진다.
5. 나중에 여러 인스턴스나 배포 환경에서 같은 상태를 읽어야 한다.

## Recommended Scope

1. `run_state_mirror`에 기본 run 메타데이터를 계속 저장한다.
2. `workflow_status`, `status`, `current_stage`, `error`, `updated_at`을 항상 반영한다.
3. `approval_history`와 `publish_attempts`도 별도 테이블로 mirror한다.
4. 아티팩트는 경로 또는 파일 자체로 유지하고 DB에는 직접 넣지 않는다.
5. 읽기 API는 점진적으로 DB 우선 조회로 옮긴다.

## Not In Scope Yet

- slide HTML 본문 전체를 DB에 저장
- PNG 바이너리를 DB BLOB으로 저장
- 기존 `.data/runs/<runId>` 구조 제거
- 대규모 일괄 마이그레이션

## Current Progress

- `run_state_mirror` 테이블과 `writeRunState -> SQLite mirror upsert`는 이미 연결되어 있다.
- `run_approval_events`, `run_publish_attempts` mirror 테이블도 함께 저장하도록 확장했다.
- `/api/runs/[id]/events`는 SQLite mirror를 직접 읽어 approval history와 publish attempts를 반환한다.
- `/api/runs/[id]`는 이제 mirror 우선 조회 후 파일 fallback으로 응답한다.

## Recommended Next Read Migrations

1. `GET /api/runs/[id]`처럼 읽기 전용 endpoint부터 mirror 우선으로 바꾼다.
2. 운영 화면의 디버그/이력 패널도 가능하면 DB direct query API를 우선 사용한다.
3. 그다음 필요 시 run 목록 API를 mirror 기반으로 추가하거나 전환한다.

## Next Step

- 실제 4시간 automation 등록은 아직 blocked 상태라, 다음으로는 `Telegram 명령 체계를 publish 운영 액션까지 넓힐지 판단`이 가장 자연스러운 진행 항목이다.
