# ECON CAROUSEL V2

Next.js based automation app for the workflow:

`research -> Telegram script approval -> card generation -> Telegram image approval -> Instagram publish`

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- OpenAI Responses API
- Playwright
- Zod
- JSZip

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local` and fill in:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TEXT_MODEL=gpt-5.4-mini
OPENAI_PDF_MODEL=gpt-4o
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_DEFAULT_CHAT_ID=your_telegram_chat_id
PUBLIC_BASE_URL=https://your-public-app-url.com
RESEARCH_DISPATCH_SECRET=your_long_random_scheduler_secret
BLOB_READ_WRITE_TOKEN=your_vercel_blob_read_write_token
INSTAGRAM_PAGE_ACCESS_TOKEN=your_instagram_page_access_token
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token_legacy_fallback
INSTAGRAM_IG_USER_ID=your_instagram_ig_user_id
INSTAGRAM_GRAPH_API_VERSION=v24.0
INSTAGRAM_GRAPH_BASE_URL=https://graph.facebook.com
INSTAGRAM_PUBLISH_MAX_RETRIES=2
INSTAGRAM_PUBLISH_RETRY_DELAY_MS=1500
AUTO_PUBLISH_ON_IMAGE_APPROVAL=false
```

## Instagram Token Notes

- Prefer `INSTAGRAM_PAGE_ACCESS_TOKEN` over `INSTAGRAM_ACCESS_TOKEN`.
- Do not paste a short-lived Graph API Explorer user token into production.
- Use a Page access token for the Facebook Page connected to your Instagram business/creator account.
- Run `/api/instagram/preflight` before publish or scheduler rollout to catch expired tokens early.

## Research Dispatch

`POST /api/research/dispatch` is the scheduler entrypoint.

- Auth: `Authorization: Bearer <RESEARCH_DISPATCH_SECRET>` or `x-research-dispatch-secret`
- Returns `202` when an active run already exists
- Accepts `{ "force": true }` to bypass the active-run guard

Example:

```bash
curl -X POST "$PUBLIC_BASE_URL/api/research/dispatch" \
  -H "Authorization: Bearer $RESEARCH_DISPATCH_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"
```

## Storage Model

- Local development:
  - run files and artifacts are stored under `.data/runs`
  - published history is stored in local SQLite
- Vercel deployment:
  - run state, artifacts, published history, and the dispatch lock use Vercel Blob
  - SQLite mirror is bypassed and event APIs fall back to `run.json` data

## Vercel Notes

- `BLOB_READ_WRITE_TOKEN` is required for workflow endpoints on Vercel
- Without Blob, Vercel cannot persist `run` state or artifacts across function invocations
- `PUBLIC_BASE_URL` must be the public deployed URL so Telegram and Instagram can reach your routes

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```
