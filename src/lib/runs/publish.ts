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

function isRetryablePublishError(message: string) {
  return /(fetch failed|network|timeout|timed out|temporar|try again|rate limit|too many requests|server error|502|503|504|500|econnreset|socket hang up)/i.test(
    message,
  );
}

function isInstagramTokenOrPermissionError(message: string) {
  return /(access token|token|session has expired|invalid oauth|oauth|permissions? error|instagram account probe|page access token|user token|graph api explorer|insufficient permission)/i.test(
    message,
  );
}

function isInstagramAssetConfigurationError(message: string) {
  return /(public base url|public slide probe|image\/png|image_url|unsupported image|base url|png url)/i.test(
    message,
  );
}

function buildPublishFailurePolicy(message: string, attemptNumber: number, maxRetries: number) {
  if (isRetryablePublishError(message)) {
    if (attemptNumber <= maxRetries) {
      return {
        retryable: true,
        nextAction: "retrying" as const,
        holdReason: null,
      };
    }

    return {
      retryable: true,
      nextAction: "manual_retry" as const,
      holdReason: `일시적 오류가 반복되어 자동 재시도 한도(${maxRetries})를 넘겼습니다.`,
    };
  }

  if (isInstagramTokenOrPermissionError(message)) {
    return {
      retryable: false,
      nextAction: "manual_fix_required" as const,
      holdReason:
        "Instagram 토큰 또는 권한이 유효하지 않습니다. Graph API Explorer 임시 토큰 대신 장기 사용자 토큰에서 만든 Page access token으로 INSTAGRAM_PAGE_ACCESS_TOKEN을 교체하고, /api/instagram/preflight가 ready인지 다시 확인하세요.",
    };
  }

  if (isInstagramAssetConfigurationError(message)) {
    return {
      retryable: false,
      nextAction: "manual_fix_required" as const,
      holdReason:
        "공개 slide PNG URL 또는 PUBLIC_BASE_URL 설정에 문제가 있습니다. /api/instagram/preflight에서 public slide probe가 ready인지 먼저 확인한 뒤 다시 게시하세요.",
    };
  }

  return {
    retryable: false,
    nextAction: "manual_fix_required" as const,
    holdReason:
      "권한, 토큰, 공개 URL, 이미지 형식 같은 설정 문제일 가능성이 높아 수동 확인이 필요합니다.",
  };
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function notifyTelegramPublishControl(runId: string) {
  const run = await readRunState(runId).catch(() => null);

  if (
    !run ||
    (run.publish_result.next_action !== "manual_retry" &&
      run.publish_result.next_action !== "manual_fix_required")
  ) {
    return;
  }

  const sent = await sendTelegramTextMessage({
    chatId: run.telegram.last_chat_id,
    text: buildPublishControlMessage(run),
    replyMarkup: buildPublishControlInlineKeyboard({
      runId: run.id,
    }),
  }).catch(() => undefined);

  if (sent) {
    await recordRunPublishControlMessage(run.id, {
      chatId: sent.chatId,
      messageId: sent.messageId,
    }).catch(() => undefined);
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
            `게시는 완료됐지만 게시 이력 저장에 실패했어요: ${historyMessage}`,
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
        await notifyTelegramPublishControl(runId);

        throw new Error(message);
      }
    }
  });
}

export function shouldAutoPublishOnImageApproval() {
  return process.env.AUTO_PUBLISH_ON_IMAGE_APPROVAL?.trim().toLowerCase() === "true";
}
