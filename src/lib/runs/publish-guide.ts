import type { PublishResult } from "@/lib/agents/schema";

export type PublishFailureKind =
  | "transient"
  | "token_or_permission"
  | "asset_configuration"
  | "generic_configuration";

export type PublishFailurePolicy = {
  retryable: boolean;
  nextAction: "retrying" | "manual_retry" | "manual_fix_required";
  holdReason: string | null;
  failureKind: PublishFailureKind;
};

export type PublishOperatorGuide = {
  badge: "READY" | "RUNNING" | "DONE" | "RETRY" | "FIX";
  headline: string;
  summary: string;
  recommendedAction: string;
};

export function isRetryablePublishError(message: string) {
  return /(fetch failed|network|timeout|timed out|temporar|try again|rate limit|too many requests|server error|502|503|504|500|econnreset|socket hang up)/i.test(
    message,
  );
}

export function isInstagramTokenOrPermissionError(message: string) {
  return /(access token|token|session has expired|invalid oauth|oauth|permissions? error|instagram account probe|page access token|user token|graph api explorer|insufficient permission)/i.test(
    message,
  );
}

export function isInstagramAssetConfigurationError(message: string) {
  return /(public base url|public slide probe|image\/png|image_url|unsupported image|base url|png url)/i.test(
    message,
  );
}

export function classifyPublishFailure(message: string): PublishFailureKind {
  if (isRetryablePublishError(message)) {
    return "transient";
  }

  if (isInstagramTokenOrPermissionError(message)) {
    return "token_or_permission";
  }

  if (isInstagramAssetConfigurationError(message)) {
    return "asset_configuration";
  }

  return "generic_configuration";
}

export function buildPublishFailurePolicy(
  message: string,
  attemptNumber: number,
  maxRetries: number,
): PublishFailurePolicy {
  const failureKind = classifyPublishFailure(message);

  if (failureKind === "transient") {
    if (attemptNumber <= maxRetries) {
      return {
        retryable: true,
        nextAction: "retrying",
        holdReason: null,
        failureKind,
      };
    }

    return {
      retryable: true,
      nextAction: "manual_retry",
      holdReason: `일시 오류가 반복돼 자동 재시도(${maxRetries}회)를 넘겼습니다.`,
      failureKind,
    };
  }

  if (failureKind === "token_or_permission") {
    return {
      retryable: false,
      nextAction: "manual_fix_required",
      holdReason:
        "Instagram 토큰 또는 권한이 유효하지 않습니다. Page access token을 다시 넣고 `/api/instagram/preflight`가 ready인지 확인한 뒤 재시도하세요.",
      failureKind,
    };
  }

  if (failureKind === "asset_configuration") {
    return {
      retryable: false,
      nextAction: "manual_fix_required",
      holdReason:
        "공개 slide PNG URL 또는 `PUBLIC_BASE_URL` 설정에 문제가 있습니다. `/api/instagram/preflight`에서 public slide probe를 먼저 확인하세요.",
      failureKind,
    };
  }

  return {
    retryable: false,
    nextAction: "manual_fix_required",
    holdReason:
      "권한, 토큰, 공개 URL, 이미지 형식 같은 운영 설정 문제 가능성이 높습니다. preflight와 환경변수를 먼저 점검하세요.",
    failureKind,
  };
}

function renderDetail(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function getPublishOperatorGuide(publishResult: PublishResult): PublishOperatorGuide {
  const detail = renderDetail(
    publishResult.hold_reason ?? publishResult.error,
    "아직 게시 시도 기록이 없습니다.",
  );
  const failureKind = classifyPublishFailure(detail);

  if (publishResult.status === "published") {
    return {
      badge: "DONE",
      headline: "게시가 완료되었습니다.",
      summary: "Instagram publish가 끝나 기록만 확인하면 됩니다.",
      recommendedAction: "permalink와 published history만 확인하고 다음 run으로 넘어가면 됩니다.",
    };
  }

  if (publishResult.status === "publishing") {
    return {
      badge: "RUNNING",
      headline: "게시가 진행 중입니다.",
      summary: "Instagram 업로드 중이라 잠시 기다리는 편이 안전합니다.",
      recommendedAction: "오래 멈춘 경우에만 새로고침 후 중단 여부를 판단하세요.",
    };
  }

  if (publishResult.next_action === "manual_retry") {
    return {
      badge: "RETRY",
      headline: "수동 재시도가 필요합니다.",
      summary: detail,
      recommendedAction: "일시 오류가 반복된 상태이니 환경이 정상인지 확인한 뒤 retry publish를 실행하세요.",
    };
  }

  if (publishResult.next_action === "manual_fix_required") {
    if (failureKind === "token_or_permission") {
      return {
        badge: "FIX",
        headline: "토큰 또는 권한 수정이 필요합니다.",
        summary: detail,
        recommendedAction: "Page access token과 Instagram 권한을 점검하고 preflight가 ready인지 확인한 뒤 다시 게시하세요.",
      };
    }

    if (failureKind === "asset_configuration") {
      return {
        badge: "FIX",
        headline: "공개 URL 또는 PNG 접근 설정 수정이 필요합니다.",
        summary: detail,
        recommendedAction: "PUBLIC_BASE_URL, 공개 slide URL, PNG probe를 먼저 확인한 뒤 재시도하세요.",
      };
    }

    return {
      badge: "FIX",
      headline: "운영 설정 확인이 필요합니다.",
      summary: detail,
      recommendedAction: "preflight와 환경변수를 먼저 점검하고, 오류 원인을 정리한 뒤 다시 게시하세요.",
    };
  }

  return {
    badge: "READY",
    headline: "게시 판단 전 상태입니다.",
    summary: detail,
    recommendedAction: "이미지 승인 후 publish를 시작하면 더 구체적인 결과가 쌓입니다.",
  };
}
