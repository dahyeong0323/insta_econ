import { after, NextResponse } from "next/server";

import { type RunState } from "@/lib/agents/schema";
import {
  answerTelegramCallbackQuery,
  sendTelegramTextMessage,
} from "@/lib/integrations/telegram/client";
import {
  parseTelegramApprovalButton,
  parseTelegramCommand,
  parseTelegramPublishControlButton,
} from "@/lib/integrations/telegram/messages";
import { shouldAutoPublishOnImageApproval } from "@/lib/runs/publish";
import { continueApprovedRunWorkflow } from "@/lib/runs/continuation";
import {
  recordRunApprovalAction,
  recordRunSoftError,
  respondToRunApproval,
  stopRunPublish,
} from "@/lib/runs/processor";
import { findRunByTelegramMessageId, readRunState } from "@/lib/runs/storage";
import {
  authorizeTelegramWebhookRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";
import { PersistentStorageConfigError } from "@/lib/storage/blob";
import { triggerRunPublish } from "@/lib/runs/triggers";

export const runtime = "nodejs";

type TelegramWebhookBody = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    reply_to_message?: { message_id?: number };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
    };
  };
};

type TelegramReplyContext =
  | {
      kind: "approval";
      approvalType: "script" | "image";
    }
  | {
      kind: "publish_control";
    };

function getApprovalMessageId(run: RunState, approvalType: "script" | "image") {
  return approvalType === "script"
    ? run.script_approval.telegram_message_id ?? run.telegram.script_message_id
    : run.image_approval.telegram_message_id ?? run.telegram.image_message_id;
}

function resolveTelegramReplyContext(
  run: RunState,
  messageId: string,
): TelegramReplyContext | null {
  if (run.telegram.publish_control_message_id === messageId) {
    return {
      kind: "publish_control",
    };
  }

  if (getApprovalMessageId(run, "script") === messageId) {
    return {
      kind: "approval",
      approvalType: "script",
    };
  }

  if (getApprovalMessageId(run, "image") === messageId) {
    return {
      kind: "approval",
      approvalType: "image",
    };
  }

  return null;
}

function hasPendingPublishControl(run: Awaited<ReturnType<typeof readRunState>> | null) {
  return Boolean(
    run &&
      run.publish_result.status === "failed" &&
      (run.publish_result.next_action === "manual_retry" ||
        run.publish_result.next_action === "manual_fix_required"),
  );
}

async function sendSafeTelegramText(chatId: string | null, text: string) {
  if (!chatId) {
    return;
  }

  await sendTelegramTextMessage({
    chatId,
    text,
  }).catch(() => undefined);
}

function buildApprovalAcceptedMessage(runId: string, approvalType: "script" | "image") {
  if (approvalType === "script") {
    return `초안 승인 완료\nrun: ${runId}\n이제 카드뉴스 생성 파이프라인을 이어서 진행합니다.`;
  }

  if (shouldAutoPublishOnImageApproval()) {
    return `이미지 승인 완료\nrun: ${runId}\n이제 게시 흐름을 이어서 진행합니다.`;
  }

  return `이미지 승인 완료\nrun: ${runId}\n게시 준비 완료로 기록했어요. 운영 화면에서 게시를 시작해 주세요.`;
}

function buildContinuationFailureMessage(runId: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown continuation error";
  return {
    record: `승인 후 다음 단계 자동 시작 실패: ${detail}`,
    notify: `승인은 기록됐지만 자동 진행 시작에 실패했어요.\nrun: ${runId}\n사유: ${detail}`,
  };
}

function scheduleApprovedWorkflow(run: RunState, chatId: string | null) {
  after(async () => {
    try {
      await continueApprovedRunWorkflow(run);
    } catch (error) {
      const failure = buildContinuationFailureMessage(run.id, error);
      await recordRunSoftError(run.id, failure.record).catch(() => undefined);
      await sendSafeTelegramText(chatId || run.telegram.last_chat_id, failure.notify);
    }
  });
}

async function triggerTelegramPublishRetry(runId: string, chatId: string) {
  await sendSafeTelegramText(chatId, `게시 재시도를 시작합니다.\nrun: ${runId}`);

  after(async () => {
    try {
      await triggerRunPublish(runId, {
        trigger: "manual_api",
        requestedBy: "telegram-operator",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown publish retry error";
      await recordRunSoftError(runId, `게시 재시도 시작 실패: ${detail}`, {
        publishResultError: true,
      }).catch(() => undefined);
      await sendSafeTelegramText(
        chatId,
        `게시 재시도를 시작하지 못했어요.\nrun: ${runId}\n사유: ${detail}`,
      );
    }
  });
}

async function triggerTelegramPublishStop(runId: string, chatId: string, reason: string) {
  const stoppedRun = await stopRunPublish(runId, {
    action: "stop",
    reason,
  });

  await sendSafeTelegramText(
    chatId,
    `게시 중단 기록 완료\nrun: ${stoppedRun.id}\n이번 게시 재시도는 더 이상 진행하지 않겠습니다.`,
  );
}

async function handlePublishControlCallback(
  payload: TelegramWebhookBody,
  runId: string,
  action: "retry" | "stop",
) {
  const callbackId = payload.callback_query?.id;
  const callbackMessageId = payload.callback_query?.message?.message_id
    ? String(payload.callback_query.message.message_id)
    : null;
  const chatId = payload.callback_query?.message?.chat?.id
    ? String(payload.callback_query.message.chat.id)
    : null;

  if (!callbackId) {
    return NextResponse.json({ ok: true, ignored: "missing_callback_id" });
  }

  const run = await readRunState(runId).catch(() => null);

  if (!run || !chatId) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "run 정보를 찾지 못했어요.",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, ignored: "run_not_found" });
  }

  if (
    !callbackMessageId ||
    run.telegram.publish_control_message_id !== callbackMessageId ||
    !hasPendingPublishControl(run)
  ) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "이미 처리됐거나 지금 상태와 맞지 않는 버튼입니다.",
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      ignored: "stale_publish_control",
      runId: run.id,
    });
  }

  if (action === "retry") {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "게시 재시도를 시작할게요.",
    }).catch(() => undefined);

    await triggerTelegramPublishRetry(run.id, chatId);
    return NextResponse.json({ ok: true, action: "publish_retry", runId: run.id });
  }

  await answerTelegramCallbackQuery({
    callbackQueryId: callbackId,
    text: "이번 게시 중단으로 기록했어요.",
  }).catch(() => undefined);

  await triggerTelegramPublishStop(run.id, chatId, "텔레그램 운영자가 이번 게시를 중단했어요.");
  return NextResponse.json({ ok: true, action: "publish_stop", runId: run.id });
}

async function handleApprovalCallback(
  payload: TelegramWebhookBody,
  callbackData: ReturnType<typeof parseTelegramApprovalButton>,
) {
  if (!callbackData) {
    return null;
  }

  const callbackId = payload.callback_query?.id;
  const callbackMessageId = payload.callback_query?.message?.message_id
    ? String(payload.callback_query.message.message_id)
    : null;
  const chatId = payload.callback_query?.message?.chat?.id
    ? String(payload.callback_query.message.chat.id)
    : null;

  if (!callbackId) {
    return NextResponse.json({ ok: true, ignored: "missing_callback_id" });
  }

  const run = await readRunState(callbackData.runId).catch(() => null);

  if (!run || !chatId) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "run 정보를 찾지 못했어요.",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, ignored: "run_not_found" });
  }

  const currentApproval = run[`${callbackData.approvalType}_approval`];
  const expectedMessageId = getApprovalMessageId(run, callbackData.approvalType);

  if (
    !callbackMessageId ||
    currentApproval.status !== "pending" ||
    expectedMessageId !== callbackMessageId
  ) {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "이미 처리됐거나 지금 단계와 맞지 않는 버튼입니다.",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, ignored: "stale_button", runId: run.id });
  }

  if (callbackData.action === "approve") {
    const decisionRun = await respondToRunApproval(run.id, {
      approvalType: callbackData.approvalType,
      decision: "approved",
      approver: "telegram-operator",
      responseText: "inline_button_approved",
      channel: "telegram",
      chatId,
      telegramMessageId: expectedMessageId ?? undefined,
    });

    scheduleApprovedWorkflow(decisionRun, chatId);

    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text:
        callbackData.approvalType === "script"
          ? "초안 승인으로 기록했어요."
          : "이미지 승인으로 기록했어요.",
    }).catch(() => undefined);

    await sendSafeTelegramText(
      chatId,
      buildApprovalAcceptedMessage(decisionRun.id, callbackData.approvalType),
    );

    return NextResponse.json({ ok: true, action: "approved", runId: run.id });
  }

  if (callbackData.action === "revise") {
    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text: "수정 요청 내용은 답장으로 보내 주세요.",
    }).catch(() => undefined);

    await sendSafeTelegramText(
      chatId,
      callbackData.approvalType === "script"
        ? `초안 수정 요청 대기\nrun: ${run.id}\n이 메시지에 답장으로 \`수정: 원하는 수정사항\` 형식으로 보내 주세요.`
        : `이미지 수정 요청 대기\nrun: ${run.id}\n이 메시지에 답장으로 \`수정: 원하는 수정사항\` 형식으로 보내 주세요.`,
    );

    return NextResponse.json({ ok: true, action: "revise_prompt", runId: run.id });
  }

  const actionRun = await recordRunApprovalAction(run.id, {
    approvalType: callbackData.approvalType,
    action: callbackData.action,
    approver: "telegram-operator",
    responseText: callbackData.action === "hold" ? "inline_button_hold" : "inline_button_skip",
    channel: "telegram",
    chatId,
    telegramMessageId: expectedMessageId ?? undefined,
  });

  await answerTelegramCallbackQuery({
    callbackQueryId: callbackId,
    text:
      callbackData.action === "hold"
        ? "보류 상태로 유지할게요."
        : "이번 건은 스킵으로 기록할게요.",
  }).catch(() => undefined);

  await sendSafeTelegramText(
    chatId,
    callbackData.action === "hold"
      ? `보류 이력을 남겼어요.\nrun: ${actionRun.id}\n현재 승인 대기 상태를 유지합니다.`
      : `스킵으로 기록했어요.\nrun: ${actionRun.id}\n이 run은 종료되고, 필요하면 다른 주제로 새 초안을 만들 수 있습니다.`,
  );

  return NextResponse.json({
    ok: true,
    action: callbackData.action,
    runId: actionRun.id,
  });
}

export async function POST(request: Request) {
  try {
    authorizeTelegramWebhookRequest(request);

    const payload = (await request.json()) as TelegramWebhookBody;
    const publishControlData = parseTelegramPublishControlButton(payload.callback_query?.data);
    const callbackData = parseTelegramApprovalButton(payload.callback_query?.data);

    if (publishControlData) {
      return handlePublishControlCallback(
        payload,
        publishControlData.runId,
        publishControlData.action,
      );
    }

    const callbackResponse = await handleApprovalCallback(payload, callbackData);
    if (callbackResponse) {
      return callbackResponse;
    }

    const text = payload.message?.text?.trim() ?? "";
    const replyMessageId = payload.message?.reply_to_message?.message_id;
    const chatId = payload.message?.chat?.id ? String(payload.message.chat.id) : null;
    const command = parseTelegramCommand(text);

    if (!replyMessageId || !chatId) {
      return NextResponse.json({ ok: true, ignored: "missing_context" });
    }

    const run = await findRunByTelegramMessageId(String(replyMessageId));

    if (!run) {
      await sendSafeTelegramText(
        chatId,
        "어느 run에 대한 답장인지 찾지 못했어요. 원본 메시지에 답장하는 형태로 다시 보내 주세요.",
      );

      return NextResponse.json({ ok: true, ignored: "run_not_found" });
    }

    const replyMessageIdText = String(replyMessageId);
    const replyContext = resolveTelegramReplyContext(run, replyMessageIdText);
    const pendingPublishControl = hasPendingPublishControl(run);

    if (command.action === "publish_retry" || command.action === "publish_stop") {
      if (!pendingPublishControl || replyContext?.kind !== "publish_control") {
        await sendSafeTelegramText(
          chatId,
          `지금은 publish 제어를 받을 상태가 아니에요.\nrun: ${run.id}`,
        );

        return NextResponse.json({
          ok: true,
          ignored: "no_pending_publish_control",
          runId: run.id,
        });
      }

      if (command.action === "publish_retry") {
        await triggerTelegramPublishRetry(run.id, chatId);
        return NextResponse.json({ ok: true, action: "publish_retry", runId: run.id });
      }

      await triggerTelegramPublishStop(
        run.id,
        chatId,
        "텔레그램 운영자가 텍스트 명령으로 이번 게시를 중단했어요.",
      );

      return NextResponse.json({ ok: true, action: "publish_stop", runId: run.id });
    }

    if (replyContext?.kind !== "approval") {
      await sendSafeTelegramText(
        chatId,
        "최신 승인 요청 메시지에 답장하거나 버튼을 눌러 주세요.",
      );

      return NextResponse.json({ ok: true, ignored: "stale_reply", runId: run.id });
    }

    const approvalType = replyContext.approvalType;
    const currentApproval = run[`${approvalType}_approval`];

    if (currentApproval.status !== "pending") {
      await sendSafeTelegramText(
        chatId,
        "이미 처리됐거나 최신 승인 요청이 아니에요. 가장 최근 메시지에서 다시 진행해 주세요.",
      );

      return NextResponse.json({ ok: true, ignored: "no_pending_approval" });
    }

    if (command.action === "approve_script" || command.action === "approve_image") {
      const matchesApprovalType =
        (command.action === "approve_script" && approvalType === "script") ||
        (command.action === "approve_image" && approvalType === "image");

      if (!matchesApprovalType) {
        await sendSafeTelegramText(
          chatId,
          approvalType === "script"
            ? "이 초안 요청은 `OK` 또는 버튼으로 승인해 주세요."
            : "이 이미지 요청은 `IMAGE OK`, `PUBLISH OK`, 또는 버튼으로 승인해 주세요.",
        );

        return NextResponse.json({
          ok: true,
          ignored: "mismatched_approval_command",
          runId: run.id,
        });
      }

      const decisionRun = await respondToRunApproval(run.id, {
        approvalType,
        decision: "approved",
        approver: "telegram-operator",
        responseText: text,
        channel: "telegram",
        chatId,
        telegramMessageId: replyMessageIdText,
      });

      scheduleApprovedWorkflow(decisionRun, chatId);

      await sendSafeTelegramText(chatId, buildApprovalAcceptedMessage(decisionRun.id, approvalType));
      return NextResponse.json({ ok: true, action: "approved", runId: run.id });
    }

    if (command.action === "revise") {
      await respondToRunApproval(run.id, {
        approvalType,
        decision: "rejected",
        approver: "telegram-operator",
        responseText: command.feedback,
        channel: "telegram",
        chatId,
        telegramMessageId: replyMessageIdText,
      });

      await sendSafeTelegramText(
        chatId,
        `수정 요청으로 기록했어요.\nrun: ${run.id}\n피드백: ${command.feedback}`,
      );

      return NextResponse.json({ ok: true, action: "revise", runId: run.id });
    }

    if (command.action === "hold" || command.action === "skip") {
      const actionRun = await recordRunApprovalAction(run.id, {
        approvalType,
        action: command.action,
        approver: "telegram-operator",
        responseText: text,
        channel: "telegram",
        chatId,
        telegramMessageId: replyMessageIdText,
      });

      await sendSafeTelegramText(
        chatId,
        command.action === "hold"
          ? `보류 이력을 남겼어요.\nrun: ${actionRun.id}\n현재 승인 대기 상태를 유지합니다.`
          : `스킵으로 기록했어요.\nrun: ${actionRun.id}\n이 run은 종료되고, 필요하면 다른 주제로 새 초안을 만들 수 있습니다.`,
      );

      return NextResponse.json({
        ok: true,
        action: command.action,
        runId: actionRun.id,
      });
    }

    await sendSafeTelegramText(
      chatId,
      "명령을 이해하지 못했어요.\n버튼을 누르거나 `OK`, `수정: ...`, `보류`, `스킵` 형식으로 보내 주세요.",
    );

    return NextResponse.json({ ok: true, action: "unknown", runId: run.id });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError || error instanceof PersistentStorageConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process Telegram webhook.",
      },
      { status },
    );
  }
}
