# Production Preflight

## Current status
- Local code now hardens research selection, history comparison, and series continuity before production testing.
- The active production reference is the Vercel project `insta-econ-fzr1`.
- The active production domain should be treated as `https://insta-econ-fzr1.vercel.app`.

## Required Vercel environment variables
- `TELEGRAM_WEBHOOK_SECRET`
- `OPERATOR_API_SECRET`

## Recommended values
- `TELEGRAM_WEBHOOK_SECRET`: use the same value as local `.env.local`
- `OPERATOR_API_SECRET`: use the same value as local `.env.local`

## Production checks
1. Run `./run-prod-check.ps1 -BaseUrl https://insta-econ-fzr1.vercel.app`
2. Confirm `POST /api/research/dispatch` succeeds with `sendToTelegram:false`
3. Confirm `POST /api/instagram/preflight` reports `ready` or a clearly actionable warning
4. Confirm `POST /api/telegram/webhook` without the Telegram secret returns `401`
5. Trigger one full flow only after the above checks look clean:
   `research -> Telegram script approval -> render -> Telegram image approval -> Instagram publish`

## Expected behavior after latest deploy
- Research dispatch should return richer selection metadata and still create a normal approval-ready run
- The operator should see why the topic fits the account flow, not only the topic summary
- Similar or already-posted concepts should be blocked more aggressively during research
- Runtime base URL resolution should prefer the active Vercel production domain when available
