import { createHash, timingSafeEqual } from "node:crypto";

export class RequestAuthError extends Error {}

export class RequestConfigError extends Error {}

function toDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

function secretsMatch(expected: string, provided: string) {
  return timingSafeEqual(toDigest(expected), toDigest(provided));
}

function getConfiguredSecrets(names: string[]) {
  return names
    .map((name) => process.env[name]?.trim())
    .filter((value): value is string => Boolean(value));
}

function matchesAnySecret(expectedSecrets: string[], providedSecret: string) {
  return expectedSecrets.some((expectedSecret) => secretsMatch(expectedSecret, providedSecret));
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

function readTrimmedHeader(request: Request, headerName: string) {
  return request.headers.get(headerName)?.trim() || null;
}

export function authorizeOperatorRequest(request: Request) {
  const expectedSecrets = getConfiguredSecrets([
    "OPERATOR_API_SECRET",
    "RESEARCH_DISPATCH_SECRET",
  ]);

  if (expectedSecrets.length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new RequestConfigError(
        "OPERATOR_API_SECRET or RESEARCH_DISPATCH_SECRET is required in production.",
      );
    }

    return;
  }

  const providedSecret =
    readTrimmedHeader(request, "x-operator-secret") ??
    readTrimmedHeader(request, "x-research-dispatch-secret") ??
    readBearerToken(request);

  if (!providedSecret) {
    throw new RequestAuthError("Operator or dispatch secret is required.");
  }

  if (!matchesAnySecret(expectedSecrets, providedSecret)) {
    throw new RequestAuthError("Operator authentication failed.");
  }
}

export function authorizeTelegramWebhookRequest(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;

  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new RequestConfigError(
        "TELEGRAM_WEBHOOK_SECRET environment variable is required in production.",
      );
    }

    return;
  }

  const providedSecret = readTrimmedHeader(
    request,
    "x-telegram-bot-api-secret-token",
  );

  if (!providedSecret) {
    throw new RequestAuthError("Telegram webhook secret header is required.");
  }

  if (!secretsMatch(expectedSecret, providedSecret)) {
    throw new RequestAuthError("Telegram webhook authentication failed.");
  }
}
