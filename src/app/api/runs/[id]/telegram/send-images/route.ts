import { NextResponse } from "next/server";
import { z } from "zod";

import {
  sendTelegramImageGroup,
  sendTelegramTextMessage,
} from "@/lib/integrations/telegram/client";
import {
  buildApprovalInlineKeyboard,
  buildImageApprovalCaption,
  buildImageApprovalMessage,
} from "@/lib/integrations/telegram/messages";
import { requestRunApproval } from "@/lib/runs/processor";
import { renderRunSlidesToPng } from "@/lib/runs/render-png";
import { readRunState, withRunLock } from "@/lib/runs/storage";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";
export const maxDuration = 300;

const sendImagesSchema = z
  .object({
    chatId: z.string().max(120).optional(),
    caption: z.string().max(1024).optional(),
    approvalNote: z.string().max(500).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const rawPayload = await request.json().catch(() => ({}));
    const payload = sendImagesSchema.parse(rawPayload);
    const result = await withRunLock(id, "send-images", async () => {
      const run = await readRunState(id);

      if (!run.project) {
        throw new Error("이미지 승인 요청을 보내기 전에 카드뉴스 생성이 완료되어야 합니다.");
      }

      if (run.workflow_status !== "image_pending_approval" || run.image_approval.status !== "pending") {
        throw new Error("지금은 이미지 승인 요청을 보낼 단계가 아닙니다.");
      }

      if (run.image_approval.telegram_message_id) {
        throw new Error("이미 Telegram 이미지 승인 요청이 대기 중입니다.");
      }

      const renderedSlides = await renderRunSlidesToPng(id);
      const delivery = await sendTelegramImageGroup({
        chatId: payload.chatId,
        caption: payload.caption || buildImageApprovalCaption(run),
        images: renderedSlides.map(({ filename, buffer }) => ({
          filename,
          buffer,
        })),
      });
      const controlMessageText = buildImageApprovalMessage(run);
      const controlMessage = await sendTelegramTextMessage({
        chatId: delivery.chatId,
        text: controlMessageText,
        replyMarkup: buildApprovalInlineKeyboard({
          runId: run.id,
          approvalType: "image",
        }),
      });
      const nextRun = await requestRunApproval(id, {
        approvalType: "image",
        channel: "telegram",
        chatId: delivery.chatId,
        telegramMessageId: controlMessage.messageId ?? delivery.messageIds[0],
        note: payload.approvalNote || "Telegram image approval requested",
        deliverySummary: [
          payload.caption || buildImageApprovalCaption(run),
          "",
          controlMessageText,
          "",
          `image_count: ${renderedSlides.length}`,
        ].join("\n"),
      });

      return {
        run: nextRun,
        delivery: {
          chatId: delivery.chatId,
          messageIds: delivery.messageIds,
          controlMessageId: controlMessage.messageId,
          imageCount: renderedSlides.length,
        },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to render and send images to Telegram.",
      },
      { status },
    );
  }
}
