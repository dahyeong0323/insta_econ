import { type RunState } from "@/lib/agents/schema";
import { type SimilarityCheckResult } from "@/lib/history/similarity";

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<
    Array<{
      text: string;
      callback_data: string;
    }>
  >;
};

type DraftMessageInput = {
  run: RunState;
  summary: string;
  keyTerms: string[];
  approvalNote: string;
  similarity: SimilarityCheckResult;
};

export type TelegramCommand =
  | { action: "approve_script" }
  | { action: "approve_image" }
  | { action: "publish_retry" }
  | { action: "publish_stop" }
  | { action: "hold" }
  | { action: "skip" }
  | { action: "revise"; feedback: string }
  | { action: "unknown" };

export type TelegramApprovalButtonAction =
  | "approve"
  | "revise"
  | "hold"
  | "skip";

export type TelegramPublishControlAction = "retry" | "stop";

export type TelegramApprovalButtonPayload = {
  runId: string;
  approvalType: "script" | "image";
  action: TelegramApprovalButtonAction;
};

export type TelegramPublishControlPayload = {
  runId: string;
  action: TelegramPublishControlAction;
};

export type TelegramRunNotificationType =
  | "render_started"
  | "image_review_ready"
  | "run_failed"
  | "publish_started"
  | "publish_succeeded";

function formatTitle(run: RunState) {
  return run.title ?? run.project?.project_title ?? "제목 없음";
}

function formatSimilarity(similarity: SimilarityCheckResult) {
  const headline =
    similarity.decision === "block"
      ? "유사성 판정: BLOCK"
      : similarity.decision === "review"
        ? "유사성 판정: REVIEW"
        : "유사성 판정: CLEAR";

  const reasonLines = similarity.reasons.map((reason) => `- ${reason}`);
  return reasonLines.length > 0 ? `${headline}\n${reasonLines.join("\n")}` : headline;
}

function renderCompactText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "상세 사유가 비어 있습니다.";
}

export function buildScriptApprovalMessage({
  run,
  summary,
  keyTerms,
  approvalNote,
  similarity,
}: DraftMessageInput) {
  return [
    "경제 카드뉴스 초안 승인 요청",
    "",
    `run: ${run.id}`,
    `주제: ${formatTitle(run)}`,
    "",
    "요약",
    summary,
    "",
    `키워드: ${keyTerms.join(", ")}`,
    "",
    formatSimilarity(similarity),
    "",
    "처리 방법",
    "- 버튼: 승인 / 수정 요청 / 보류 / 스킵",
    "- 답장: `수정: 원하는 수정사항`",
    "",
    `메모: ${approvalNote}`,
  ].join("\n");
}

export function buildImageApprovalCaption(run: RunState) {
  return [
    "카드뉴스 이미지 초안입니다.",
    `run: ${run.id}`,
    `주제: ${formatTitle(run)}`,
    "",
    "아래 제어 메시지에서 승인 여부를 선택해 주세요.",
  ].join("\n");
}

export function buildImageApprovalMessage(run: RunState) {
  return [
    "카드뉴스 이미지 승인 요청",
    "",
    `run: ${run.id}`,
    `주제: ${formatTitle(run)}`,
    "",
    "처리 방법",
    "- 버튼: 승인 / 수정 요청 / 보류 / 스킵",
    "- 답장: `수정: 원하는 수정사항`",
    "",
    "이미지 승인 후에는 게시 준비 상태로 넘어갑니다.",
  ].join("\n");
}

export function buildPublishControlMessage(run: RunState) {
  const nextAction =
    run.publish_result.next_action === "manual_retry"
      ? "운영자가 게시 재시도 여부를 결정해야 합니다."
      : "수정 확인 뒤 다시 게시할지 결정해야 합니다.";

  return [
    "인스타 게시 확인 요청",
    "",
    `run: ${run.id}`,
    `주제: ${formatTitle(run)}`,
    "",
    `상태: ${run.publish_result.status}`,
    `다음 조치: ${run.publish_result.next_action}`,
    "",
    renderCompactText(run.publish_result.hold_reason ?? run.publish_result.error),
    "",
    nextAction,
    "아래 버튼에서 `게시 다시 시도` 또는 `이번 게시 중단`을 선택하거나, 답장으로 같은 명령을 보낼 수 있습니다.",
  ].join("\n");
}

export function buildRunNotificationMessage(input: {
  run: RunState;
  type: TelegramRunNotificationType;
  errorMessage?: string | null;
  permalink?: string | null;
}) {
  const title = formatTitle(input.run);

  if (input.type === "render_started") {
    return [
      "카드뉴스 생성 시작",
      "",
      `run: ${input.run.id}`,
      `주제: ${title}`,
      "",
      "초안 승인이 끝나 카드뉴스 생성 파이프라인을 이어서 진행합니다.",
    ].join("\n");
  }

  if (input.type === "image_review_ready") {
    return [
      "카드뉴스 생성 완료",
      "",
      `run: ${input.run.id}`,
      `주제: ${title}`,
      "",
      "이제 이미지 승인 단계로 넘어갈 준비가 됐습니다.",
      "운영 화면에서 Telegram 이미지 전송을 실행해 최종 검수를 이어가세요.",
    ].join("\n");
  }

  if (input.type === "run_failed") {
    return [
      "카드뉴스 생성 실패",
      "",
      `run: ${input.run.id}`,
      `주제: ${title}`,
      "",
      renderCompactText(input.errorMessage ?? input.run.error),
      "",
      "운영 화면에서 run 상태와 로그를 확인해 주세요.",
    ].join("\n");
  }

  if (input.type === "publish_started") {
    return [
      "인스타 게시 시작",
      "",
      `run: ${input.run.id}`,
      `주제: ${title}`,
      "",
      "Instagram 업로드를 진행합니다.",
    ].join("\n");
  }

  return [
    "인스타 게시 완료",
    "",
    `run: ${input.run.id}`,
    `주제: ${title}`,
    "",
    input.permalink ? `링크: ${input.permalink}` : "게시 링크는 아직 전달되지 않았습니다.",
  ].join("\n");
}

export function serializeTelegramApprovalButton(
  payload: TelegramApprovalButtonPayload,
) {
  return `run:${payload.runId}:${payload.approvalType}:${payload.action}`;
}

export function serializeTelegramPublishControlButton(
  payload: TelegramPublishControlPayload,
) {
  return `publish:${payload.runId}:${payload.action}`;
}

export function parseTelegramApprovalButton(data: string | null | undefined) {
  const normalized = data?.trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(
    /^run:([0-9a-f-]{36}):(script|image):(approve|revise|hold|skip)$/i,
  );

  if (!match) {
    return null;
  }

  return {
    runId: match[1],
    approvalType: match[2] as "script" | "image",
    action: match[3] as TelegramApprovalButtonAction,
  };
}

export function parseTelegramPublishControlButton(data: string | null | undefined) {
  const normalized = data?.trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^publish:([0-9a-f-]{36}):(retry|stop)$/i);

  if (!match) {
    return null;
  }

  return {
    runId: match[1],
    action: match[2] as TelegramPublishControlAction,
  };
}

export function buildApprovalInlineKeyboard(input: {
  runId: string;
  approvalType: "script" | "image";
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: input.approvalType === "script" ? "초안 승인" : "이미지 승인",
          callback_data: serializeTelegramApprovalButton({
            runId: input.runId,
            approvalType: input.approvalType,
            action: "approve",
          }),
        },
        {
          text: "수정 요청",
          callback_data: serializeTelegramApprovalButton({
            runId: input.runId,
            approvalType: input.approvalType,
            action: "revise",
          }),
        },
      ],
      [
        {
          text: "보류",
          callback_data: serializeTelegramApprovalButton({
            runId: input.runId,
            approvalType: input.approvalType,
            action: "hold",
          }),
        },
        {
          text: "스킵",
          callback_data: serializeTelegramApprovalButton({
            runId: input.runId,
            approvalType: input.approvalType,
            action: "skip",
          }),
        },
      ],
    ],
  };
}

export function buildPublishControlInlineKeyboard(input: {
  runId: string;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "게시 다시 시도",
          callback_data: serializeTelegramPublishControlButton({
            runId: input.runId,
            action: "retry",
          }),
        },
        {
          text: "이번 게시 중단",
          callback_data: serializeTelegramPublishControlButton({
            runId: input.runId,
            action: "stop",
          }),
        },
      ],
    ],
  };
}

export function parseTelegramCommand(text: string | null | undefined): TelegramCommand {
  const normalized = text?.trim();

  if (!normalized) {
    return { action: "unknown" };
  }

  if (/^ok$/iu.test(normalized)) {
    return { action: "approve_script" };
  }

  if (/^image ok$/iu.test(normalized) || /^publish ok$/iu.test(normalized)) {
    return { action: "approve_image" };
  }

  if (/^(게시\s*다시\s*시도|publish\s*retry|retry\s*publish)$/iu.test(normalized)) {
    return { action: "publish_retry" };
  }

  if (/^(게시\s*중단|publish\s*stop|stop\s*publish)$/iu.test(normalized)) {
    return { action: "publish_stop" };
  }

  if (/^(보류|hold)$/iu.test(normalized)) {
    return { action: "hold" };
  }

  if (/^(스킵|skip|pass)$/iu.test(normalized)) {
    return { action: "skip" };
  }

  const reviseMatch = normalized.match(/^(수정|revise)\s*:\s*(.+)$/iu);

  if (reviseMatch) {
    return {
      action: "revise",
      feedback: reviseMatch[2].trim(),
    };
  }

  return { action: "unknown" };
}
