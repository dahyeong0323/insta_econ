# Production Preflight

## Current status
- Local code includes operator API auth and Telegram webhook secret validation.
- Telegram webhook is already pointed at `https://insta-econ.vercel.app/api/telegram/webhook`.
- The only remaining blocker before live flow testing is deploying the latest code to Vercel.

## Required Vercel environment variables
- `TELEGRAM_WEBHOOK_SECRET`
- `OPERATOR_API_SECRET`

## Recommended values
- `TELEGRAM_WEBHOOK_SECRET`: use the same value as local `.env.local`
- `OPERATOR_API_SECRET`: use the same value as local `.env.local`

## After deploy
1. Call `POST /api/research/dispatch` with `Authorization: Bearer <RESEARCH_DISPATCH_SECRET>`
2. Call `POST /api/telegram/webhook` without the Telegram secret header
3. Confirm the webhook now returns `401`
4. Trigger one full flow:
   `research -> Telegram script approval -> render -> Telegram image approval`
5. Run Instagram publish only after the above path is clean

## Expected behavior after latest deploy
- `POST /api/telegram/webhook` without `x-telegram-bot-api-secret-token` should fail
- `POST /api/runs/[id]/publish` without operator secret should fail
- `skip` should close the run instead of leaving it active
- Telegram delivery failure during dispatch should mark the run as failed
