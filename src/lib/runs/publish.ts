import { type PublishRunInput } from "@/lib/agents/schema";
import { savePublishedRunToHistory } from "@/lib/history/storage";
import {
  assertInstagramPublishReady,
  publishRunToInstagram,
} from "@/lib/integrations/instagram/client";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram/client";
import { notifyTelegramRunUpdate } from "@/lib/integrations/telegram/notifications";
import {
  buildPublishControlInlineKeyboard,
  buildPublishControlMessage,
} from "@/lib/integrations/telegram/messages";
import {
  assertRunIsActive,
  completeRunPublish,
  failRunPublish,
  recordRunPublishControlMessage,
  recordRunSoftError,
  RunStoppedError,
  startRunPublish,
} from "@/lib/runs/processor";
import { buildPublishFailurePolicy } from "@/lib/runs/publish-guide";
import { renderRunSlidesToPng } from "@/lib/runs/render-png";
import { readRunState, withRunLock } from "@/lib/runs/storage";

function getInstagramPublishMaxRetries() {
  const rawValue = process.env.INSTAGRAM_PUBLISH_MAX_RETRIES?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 2;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 2;
  }

  return parsed;
}

function getInstagramPublishRetryDelayMs() {
  const rawValue = process.env.INSTAGRAM_PUBLISH_RETRY_DELAY_MS?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 1500;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 1500;
  }

  return parsed;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

type PublishControlDeliveryResult =
  | { status: "not_needed" }
  | { status: "no_chat"; runId: string }
  | { status: "sent"; runId: string; messageId: string }
  | { status: "failed"; runId: string; error: string };

async function notifyTelegramPublishControl(runId: string) {
  const run = await readRunState(runId).catch(() => null);

  if (
    !run ||
    (run.publish_result.next_action !== "manual_retry" &&
      run.publish_result.next_action !== "manual_fix_required")
  ) {
    return { status: "not_needed" } as PublishControlDeliveryResult;
  }

  if (!run.telegram.last_chat_id) {
    return {
      status: "no_chat",
      runId: run.id,
    } as PublishControlDeliveryResult;
  }

  try {
    const sent = await sendTelegramTextMessage({
      chatId: run.telegram.last_chat_id,
      text: buildPublishControlMessage(run),
      replyMarkup: buildPublishControlInlineKeyboard({
        runId: run.id,
      }),
    });

    await recordRunPublishControlMessage(run.id, {
      chatId: sent.chatId,
      messageId: sent.messageId,
    }).catch(() => undefined);

    return {
      status: "sent",
      runId: run.id,
      messageId: sent.messageId,
    } as PublishControlDeliveryResult;
  } catch (error) {
    return {
      status: "failed",
      runId: run.id,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send Telegram publish control message.",
    } as PublishControlDeliveryResult;
  }
}

export async function publishRunWorkflow(
  runId: string,
  payload: PublishRunInput = { trigger: "manual_api" },
) {
  return withRunLock(runId, "publish", async () => {
    const maxRetries = getInstagramPublishMaxRetries();
    const retryDelayMs = getInstagramPublishRetryDelayMs();
    let startNotified = false;

    for (let attemptNumber = 1; ; attemptNumber += 1) {
      let publishStarted = false;

      try {
        await assertRunIsActive(runId);
        const run = await startRunPublish(runId, payload);
        publishStarted = true;

        if (!run.project) {
          throw new Error("게시할 카드뉴스 프로젝트가 없습니다.");
        }

        await assertRunIsActive(runId);
        await assertInstagramPublishReady({
          runId,
        });

        if (!startNotified) {
          startNotified = true;
          await assertRunIsActive(runId);
          await notifyTelegramRunUpdate({
            run,
            type: "publish_started",
          });
        }

        await assertRunIsActive(runId);
        await renderRunSlidesToPng(runId);
        await assertRunIsActive(runId);
        const published = await publishRunToInstagram({
          runId,
          caption: run.project.caption,
          slideCount: run.project.slides.length,
        });

        let completedRun = await completeRunPublish(runId, published);

        try {
          await savePublishedRunToHistory(completedRun);
        } catch (historyError) {
          const historyMessage =
            historyError instanceof Error
              ? historyError.message
              : "Published history sync failed.";

          completedRun = await recordRunSoftError(
            runId,
            `게시는 완료됐지만 게시 이력 동기화에 실패했어요. ${historyMessage}`,
            {
              publishResultError: true,
            },
          ).catch(() => completedRun);
        }

        await assertRunIsActive(runId);
        await notifyTelegramRunUpdate({
          run: completedRun,
          type: "publish_succeeded",
          permalink: published.permalink,
        });

        return {
          run: completedRun,
          publish: published,
        };
      } catch (error) {
        if (error instanceof RunStoppedError) {
          throw error;
        }

        const message =
          error instanceof Error ? error.message : "Failed to publish to Instagram.";

        if (!publishStarted) {
          throw new Error(message);
        }

        const failurePolicy = buildPublishFailurePolicy(message, attemptNumber, maxRetries);

        await failRunPublish(runId, {
          errorMessage: message,
          retryable: failurePolicy.retryable,
          nextAction: failurePolicy.nextAction,
          holdReason: failurePolicy.holdReason,
        }).catch((patchError) => {
          if (patchError instanceof RunStoppedError) {
            throw patchError;
          }

          return undefined;
        });

        if (failurePolicy.nextAction === "retrying") {
          await wait(retryDelayMs);
          continue;
        }

        await assertRunIsActive(runId);
        const publishControlDelivery = await notifyTelegramPublishControl(runId);

        if (publishControlDelivery.status === "no_chat") {
          await recordRunSoftError(
            runId,
            "Publish control is waiting for manual action, but no Telegram chat is linked to this run.",
            {
              publishResultError: true,
            },
          ).catch(() => undefined);
        }

        if (publishControlDelivery.status === "failed") {
          await recordRunSoftError(
            runId,
            `Telegram publish control delivery failed: ${publishControlDelivery.error}`,
            {
              publishResultError: true,
            },
          ).catch(() => undefined);
        }

        throw new Error(message);
      }
    }
  });
}

export function shouldAutoPublishOnImageApproval() {
  return process.env.AUTO_PUBLISH_ON_IMAGE_APPROVAL?.trim().toLowerCase() === "true";
}
