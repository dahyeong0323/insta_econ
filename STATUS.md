# STATUS.md

## Latest Update
- 2026-03-26: `research.md` 감사 기준으로 현재 구현과 문서 차이를 다시 점검했다.
- 2026-03-26: 전략 결정을 갱신했다. 앞으로는 `research.md 원문과의 형식적 일치`보다 `현재 run 상태 머신 + Telegram 승인 + Instagram publish` 완성도를 우선한다.
- 2026-03-26: `STATUS.md`를 현재 제품 truth 기준으로 전면 재정리했다.

## Strategy Decision
- Canonical architecture는 현재 코드에 있는 `run` 기반 상태 머신이다.
- `research.md`는 방향성과 품질 기준을 설명하는 참고 문서로 본다.
- 원문과 현재 코드가 다를 때는 먼저 `North Star Workflow`에 직접 도움이 되는지 판단한다.
- 직접 도움이 없으면 `문서 차이`로 남기고, backlog로 올리지 않는다.
- 직접 도움이 있으면 `제품 기능`로 backlog에 올린다.

## Why This Is Better
- 현재 코드에는 이미 `researched -> script_pending_approval -> script_approved -> rendering -> image_pending_approval -> image_approved -> publishing -> published/failed` 상태 흐름이 구현돼 있다.
- 현재 코드에는 Telegram approval, publish control, similarity check, published history, scheduler lock, replay/regenerate, artifact-only handoff가 이미 붙어 있다.
- 반대로 `research.md`의 몇몇 요소는 현재 제품 목표와 직접 연결되지 않는다.
- 예: 정확히 `5 agent`일 필요는 없다. 지금처럼 `8 stage`로 더 잘게 쪼개져도 handoff와 책임 추적이 더 좋아지면 제품적으로 이득이다.
- 예: 정확히 `10개 SKILL.md`일 필요는 없다. 지금처럼 짧은 prompt module이면 토큰/유지보수 측면에서 충분하다.
- 예: `workflow.md`, `CLAUDE.md`, `29 pattern catalog`, `병렬 agent 실행`은 있으면 좋을 수 있지만 지금 가장 큰 운영 리스크는 아니다.

## Current Product Truth
- Current pipeline: `source-parser -> content-planner -> contents-marketer -> designer -> developer -> qa-validator -> qa-reviewer -> qa-repair`
- Original PDF alignment:
  - `researcher` -> `source-parser` + `content-planner`
  - `contents-marketer` -> `contents-marketer`
  - `designer` -> `designer`
  - `developer` -> `developer` + `qa-repair`
  - `qa-reviewer` -> `qa-validator` + `qa-reviewer`
- Current workflow status machine:
  - `draft`
  - `researched`
  - `script_pending_approval`
  - `script_approved`
  - `rendering`
  - `image_pending_approval`
  - `image_approved`
  - `publishing`
  - `published`
  - `failed`
- Current renderer baseline:
  - standalone HTML
  - token-only renderer contract
  - current canvas/export baseline is `1080x1350`
- Current operator surface:
  - Telegram script approval
  - Telegram image approval
  - Telegram publish retry/stop control
  - stale run UI
  - scheduler dispatch lock UI
  - similarity operator guide
  - publish failure guide

## Verified Foundations
- [done] `research -> Telegram script approval -> render -> image approval -> publish` 기본 운영 흐름이 production 기준으로 이어진다.
- [done] run state, approval history, publish result, published history, similarity check 저장 구조가 붙어 있다.
- [done] artifact-only handoff가 replay, regenerate, legacy artifact repair까지 canonical contract로 연결돼 있다.
- [done] `qa-validator -> qa-reviewer -> qa-repair` 분리가 runtime과 verification script에 반영돼 있다.
- [done] standalone renderer, preview, design token surface가 shared contract로 고정돼 있다.
- [done] original PDF responsibility map이 `schema.ts`와 skill prompt surface에 반영돼 있다.
- [done] stale run UX, similarity explanation, publish failure guide, publish control delivery status가 운영 UI에 반영돼 있다.
- [done] research scheduler dispatch lock read/clear/dispatch UX가 운영 화면에 반영돼 있다.

## Explicit Mismatches vs research.md
- Current runtime is not literal `5 agents`; it is `8 stages` mapped back to the original 5 responsibilities.
- Current prompt surface is not `10 SKILL.md`; it is a smaller set of TS prompt modules.
- Current repo does not use `CLAUDE.md` or `workflow.md` as the orchestration surface.
- Current core generation flow is mostly sequential, not article-style parallel agent execution.
- Current pattern system is not the literal `29 shared patterns` described in the article.
- Current renderer/export baseline is `1080x1350`, not `1080x1440`.

## What We Will Not Chase For Now
- Literal parity with `5 agents`
- Literal parity with `10 SKILL.md`
- Recreating `CLAUDE.md` / `workflow.md` just to match the article
- Expanding pattern taxonomy only for documentation parity
- Parallel agent execution unless it clearly improves operator throughput or cost

## Current Remaining Work
- P1: Instagram token refresh operator guide or semi-automation
  - reason: publish path is already live, and token expiry is the most obvious remaining operational break risk
  - base files:
    - `src/lib/integrations/instagram/client.ts`
    - `src/app/api/instagram/preflight/route.ts`
    - `src/components/app/econ-carousel-app.tsx`
- P1: Safe 4-hour research dispatch automation
  - reason: scheduler dispatch lock and manual dispatch UX are ready, but full unattended operation still needs safer automation and operator confidence
  - base files:
    - `src/lib/research/scheduler.ts`
    - `src/lib/research/service.ts`
    - `src/app/api/research/dispatch/route.ts`
    - `src/app/api/research/dispatch/lock/route.ts`
- P2: Operator automation cleanup
  - reason: publish, approval, preflight, and dispatch are now individually visible, but operator actions can still be unified further
  - base files:
    - `src/lib/runs/triggers.ts`
    - `src/components/workspace/run-operations-log.tsx`
    - `src/components/app/econ-carousel-app.tsx`

## Decision Rule For Future Backlog
- If a gap improves approval safety, publish reliability, duplicate-topic avoidance, or operator clarity, implement it.
- If a gap only makes the system look more like `research.md`, do not prioritize it.
- If a gap affects token efficiency, prefer the smallest change that preserves the current run contract.

## Verification Suite
- `npm run verify:agent-skills`
- `npm run verify:editorial-core`
- `npm run verify:stage-isolation`
- `npm run verify:legacy-artifacts`
- `npm run verify:planner-renderer-drift`
- `npm run verify:pipeline-regression`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Ops Notes
- Local development uses `.data` storage.
- On Vercel, run state, artifacts, history, and dispatch lock can move to Blob when `BLOB_READ_WRITE_TOKEN` is configured.
- Current production Vercel project is `insta-econ-fzr1`.
- Current production base URL is `https://insta-econ-fzr1.vercel.app`.
- Always re-check `PUBLIC_BASE_URL`, Telegram webhook target, and public slide URLs against the active Vercel project.
- Operator API is protected by `OPERATOR_API_SECRET` or fallback `RESEARCH_DISPATCH_SECRET`.
- 2026-03-20 production publish was verified through Instagram permalink generation.
- Latest known permalink: `https://www.instagram.com/p/DWGhWc1FNNq/`
