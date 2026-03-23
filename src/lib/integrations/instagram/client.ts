type InstagramPublishInput = {
  runId: string;
  caption: string;
  slideCount: number;
};

type InstagramPublishResult = {
  creationId: string;
  mediaId: string;
  permalink: string | null;
};

type InstagramContainerStatusPayload = {
  status?: string;
  status_code?: string;
  error_message?: string;
};

type InstagramPreflightCheckStatus = "ok" | "warning" | "error";

export type InstagramPreflightCheck = {
  id: string;
  label: string;
  status: InstagramPreflightCheckStatus;
  message: string;
  details?: string | null;
};

export type InstagramPublishReadiness = {
  status: "ready" | "needs_attention";
  summary: string;
  checks: InstagramPreflightCheck[];
  account: {
    graphBaseUrl: string;
    graphVersion: string;
    publicBaseUrl: string | null;
    igUserId: string | null;
    tokenPreview: string | null;
    tokenEnvName: string | null;
    tokenKind: "page" | "user_or_unknown" | "missing";
    username: string | null;
    name: string | null;
    accountType: string | null;
  };
};

type InstagramPublishReadinessFailure = {
  summary: string;
  blockingChecks: InstagramPreflightCheck[];
};

type InstagramGraphErrorPayload = {
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

function getGraphBaseUrl() {
  return process.env.INSTAGRAM_GRAPH_BASE_URL?.trim() || "https://graph.facebook.com";
}

function getGraphVersion() {
  return process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || "v24.0";
}

function getInstagramAccessTokenConfig() {
  const preferredToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() || null;
  const legacyToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || null;

  if (preferredToken) {
    return {
      token: preferredToken,
      envName: "INSTAGRAM_PAGE_ACCESS_TOKEN",
    } as const;
  }

  if (legacyToken) {
    return {
      token: legacyToken,
      envName: "INSTAGRAM_ACCESS_TOKEN",
    } as const;
  }

  return {
    token: null,
    envName: null,
  } as const;
}

function getPublicBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null
  );
}

function buildGraphUrl(pathname: string) {
  return `${getGraphBaseUrl().replace(/\/$/, "")}/${getGraphVersion()}/${pathname.replace(/^\//, "")}`;
}

function getInstagramContainerPollAttempts() {
  const rawValue = process.env.INSTAGRAM_CONTAINER_POLL_ATTEMPTS?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 20;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }

  return parsed;
}

function getInstagramContainerPollDelayMs() {
  const rawValue = process.env.INSTAGRAM_CONTAINER_POLL_DELAY_MS?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 3000;

  if (!Number.isFinite(parsed) || parsed < 250) {
    return 3000;
  }

  return parsed;
}

function maskToken(token: string) {
  if (token.length <= 10) {
    return token;
  }

  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function detectTokenKind(token: string | null) {
  if (!token) {
    return "missing" as const;
  }

  return token.startsWith("EAAS") ? ("page" as const) : ("user_or_unknown" as const);
}

function normalizeGraphErrorMessage(payload: InstagramGraphErrorPayload, fallback: string) {
  return payload.error?.message?.trim() || fallback;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function getGraphJson<T extends Record<string, unknown>>(
  pathname: string,
  params: Record<string, string>,
) {
  const url = new URL(buildGraphUrl(pathname));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & InstagramGraphErrorPayload;

  if (!response.ok) {
    throw new Error(normalizeGraphErrorMessage(payload, "Instagram Graph API 요청에 실패했습니다."));
  }

  return payload;
}

async function postGraphForm(pathname: string, body: Record<string, string>) {
  const params = new URLSearchParams(body);
  const response = await fetch(buildGraphUrl(pathname), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || "Instagram Graph API 요청에 실패했습니다.");
  }

  return data.id;
}

async function fetchPermalink(mediaId: string, accessToken: string) {
  const response = await fetch(`${buildGraphUrl(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { permalink?: string };
  return data.permalink ?? null;
}

async function waitForContainerReady(containerId: string, accessToken: string) {
  const attempts = getInstagramContainerPollAttempts();
  const delayMs = getInstagramContainerPollDelayMs();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const container = await getGraphJson<InstagramContainerStatusPayload>(containerId, {
      fields: "status,status_code",
      access_token: accessToken,
    });
    const normalizedStatus = (
      container.status_code?.trim() ||
      container.status?.trim() ||
      ""
    ).toUpperCase();

    if (
      normalizedStatus === "FINISHED" ||
      normalizedStatus === "READY" ||
      normalizedStatus === "PUBLISHED"
    ) {
      return;
    }

    if (normalizedStatus === "ERROR" || normalizedStatus === "EXPIRED") {
      throw new Error(
        container.error_message?.trim() ||
          `Instagram container ${containerId} finished with ${normalizedStatus}.`,
      );
    }

    if (attempt < attempts) {
      await wait(delayMs);
    }
  }

  throw new Error(
    `Instagram container ${containerId} is not ready for publishing yet. Please retry in a moment.`,
  );
}

function summarizeInstagramPreflight(checks: InstagramPreflightCheck[]) {
  const errorCount = checks.filter((check) => check.status === "error").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  if (errorCount > 0) {
    return {
      status: "needs_attention" as const,
      summary: `게시 전에 고쳐야 할 오류 ${errorCount}건이 있습니다.`,
    };
  }

  if (warningCount > 0) {
    return {
      status: "needs_attention" as const,
      summary: `게시는 가능할 수 있지만 운영 전에 확인할 경고 ${warningCount}건이 있습니다.`,
    };
  }

  return {
    status: "ready" as const,
    summary: "Instagram publish 직전 점검이 모두 통과했습니다.",
  };
}

function getBlockingInstagramChecks(readiness: InstagramPublishReadiness) {
  return readiness.checks.filter((check) => check.status !== "ok");
}

function summarizeBlockingInstagramChecks(blockingChecks: InstagramPreflightCheck[]) {
  return blockingChecks
    .map((check) => {
      const details = check.details?.trim();

      return details
        ? `${check.label}: ${check.message} (${details})`
        : `${check.label}: ${check.message}`;
    })
    .join(" | ");
}

export function getInstagramPublishReadinessFailure(
  readiness: InstagramPublishReadiness,
): InstagramPublishReadinessFailure | null {
  if (readiness.status === "ready") {
    return null;
  }

  const blockingChecks = getBlockingInstagramChecks(readiness);
  const summary = summarizeBlockingInstagramChecks(blockingChecks);

  return {
    summary: summary || readiness.summary,
    blockingChecks,
  };
}

export async function assertInstagramPublishReady(options: { runId?: string | null } = {}) {
  const readiness = await verifyInstagramPublishReadiness(options);
  const failure = getInstagramPublishReadinessFailure(readiness);

  if (failure) {
    throw new Error(failure.summary);
  }

  return readiness;
}

export async function verifyInstagramPublishReadiness(
  options: { runId?: string | null } = {},
): Promise<InstagramPublishReadiness> {
  const accessTokenConfig = getInstagramAccessTokenConfig();
  const accessToken = accessTokenConfig.token;
  const igUserId = process.env.INSTAGRAM_IG_USER_ID?.trim() || null;
  const publicBaseUrl = getPublicBaseUrl();
  const checks: InstagramPreflightCheck[] = [];
  let username: string | null = null;
  let name: string | null = null;
  let accountType: string | null = null;

  checks.push(
    accessToken
      ? {
          id: "instagram-access-token",
          label: "Instagram access token",
          status: "ok",
          message: "게시용 access token이 설정되어 있습니다.",
          details: [accessTokenConfig.envName, maskToken(accessToken)].filter(Boolean).join(" • "),
        }
      : {
          id: "instagram-access-token",
          label: "Instagram access token",
          status: "error",
          message:
            "INSTAGRAM_PAGE_ACCESS_TOKEN 또는 INSTAGRAM_ACCESS_TOKEN 환경 변수가 없습니다.",
        },
  );

  checks.push(
    igUserId
      ? {
          id: "instagram-ig-user-id",
          label: "Instagram IG user id",
          status: "ok",
          message: "게시 대상 Instagram 비즈니스 계정 ID가 설정되어 있습니다.",
          details: igUserId,
        }
      : {
          id: "instagram-ig-user-id",
          label: "Instagram IG user id",
          status: "error",
          message: "INSTAGRAM_IG_USER_ID 환경 변수가 없습니다.",
        },
  );

  if (!publicBaseUrl) {
    checks.push({
      id: "public-base-url",
      label: "Public base URL",
      status: "error",
      message: "PUBLIC_BASE_URL 또는 NEXT_PUBLIC_APP_URL이 필요합니다.",
    });
  } else if (!/^https:\/\//i.test(publicBaseUrl)) {
    checks.push({
      id: "public-base-url",
      label: "Public base URL",
      status: process.env.NODE_ENV === "production" ? "error" : "warning",
      message:
        process.env.NODE_ENV === "production"
          ? "production에서는 HTTPS public base URL이 필요합니다."
          : "로컬 점검에서는 동작할 수 있지만 production publish에는 HTTPS URL이 필요합니다.",
      details: publicBaseUrl,
    });
  } else {
    checks.push({
      id: "public-base-url",
      label: "Public base URL",
      status: "ok",
      message: "공개 이미지 URL에 사용할 base URL이 설정되어 있습니다.",
      details: publicBaseUrl,
    });
  }

  const tokenKind = detectTokenKind(accessToken);

  if (tokenKind === "user_or_unknown") {
    checks.push({
      id: "instagram-token-kind",
      label: "Token kind",
      status: "warning",
      message:
        "현재 토큰이 Page access token으로 보이지 않습니다. Graph API Explorer 임시 토큰이면 빠르게 만료될 수 있습니다.",
      details: [
        "Graph API Explorer 임시 사용자 토큰 대신",
        "long-lived user token에서 파생한 Page access token을 사용하세요.",
        "새 토큰은 INSTAGRAM_PAGE_ACCESS_TOKEN 환경 변수에 저장하는 것을 권장합니다.",
      ].join(" "),
    });
  } else if (tokenKind === "page") {
    checks.push({
      id: "instagram-token-kind",
      label: "Token kind",
      status: "ok",
      message: "Page access token 형태로 보입니다.",
      details: accessTokenConfig.envName,
    });
  }

  if (accessToken && igUserId) {
    try {
      const account = await getGraphJson<{
        id?: string;
        username?: string;
        name?: string;
      }>(igUserId, {
        fields: "id,username,name",
        access_token: accessToken,
      });

      username = account.username?.trim() || null;
      name = account.name?.trim() || null;
      accountType = null;

      checks.push({
        id: "instagram-account-probe",
        label: "Instagram account probe",
        status: "ok",
        message: "현재 token으로 Instagram 비즈니스 계정 조회가 됩니다.",
        details:
          [username ? `@${username}` : null, accountType, account.id].filter(Boolean).join(" · ") ||
          igUserId,
      });
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : "현재 token으로 Instagram 비즈니스 계정을 조회하지 못했습니다.";
      const expiresAt = rawMessage.match(/Session has expired on ([^.]+)\./i)?.[1]?.trim() || null;

      checks.push({
        id: "instagram-account-probe",
        label: "Instagram account probe",
        status: "error",
        message: expiresAt
          ? `현재 Instagram 토큰이 만료되었습니다. 만료 시각: ${expiresAt}`
          : rawMessage,
        details: expiresAt
          ? [
              "Graph API Explorer 임시 사용자 토큰 대신",
              "long-lived user token에서 파생한 Page access token을 사용하세요.",
              "새 토큰은 INSTAGRAM_PAGE_ACCESS_TOKEN 환경 변수에 저장하는 것을 권장합니다.",
            ].join(" ")
          : null,
      });
    }
  }

  if (options.runId && publicBaseUrl && /^https:\/\//i.test(publicBaseUrl)) {
    const slideUrl = `${publicBaseUrl.replace(/\/$/, "")}/api/runs/${options.runId}/slides/1/png`;

    try {
      const response = await fetch(slideUrl, {
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type")?.trim() || null;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text.trim() || `HTTP ${response.status}`);
      }

      checks.push({
        id: "public-slide-probe",
        label: "Public slide probe",
        status: contentType?.startsWith("image/png") ? "ok" : "warning",
        message: contentType?.startsWith("image/png")
          ? "현재 run의 첫 번째 슬라이드 PNG URL이 외부에서 열립니다."
          : "응답은 왔지만 content-type이 image/png가 아닙니다.",
        details: slideUrl,
      });
    } catch (error) {
      checks.push({
        id: "public-slide-probe",
        label: "Public slide probe",
        status: "error",
        message:
          error instanceof Error
            ? `현재 run의 공개 PNG URL을 확인하지 못했습니다. ${error.message}`
            : "현재 run의 공개 PNG URL을 확인하지 못했습니다.",
        details: slideUrl,
      });
    }
  } else if (options.runId) {
    checks.push({
      id: "public-slide-probe",
      label: "Public slide probe",
      status: "warning",
      message: "현재 run은 선택됐지만, 공개 base URL이 없어 외부 PNG 점검을 건너뛰었습니다.",
    });
  } else {
    checks.push({
      id: "public-slide-probe",
      label: "Public slide probe",
      status: "warning",
      message: "선택된 run이 없어 슬라이드 공개 URL 점검을 건너뛰었습니다.",
    });
  }

  const summary = summarizeInstagramPreflight(checks);

  return {
    status: summary.status,
    summary: summary.summary,
    checks,
    account: {
      graphBaseUrl: getGraphBaseUrl(),
      graphVersion: getGraphVersion(),
      publicBaseUrl,
      igUserId,
      tokenPreview: accessToken ? maskToken(accessToken) : null,
      tokenEnvName: accessTokenConfig.envName,
      tokenKind,
      username,
      name,
      accountType,
    },
  };
}

export async function publishRunToInstagram({
  runId,
  caption,
  slideCount,
}: InstagramPublishInput): Promise<InstagramPublishResult> {
  if (slideCount < 1) {
    throw new Error("인스타에 게시할 슬라이드가 없습니다.");
  }

  const accessToken =
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.INSTAGRAM_ACCESS_TOKEN?.trim() ||
    null;
  const igUserId = getEnv("INSTAGRAM_IG_USER_ID");
  const publicBaseUrl = getPublicBaseUrl();

  if (!accessToken) {
    throw new Error(
      "INSTAGRAM_PAGE_ACCESS_TOKEN or INSTAGRAM_ACCESS_TOKEN environment variable is required.",
    );
  }

  if (!publicBaseUrl) {
    throw new Error("PUBLIC_BASE_URL 또는 NEXT_PUBLIC_APP_URL 환경 변수가 필요합니다.");
  }

  const imageUrls = Array.from({ length: slideCount }, (_, index) => {
    const slideNumber = index + 1;
    return `${publicBaseUrl.replace(/\/$/, "")}/api/runs/${runId}/slides/${slideNumber}/png`;
  });

  const childCreationIds: string[] = [];

  for (const imageUrl of imageUrls) {
    const childCreationId = await postGraphForm(`${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: accessToken,
    });
    childCreationIds.push(childCreationId);
  }

  const carouselCreationId = await postGraphForm(`${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childCreationIds.join(","),
    caption,
    access_token: accessToken,
  });

  await waitForContainerReady(carouselCreationId, accessToken);

  const mediaId = await postGraphForm(`${igUserId}/media_publish`, {
    creation_id: carouselCreationId,
    access_token: accessToken,
  });
  const permalink = await fetchPermalink(mediaId, accessToken);

  return {
    creationId: carouselCreationId,
    mediaId,
    permalink,
  };
}
