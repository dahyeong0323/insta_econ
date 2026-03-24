import { after, NextResponse } from "next/server";

import { type RunState } from "@/lib/agents/schema";
import {
  answerTelegramCallbackQuery,
  sendTelegramTextMessage,
} from "@/lib/integrations/telegram/client";
import {
  parseTelegramApprovalButton,
  parseTelegramPublishControlButton,
} from "@/lib/integrations/telegram/messages";
import { parseTelegramCommand } from "@/lib/integrations/telegram/command-parser";
import { shouldAutoPublishOnImageApproval } from "@/lib/runs/publish";
import { continueApprovedRunWorkflow } from "@/lib/runs/continuation";
import {
  recordRunApprovalAction,
  recordApprovalReplyPrompt,
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

function getApprovalReplyMessageId(run: RunState, approvalType: "script" | "image") {
  return approvalType === "script"
    ? run.telegram.script_reply_message_id
    : run.telegram.image_reply_message_id;
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

  if (getApprovalReplyMessageId(run, "script") === messageId) {
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

  if (getApprovalReplyMessageId(run, "image") === messageId) {
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
    return `Script approved\nrun: ${runId}\nStarting the render pipeline now.`;
  }

  if (shouldAutoPublishOnImageApproval()) {
    return `Images approved\nrun: ${runId}\nStarting the publish flow now.`;
  }

  return `Images approved\nrun: ${runId}\nSaved as ready to publish. Start publish from the operator screen.`;
}

function buildContinuationFailureMessage(runId: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown continuation error";
  return {
    record: `Approval continuation failed: ${detail}`, 
    notify: `Approval was saved, but the next step failed to start.\nrun: ${runId}\nReason: ${detail}`, 
  };
}

async function scheduleApprovedWorkflow(run: RunState, chatId: string | null) {
  try {
    await continueApprovedRunWorkflow(run);
  } catch (error) {
    const failure = buildContinuationFailureMessage(run.id, error);
    await recordRunSoftError(run.id, failure.record).catch(() => undefined);
    await sendSafeTelegramText(chatId || run.telegram.last_chat_id, failure.notify);
  }
}

async function triggerTelegramPublishRetry(runId: string, chatId: string) {
  await sendSafeTelegramText(chatId, `Starting publish retry.\nrun: ${runId}`);

  after(async () => {
    try {
      await triggerRunPublish(runId, {
        trigger: "manual_api",
        requestedBy: "telegram-operator",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown publish retry error";
      await recordRunSoftError(runId, `Publish retry failed to start: ${detail}`, {
        publishResultError: true,
      }).catch(() => undefined);
      await sendSafeTelegramText(
        chatId,
        `Could not start publish retry.\nrun: ${runId}\nReason: ${detail}`, 
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
    `Publish stop recorded.\nrun: ${stoppedRun.id}\nThis publish attempt will not continue.`, 
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
      text: "Run info not found.",
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
      text: "This button does not match the current publish state.",
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
      text: "Starting publish retry.",
    }).catch(() => undefined);

    await triggerTelegramPublishRetry(run.id, chatId);
    return NextResponse.json({ ok: true, action: "publish_retry", runId: run.id });
  }

  await answerTelegramCallbackQuery({
    callbackQueryId: callbackId,
    text: "Publish stop recorded.",
  }).catch(() => undefined);

  await triggerTelegramPublishStop(run.id, chatId, "Telegram operator stopped this publish attempt.");
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
      text: "Run info not found.",
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
      text: "This button does not match the current approval state.",
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

    await scheduleApprovedWorkflow(decisionRun, chatId);

    await answerTelegramCallbackQuery({
      callbackQueryId: callbackId,
      text:
        callbackData.approvalType === "script"
          ? "Script approval recorded."
          : "Image approval recorded.",
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
      text: "Send the revision request as a reply.",
    }).catch(() => undefined);

    const promptMessage = await sendTelegramTextMessage({
      chatId,
      text:
        callbackData.approvalType === "script"
          ? `Script revision requested\nrun: ${run.id}\nReply to this helper message using \`revise: your feedback\`.`
          : `Image revision requested\nrun: ${run.id}\nReply to this helper message using \`revise: your feedback\`.`,
    }).catch(() => null);

    if (promptMessage?.messageId) {
      await recordApprovalReplyPrompt(run.id, {
        approvalType: callbackData.approvalType,
        chatId: promptMessage.chatId,
        telegramMessageId: promptMessage.messageId,
      });
    }

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
        ? "Hold recorded."
        : "Skip recorded.",
  }).catch(() => undefined);

  await sendSafeTelegramText(
    chatId,
    callbackData.action === "hold"
      ? `Hold recorded.\nrun: ${actionRun.id}\nThe approval stays pending.`
      : `Skip recorded.\nrun: ${actionRun.id}\nThis run is closed. You can create a new draft with another topic if needed.`,
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
        "Could not find which run this reply belongs to. Reply to the original request message and try again.",
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
          `This run is not waiting for publish control.\nrun: ${run.id}`, 
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
        "Telegram operator stopped this publish attempt with a text command.",
      );

      return NextResponse.json({ ok: true, action: "publish_stop", runId: run.id });
    }

    if (replyContext?.kind !== "approval") {
      await sendSafeTelegramText(
        chatId,
        "Reply to the latest approval request message, or use the button on that message.",
      );

      return NextResponse.json({ ok: true, ignored: "stale_reply", runId: run.id });
    }

    const approvalType = replyContext.approvalType;
    const currentApproval = run[`${approvalType}_approval`];

    if (currentApproval.status !== "pending") {
      await sendSafeTelegramText(
        chatId,
        "This approval is already handled or is no longer the latest pending request.",
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
            ? "Approve this script with `OK` or the button on the message."
            : "Approve this image set with `IMAGE OK`, `PUBLISH OK`, or the button on the message.",
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

      await scheduleApprovedWorkflow(decisionRun, chatId);

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
        `Revision request recorded.\nrun: ${run.id}\nFeedback: ${command.feedback}`, 
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
          ? `Hold recorded.\nrun: ${actionRun.id}\nThe approval stays pending.`
          : `Skip recorded.\nrun: ${actionRun.id}\nThis run is closed. You can create a new draft with another topic if needed.`, 
      );

      return NextResponse.json({
        ok: true,
        action: command.action,
        runId: actionRun.id,
      });
    }

    await sendSafeTelegramText(
      chatId,
      "Command not understood. Use the button, or reply with `OK`, `revise: ...`, `hold`, or `skip`.",
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
