# Instagram Token Playbook

## Goal

Use a token that survives normal day-to-day publishing and fail early before a publish attempt if Instagram access is broken.

## What To Store

- Preferred env: `INSTAGRAM_PAGE_ACCESS_TOKEN`
- Required env: `INSTAGRAM_IG_USER_ID`

`INSTAGRAM_ACCESS_TOKEN` is still supported as a legacy fallback, but new setups should use `INSTAGRAM_PAGE_ACCESS_TOKEN`.

## What Not To Do

- Do not paste a short-lived Graph API Explorer user token into production.
- Do not assume a token will live forever even if it worked once.

## Operational Rule

1. Get a Page access token for the Facebook Page that is connected to the Instagram business/creator account.
2. Save it in Vercel as `INSTAGRAM_PAGE_ACCESS_TOKEN`.
3. Run `/api/instagram/preflight` before a publish rollout.
4. If preflight fails, stop publish and rotate the token before retrying.

## Why This Project Still Checks Preflight

Even a longer-lived Page token can still become unusable after permission changes, password/security events, or Meta-side invalidation. The app now blocks publish when Instagram preflight is not clean.

## References

- https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
