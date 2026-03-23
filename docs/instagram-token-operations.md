# Instagram Token Operations

## Use The Right Token
- Do not use a temporary access token copied directly from Graph API Explorer for production publish.
- Use a Page access token for the Facebook Page connected to the Instagram Business or Creator account.
- The safest operating pattern is:
  1. create or refresh a long-lived user token
  2. derive a Page access token from that user context
  3. store that Page access token in `INSTAGRAM_PAGE_ACCESS_TOKEN`

## Required Environment Variables
- `INSTAGRAM_PAGE_ACCESS_TOKEN`
- `INSTAGRAM_IG_USER_ID`
- `PUBLIC_BASE_URL`

## How To Validate Before Publish
- Run `POST /api/instagram/preflight`
- Only publish when the response status is `ready`
- If the response is `needs_attention`, stop and fix the token or asset issue first

## Common Failure Signs
- `Session has expired`
- `Error validating access token`
- `Invalid OAuth access token`
- `Instagram account probe` failure

## Operator Rule
- Never approve auto-publish recovery until preflight is green again
- If the token was copied from Graph API Explorer, replace it before retrying publish

## References
- Meta access token guide: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- Meta Instagram API with Facebook Login: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
