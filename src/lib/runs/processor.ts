import {
  type ApprovalDecision,
  type ApprovalHistoryEntry,
  type ApprovalState,
  type ApprovalTarget,
  createRunSchema,
  publishControlSchema,
  publishRunSchema,
  type PublishAttempt,
  type PublishControlInput,
  regenerateSlideSchema,
  requestApprovalSchema,
  respondApprovalSchema,
  type CarouselProject,
  type PublishRunInput,
  type PublishResult,
  type RequestApprovalInput,
  type RespondApprovalInput,
  type RunEntrypoint,
  type RunState,
  type SourceBundle,
  type StageName,
  type WorkflowStatus,
} from "@/lib/agents/schema";
import {
  buildCarouselProject,
  buildSourceBundle,
  qaReviewAndRepair,
  regenerateSlideFromProject,
} from "@/lib/agents/pipeline";
import { notifyTelegramRunUpdate } from "@/lib/integrations/telegram/notifications";
import { extractTextFromPdfBuffer } from "@/lib/pdf/extract";
import {
  buildEmptyLogs,
  readArtifact,
  readRunState,
  withRunLock,
  writeArtifact,
  writeRunState,
} from "@/lib/runs/storage";

export class RunStoppedError extends Error {}

function now() {
  return new Date().toISOString();
}

function createIdleApprovalState(): ApprovalState {
  return {
    status: "not_requested",
    requested_at: null,
    responded_at: null,
    approved_at: null,
    rejected_at: null,
    approver: null,
    response_text: null,
    channel: null,
    telegram_message_id: null,
  };
}

function createPendingApprovalState(
  channel: ApprovalState["channel"],
  requestedAt = now(),
): ApprovalState {
  return {
    ...createIdleApprovalState(),
    status: "pending",
    requested_at: requestedAt,
    channel,
  };
}

function createEmptyPublishResult(): PublishResult {
  return {
    status: "not_requested",
    requested_at: null,
    started_at: null,
    published_at: null,
    provider: null,
    instagram_creation_id: null,
    instagram_media_id: null,
    permalink: null,
    error: null,
    current_attempt_id: null,
    retryable: false,
    next_action: "none",
    hold_reason: null,
    held_at: null,
    last_trigger: null,
  };
}

function isRunFailed(run: RunState) {
  return run.status === "failed" || run.workflow_status === "failed";
}

export async function assertRunIsActive(runId: string) {
  const current = await readRunState(runId);

  if (isRunFailed(current)) {
    throw new RunStoppedError("Run has already been failed.");
  }

  return current;
}

function trimHistoryText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function getApprovalKey(approvalType: ApprovalTarget) {
  return approvalType === "script" ? "script_approval" : "image_approval";
}

function getTelegramMessageKey(approvalType: ApprovalTarget) {
  return approvalType === "script" ? "script_message_id" : "image_message_id";
}

function getTelegramReplyMessageKey(approvalType: ApprovalTarget) {
  return approvalType === "script" ? "script_reply_message_id" : "image_reply_message_id";
}

function getWorkflowStatusForApprovalRequest(approvalType: ApprovalTarget): WorkflowStatus {
  return approvalType === "script" ? "script_pending_approval" : "image_pending_approval";
}

function getWorkflowStatusForApprovalDecision(
  approvalType: ApprovalTarget,
  decision: ApprovalDecision,
  current: RunState,
): WorkflowStatus {
  if (decision === "approved") {
    return approvalType === "script" ? "script_approved" : "image_approved";
  }

  if (approvalType === "script") {
    return current.entrypoint === "research" ? "researched" : "draft";
  }

  return "script_approved";
}

function getPendingWorkflowStatus(approvalType: ApprovalTarget): WorkflowStatus {
  return approvalType === "script" ? "script_pending_approval" : "image_pending_approval";
}

function getRunRevisionRequest(run: RunState) {
  if (run.image_approval.status === "rejected") {
    return trimHistoryText(run.image_approval.response_text, 1000);
  }

  if (run.script_approval.status === "rejected") {
    return trimHistoryText(run.script_approval.response_text, 1000);
  }

  return null;
}

function appendApprovalHistory(
  current: RunState,
  entry: Omit<ApprovalHistoryEntry, "id">,
) {
  return [
    ...current.approval_history,
    {
      id: crypto.randomUUID(),
      ...entry,
    },
  ];
}

function createPublishAttempt(
  parsed: PublishRunInput,
  current: RunState,
  requestedAt: string,
): PublishAttempt {
  return {
    id: crypto.randomUUID(),
    trigger: parsed.trigger ?? "manual_api",
    requested_by: trimHistoryText(parsed.requestedBy, 80),
    status: "publishing",
    requested_at: requestedAt,
    started_at: requestedAt,
    completed_at: null,
    caption: trimHistoryText(parsed.caption ?? current.project?.caption ?? null, 2200),
    provider: "instagram",
    instagram_creation_id: null,
    instagram_media_id: null,
    permalink: null,
    error: null,
  };
}

function updatePublishAttempt(
  current: RunState,
  attemptId: string | null,
  updater: (attempt: PublishAttempt) => PublishAttempt,
) {
  if (!attemptId) {
    return current.publish_attempts;
  }

  let updated = false;
  const attempts = current.publish_attempts.map((attempt) => {
    if (attempt.id !== attemptId) {
      return attempt;
    }

    updated = true;
    return updater(attempt);
  });

  return updated ? attempts : current.publish_attempts;
}

async function patchRun(
  runId: string,
  updater: (current: RunState) => RunState | Promise<RunState>,
  options?: {
    allowFailedRun?: boolean;
  },
): Promise<RunState> {
  let nextState: RunState | undefined;

  await withRunLock(runId, "state", async () => {
    const current = await readRunState(runId);

    if (isRunFailed(current) && !options?.allowFailedRun) {
      throw new RunStoppedError("Run has already been failed.");
    }

    const next = await updater(current);
    nextState = {
      ...next,
      updated_at: now(),
    };
    await writeRunState(nextState);
  });

  if (nextState === undefined) {
    throw new Error("Failed to update run state.");
  }

  return nextState;
}

export async function recordRunPublishControlMessage(
  runId: string,
  payload: {
    chatId?: string | null;
    messageId?: string | null;
  },
) {
  return patchRun(runId, (current) => ({
    ...current,
    telegram: {
      ...current.telegram,
      last_chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
      publish_control_message_id:
        payload.messageId === undefined
          ? current.telegram.publish_control_message_id
          : payload.messageId,
    },
  }));
}

export async function failRun(
  runId: string,
  errorMessage: string,
  options?: {
    allowAlreadyFailed?: boolean;
  },
) {
  return patchRun(
    runId,
    (current) => ({
      ...current,
      status: "failed",
      current_stage: null,
      workflow_status: "failed",
      error: trimHistoryText(errorMessage, 500),
      logs: current.logs.map((log) =>
        log.stage === current.current_stage && log.status === "running"
          ? { ...log, status: "failed", ended_at: now() }
          : log,
      ),
    }),
    {
      allowFailedRun: options?.allowAlreadyFailed ?? false,
    },
  );
}

export async function recordRunSoftError(
  runId: string,
  errorMessage: string,
  options?: {
    publishResultError?: boolean;
  },
) {
  const trimmedError = trimHistoryText(errorMessage, 500);

  return patchRun(
    runId,
    (current) => ({
      ...current,
      error: trimmedError,
      publish_result: options?.publishResultError
        ? {
            ...current.publish_result,
            error: trimmedError,
          }
        : current.publish_result,
    }),
    {
      allowFailedRun: true,
    },
  );
}

async function setWorkflowStatus(runId: string, workflowStatus: WorkflowStatus) {
  await patchRun(runId, (current) => ({
    ...current,
    workflow_status: workflowStatus,
  }));
}

async function startStage(runId: string, stage: StageName, summary: string) {
  await patchRun(runId, (current) => ({
    ...current,
    status: "running",
    current_stage: stage,
    logs: current.logs.map((log) =>
      log.stage === stage
        ? { ...log, status: "running", started_at: now(), summary }
        : log,
    ),
  }));
}

async function endStage(runId: string, stage: StageName, summary: string) {
  await patchRun(runId, (current) => ({
    ...current,
    logs: current.logs.map((log) =>
      log.stage === stage
        ? { ...log, status: "completed", ended_at: now(), summary }
        : log,
    ),
  }));
}

async function writeProjectArtifacts(
  runId: string,
  sourceBundle: SourceBundle,
  project: CarouselProject,
) {
  await writeArtifact(runId, "source-bundle.json", JSON.stringify(sourceBundle, null, 2));
  await writeArtifact(runId, "project.json", JSON.stringify(project, null, 2));

  for (const slide of project.slides) {
    await writeArtifact(runId, `slide-${slide.slide_number}.html`, slide.standalone_html);
  }
}

export async function createRunRecord(payload: {
  title?: string | null;
  audience?: string | null;
  sourceText?: string | null;
  sourceFileName?: string | null;
  entrypoint?: RunEntrypoint | null;
  deferProcessing?: boolean;
}) {
  const parsed = createRunSchema.parse({
    title: payload.title || undefined,
    sourceText: payload.sourceText || undefined,
    audience: payload.audience || "middle_school",
    entrypoint: payload.entrypoint || undefined,
    deferProcessing: payload.deferProcessing ?? false,
  });
  const runId = crypto.randomUUID();
  const createdAt = now();
  const state: RunState = {
    id: runId,
    entrypoint: parsed.entrypoint,
    status: "queued",
    current_stage: null,
    workflow_status:
      parsed.deferProcessing && parsed.entrypoint === "research"
        ? "researched"
        : parsed.deferProcessing
          ? "draft"
          : "rendering",
    title: parsed.title ?? null,
    audience: parsed.audience,
    created_at: createdAt,
    updated_at: createdAt,
    source_file_name: payload.sourceFileName ?? null,
    source_bundle: null,
    project: null,
    qa_report: null,
    telegram: {
      last_chat_id: null,
      script_message_id: null,
      image_message_id: null,
      script_reply_message_id: null,
      image_reply_message_id: null,
      publish_control_message_id: null,
    },
    script_approval: createIdleApprovalState(),
    image_approval: createIdleApprovalState(),
    approval_history: [],
    publish_result: createEmptyPublishResult(),
    publish_attempts: [],
    error: null,
    logs: buildEmptyLogs(),
  };

  await writeRunState(state);
  return state;
}

export async function processRun(runId: string) {
  return withRunLock(runId, "process", async () => {
    const run = await readRunState(runId);

    if (run.workflow_status !== "rendering" && run.workflow_status !== "script_approved") {
      return run;
    }

    const sourceText = await readArtifact(runId, "source.txt")
      .then((buffer) => buffer.toString("utf8"))
      .catch(() => "");
    const pdfBuffer = run.source_file_name
      ? await readArtifact(runId, `source-${run.source_file_name}`).catch(() => null)
      : null;

    try {
      await assertRunIsActive(runId);
      await setWorkflowStatus(runId, "rendering");
      await notifyTelegramRunUpdate({
        run,
        type: "render_started",
      });

      await assertRunIsActive(runId);
      await startStage(runId, "source-parser", "자료를 읽고 텍스트와 핵심 표현을 정리하는 중");

      const localPdfText = pdfBuffer
        ? await extractTextFromPdfBuffer(pdfBuffer).catch(() => "")
        : "";
      const mergedText = [sourceText, localPdfText].filter(Boolean).join("\n\n");
      const pdfBase64 = pdfBuffer
        ? `data:application/pdf;base64,${pdfBuffer.toString("base64")}`
        : null;

      await assertRunIsActive(runId);
      const sourceBundle = await buildSourceBundle({
        title: run.title,
        rawText: sourceText || localPdfText,
        extractedText: mergedText || sourceText || localPdfText,
        pdfBase64,
        pdfName: run.source_file_name,
      });

      await writeArtifact(runId, "source-bundle.json", JSON.stringify(sourceBundle, null, 2));
      await patchRun(runId, (current) => ({ ...current, source_bundle: sourceBundle }));
      await endStage(runId, "source-parser", "원문에서 사실, 숫자, 핵심 용어를 정리했어요.");

      await assertRunIsActive(runId);
      await startStage(
        runId,
        "contents-marketer",
        "중학생용 카드뉴스 카피 구조를 만드는 중",
      );
      await assertRunIsActive(runId);
      let project = await buildCarouselProject(
        sourceBundle,
        run.title,
        getRunRevisionRequest(run),
      );
      await writeArtifact(runId, "project.json", JSON.stringify(project, null, 2));
      await endStage(runId, "contents-marketer", "8장 카드뉴스 초안을 만들었어요.");

      await assertRunIsActive(runId);
      await startStage(runId, "designer", "시각 모듈과 카드 구성을 정리하는 중");
      await endStage(runId, "designer", "슬라이드별 시각 구성을 정리했어요.");

      await assertRunIsActive(runId);
      await startStage(runId, "developer", "standalone HTML과 export 자산을 만드는 중");
      await writeProjectArtifacts(runId, sourceBundle, project);
      await patchRun(runId, (current) => ({ ...current, project }));
      await endStage(runId, "developer", "미리보기와 HTML 아티팩트를 저장했어요.");

      await assertRunIsActive(runId);
      await startStage(
        runId,
        "qa-reviewer",
        "내용, 길이, 근거, 모듈 구성을 검수하고 필요하면 자동 수정하는 중",
      );
      await assertRunIsActive(runId);
      const qaLoop = await qaReviewAndRepair(sourceBundle, project, 2);
      project = qaLoop.project;

      await writeProjectArtifacts(runId, sourceBundle, project);
      await writeArtifact(runId, "qa-report.json", JSON.stringify(qaLoop.qaReport, null, 2));
      await writeArtifact(runId, "qa-attempts.json", JSON.stringify(qaLoop.attempts, null, 2));

      const repairCount = qaLoop.attempts.filter((attempt) => attempt.repaired).length;
      const qaSummary =
        repairCount > 0
          ? `QA가 ${repairCount}번 자동 수정 루프를 돌린 뒤 다시 검수했어요.`
          : "자동 QA 검수를 마쳤어요.";

      const completedRun = await patchRun(runId, (current) => ({
        ...current,
        project,
        qa_report: qaLoop.qaReport,
        status: qaLoop.qaReport.high_count > 0 ? "failed" : "completed",
        current_stage: qaLoop.qaReport.high_count > 0 ? "qa-reviewer" : null,
        workflow_status: qaLoop.qaReport.high_count > 0 ? "failed" : "image_pending_approval",
        logs: current.logs.map((log) =>
          log.stage === "qa-reviewer"
            ? {
                ...log,
                status: qaLoop.qaReport.high_count > 0 ? "failed" : "completed",
                ended_at: now(),
                summary: qaSummary,
              }
            : log,
        ),
        image_approval:
          qaLoop.qaReport.high_count > 0
            ? current.image_approval
            : createPendingApprovalState("local_preview"),
        publish_result:
          qaLoop.qaReport.high_count > 0 ? current.publish_result : createEmptyPublishResult(),
        error: qaLoop.qaReport.high_count > 0 ? "QA high severity issues remain after auto-repair." : null,
      }));

      if (completedRun.workflow_status === "image_pending_approval") {
        await assertRunIsActive(runId);
        await notifyTelegramRunUpdate({
          run: completedRun,
          type: "image_review_ready",
        });
      }

      return completedRun;
    } catch (error) {
      if (error instanceof RunStoppedError) {
        return readRunState(runId);
      }

      const failedRun = await patchRun(runId, (current) => ({
        ...current,
        status: "failed",
        workflow_status: "failed",
        error: error instanceof Error ? error.message : "Unknown processing error",
        logs: current.logs.map((log) =>
          log.stage === current.current_stage && log.status === "running"
            ? { ...log, status: "failed", ended_at: now() }
            : log,
        ),
      }));

      if (failedRun) {
        await notifyTelegramRunUpdate({
          run: failedRun,
          type: "run_failed",
          errorMessage: error instanceof Error ? error.message : "Unknown processing error",
        });
      }

      return failedRun;
    }
  });
}

export async function regenerateSlide(runId: string, payload: unknown) {
  const parsed = regenerateSlideSchema.parse(payload);
  const current = await readRunState(runId);

  if (!current.project || !current.source_bundle) {
    throw new Error("생성된 프로젝트가 아직 없습니다.");
  }

  const regenerated = await regenerateSlideFromProject(
    current.source_bundle,
    current.project,
    parsed.slideNumber,
  );
  const qaLoop = await qaReviewAndRepair(current.source_bundle, regenerated, 2);

  await writeArtifact(runId, "project.json", JSON.stringify(qaLoop.project, null, 2));
  await writeArtifact(runId, "qa-report.json", JSON.stringify(qaLoop.qaReport, null, 2));
  await writeArtifact(runId, "qa-attempts.json", JSON.stringify(qaLoop.attempts, null, 2));

  for (const slide of qaLoop.project.slides) {
    await writeArtifact(runId, `slide-${slide.slide_number}.html`, slide.standalone_html);
  }

  return patchRun(runId, (run) => ({
    ...run,
    project: qaLoop.project,
    qa_report: qaLoop.qaReport,
    status: qaLoop.qaReport.high_count > 0 ? "failed" : "completed",
    current_stage: null,
    workflow_status: qaLoop.qaReport.high_count > 0 ? "failed" : "image_pending_approval",
    image_approval:
      qaLoop.qaReport.high_count > 0
        ? run.image_approval
        : createPendingApprovalState(run.image_approval.channel ?? "local_preview"),
    publish_result:
      qaLoop.qaReport.high_count > 0 ? run.publish_result : createEmptyPublishResult(),
    error: qaLoop.qaReport.high_count > 0 ? "QA high severity issues remain after auto-repair." : null,
  }));
}

export async function requestRunApproval(runId: string, payload: RequestApprovalInput) {
  const parsed = requestApprovalSchema.parse(payload);

  return patchRun(runId, (current) => {
    if (parsed.approvalType === "image" && !current.project) {
      throw new Error("이미지 승인 요청을 보내기 전에 카드뉴스 생성이 완료되어야 합니다.");
    }

    const approvalKey = getApprovalKey(parsed.approvalType);
    const telegramMessageKey = getTelegramMessageKey(parsed.approvalType);
    const telegramReplyMessageKey = getTelegramReplyMessageKey(parsed.approvalType);
    const requestedAt = now();

    const nextApproval: ApprovalState = {
      ...createPendingApprovalState(parsed.channel, requestedAt),
      approver: parsed.approver?.trim() || null,
      response_text: parsed.note?.trim() || null,
      telegram_message_id: parsed.telegramMessageId?.trim() || null,
    };
    const nextWorkflowStatus = getWorkflowStatusForApprovalRequest(parsed.approvalType);

    return {
      ...current,
      workflow_status: nextWorkflowStatus,
      [approvalKey]: nextApproval,
      approval_history: appendApprovalHistory(current, {
        approval_type: parsed.approvalType,
        event_type: "requested",
        occurred_at: requestedAt,
        approval_status: nextApproval.status,
        workflow_status: nextWorkflowStatus,
        channel: parsed.channel,
        approver: parsed.approver?.trim() || null,
        note: trimHistoryText(parsed.note, 1000),
        chat_id: parsed.chatId?.trim() || null,
        telegram_message_id: parsed.telegramMessageId?.trim() || null,
        delivery_summary: trimHistoryText(parsed.deliverySummary, 1200),
      }),
      telegram: {
        ...current.telegram,
        last_chat_id: parsed.chatId?.trim() || current.telegram.last_chat_id,
        [telegramReplyMessageKey]: null,
        [telegramMessageKey]:
          parsed.telegramMessageId?.trim() || current.telegram[telegramMessageKey],
      },
      error: null,
    };
  });
}

export async function recordApprovalReplyPrompt(
  runId: string,
  payload: {
    approvalType: ApprovalTarget;
    chatId?: string | null;
    telegramMessageId?: string | null;
  },
) {
  return patchRun(runId, (current) => {
    const telegramReplyMessageKey = getTelegramReplyMessageKey(payload.approvalType);

    return {
      ...current,
      telegram: {
        ...current.telegram,
        last_chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
        [telegramReplyMessageKey]:
          payload.telegramMessageId?.trim() || current.telegram[telegramReplyMessageKey],
      },
    };
  });
}

export async function respondToRunApproval(runId: string, payload: RespondApprovalInput) {
  const parsed = respondApprovalSchema.parse(payload);

  return patchRun(runId, (current) => {
    if (parsed.approvalType === "image" && !current.project) {
      throw new Error("이미지 승인 응답을 처리하려면 카드뉴스 결과가 먼저 있어야 합니다.");
    }

    const approvalKey = getApprovalKey(parsed.approvalType);
    const telegramMessageKey = getTelegramMessageKey(parsed.approvalType);
    const telegramReplyMessageKey = getTelegramReplyMessageKey(parsed.approvalType);
    const currentApproval = current[approvalKey];
    const respondedAt = now();
    const messageId = parsed.telegramMessageId?.trim() || currentApproval.telegram_message_id;
    const channel = parsed.channel ?? currentApproval.channel;
    const decisionIsApproved = parsed.decision === "approved";
    const nextWorkflowStatus = getWorkflowStatusForApprovalDecision(
      parsed.approvalType,
      parsed.decision,
      current,
    );

    const nextApproval: ApprovalState = {
      ...currentApproval,
      status: parsed.decision,
      responded_at: respondedAt,
      approved_at: decisionIsApproved ? respondedAt : null,
      rejected_at: decisionIsApproved ? null : respondedAt,
      approver: parsed.approver?.trim() || currentApproval.approver,
      response_text: parsed.responseText?.trim() || null,
      channel,
      telegram_message_id: messageId ?? null,
    };

    return {
      ...current,
      workflow_status: nextWorkflowStatus,
      [approvalKey]: nextApproval,
      approval_history: appendApprovalHistory(current, {
        approval_type: parsed.approvalType,
        event_type: parsed.decision,
        occurred_at: respondedAt,
        approval_status: nextApproval.status,
        workflow_status: nextWorkflowStatus,
        channel,
        approver: nextApproval.approver,
        note: trimHistoryText(parsed.responseText, 1000),
        chat_id: parsed.chatId?.trim() || current.telegram.last_chat_id,
        telegram_message_id: messageId ?? null,
        delivery_summary: null,
      }),
      telegram: {
        ...current.telegram,
        last_chat_id: parsed.chatId?.trim() || current.telegram.last_chat_id,
        [telegramReplyMessageKey]: null,
        [telegramMessageKey]: messageId ?? current.telegram[telegramMessageKey],
      },
      error: null,
    };
  });
}

export async function recordRunApprovalAction(
  runId: string,
  payload: {
    approvalType: ApprovalTarget;
    action: "hold" | "skip";
    approver?: string | null;
    responseText?: string | null;
    channel?: ApprovalState["channel"];
    chatId?: string | null;
    telegramMessageId?: string | null;
  },
) {
  return patchRun(runId, (current) => {
    const approvalKey = getApprovalKey(payload.approvalType);
    const telegramMessageKey = getTelegramMessageKey(payload.approvalType);
    const telegramReplyMessageKey = getTelegramReplyMessageKey(payload.approvalType);
    const currentApproval = current[approvalKey];
    const occurredAt = now();
    const messageId = payload.telegramMessageId?.trim() || currentApproval.telegram_message_id;
    const channel = payload.channel ?? currentApproval.channel;
    const note =
      trimHistoryText(payload.responseText, 1000) ??
      (payload.action === "hold"
        ? "운영자가 보류 상태를 유지했어요."
        : "운영자가 이번 run을 스킵했어요.");

    if (payload.action === "hold") {
      const workflowStatus = getPendingWorkflowStatus(payload.approvalType);

      return {
        ...current,
        workflow_status: workflowStatus,
        approval_history: appendApprovalHistory(current, {
          approval_type: payload.approvalType,
          event_type: "held",
          occurred_at: occurredAt,
          approval_status: currentApproval.status,
          workflow_status: workflowStatus,
          channel,
          approver: payload.approver?.trim() || currentApproval.approver,
          note,
          chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
          telegram_message_id: messageId ?? null,
          delivery_summary: null,
        }),
        telegram: {
          ...current.telegram,
          last_chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
          [telegramReplyMessageKey]: null,
          [telegramMessageKey]: messageId ?? current.telegram[telegramMessageKey],
        },
        error: null,
      };
    }

    const nextApproval: ApprovalState = {
      ...currentApproval,
      status: "rejected",
      responded_at: occurredAt,
      approved_at: null,
      rejected_at: occurredAt,
      approver: payload.approver?.trim() || currentApproval.approver,
      response_text: note,
      channel,
      telegram_message_id: messageId ?? null,
    };

    return {
      ...current,
      status: "failed",
      current_stage: null,
      workflow_status: "failed",
      [approvalKey]: nextApproval,
      approval_history: appendApprovalHistory(current, {
        approval_type: payload.approvalType,
        event_type: "skipped",
        occurred_at: occurredAt,
        approval_status: nextApproval.status,
        workflow_status: "failed",
        channel,
        approver: nextApproval.approver,
        note,
        chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
        telegram_message_id: messageId ?? null,
        delivery_summary: null,
      }),
      telegram: {
        ...current.telegram,
        last_chat_id: payload.chatId?.trim() || current.telegram.last_chat_id,
        [telegramReplyMessageKey]: null,
        [telegramMessageKey]: messageId ?? current.telegram[telegramMessageKey],
      },
      error: note,
    };
  });
}

export async function startRunPublish(runId: string, payload: PublishRunInput) {
  const parsed = publishRunSchema.parse(payload);

  return patchRun(runId, (current) => {
    if (current.status === "failed" || current.workflow_status === "failed") {
      throw new RunStoppedError("Run has already been failed.");
    }

    if (!current.project) {
      throw new Error("게시하려면 카드뉴스 프로젝트가 먼저 있어야 합니다.");
    }

    if (current.image_approval.status !== "approved") {
      throw new Error("이미지 최종 승인이 끝나야 인스타 게시를 시작할 수 있습니다.");
    }

    if (current.publish_result.status === "published" || current.workflow_status === "published") {
      throw new Error("This run has already been published.");
    }

    if (
      current.publish_result.status === "publishing" &&
      current.publish_result.current_attempt_id
    ) {
      throw new Error("이 run은 이미 인스타 업로드를 진행 중입니다.");
    }

    const requestedAt = now();
    const nextProject = parsed.caption
      ? {
          ...current.project,
          caption: parsed.caption,
        }
      : current.project;
    const attempt = createPublishAttempt(
      {
        ...parsed,
        caption: nextProject.caption,
      },
      current,
      requestedAt,
    );

    return {
      ...current,
      workflow_status: "publishing",
      publish_result: {
        ...current.publish_result,
        status: "publishing",
        requested_at: requestedAt,
        started_at: requestedAt,
        published_at: null,
        provider: "instagram",
        instagram_creation_id: null,
        instagram_media_id: null,
        permalink: null,
        error: null,
        current_attempt_id: attempt.id,
        retryable: false,
        next_action: "none",
        hold_reason: null,
        held_at: null,
        last_trigger: parsed.trigger,
      },
      publish_attempts: [...current.publish_attempts, attempt],
      error: null,
      project: nextProject,
      telegram: {
        ...current.telegram,
        publish_control_message_id: null,
      },
    };
  });
}

export async function completeRunPublish(
  runId: string,
  payload: {
    creationId: string;
    mediaId: string;
    permalink: string | null;
  },
) {
  return patchRun(runId, (current) => {
    const completedAt = now();

    return {
      ...current,
      workflow_status: "published",
      publish_result: {
        ...current.publish_result,
        status: "published",
        provider: "instagram",
        published_at: completedAt,
        instagram_creation_id: payload.creationId,
        instagram_media_id: payload.mediaId,
        permalink: payload.permalink,
        error: null,
        current_attempt_id: null,
        retryable: false,
        next_action: "none",
        hold_reason: null,
        held_at: null,
      },
      publish_attempts: updatePublishAttempt(
        current,
        current.publish_result.current_attempt_id,
        (attempt) => ({
          ...attempt,
          status: "published",
          completed_at: completedAt,
          provider: "instagram",
          instagram_creation_id: payload.creationId,
          instagram_media_id: payload.mediaId,
          permalink: payload.permalink,
          error: null,
        }),
      ),
      error: null,
      telegram: {
        ...current.telegram,
        publish_control_message_id: null,
      },
    };
  });
}

export async function failRunPublish(
  runId: string,
  payload: {
    errorMessage: string;
    retryable: boolean;
    nextAction: PublishResult["next_action"];
    holdReason?: string | null;
  },
) {
  return patchRun(runId, (current) => {
    const failedAt = now();

    return {
      ...current,
      workflow_status: "image_approved",
      publish_result: {
        ...current.publish_result,
        status: "failed",
        provider: "instagram",
        error: payload.errorMessage,
        current_attempt_id: null,
        retryable: payload.retryable,
        next_action: payload.nextAction,
        hold_reason: trimHistoryText(payload.holdReason, 500),
        held_at:
          payload.nextAction === "manual_retry" ||
          payload.nextAction === "manual_fix_required"
            ? failedAt
            : null,
      },
      publish_attempts: updatePublishAttempt(
        current,
        current.publish_result.current_attempt_id,
        (attempt) => ({
          ...attempt,
          status: "failed",
          completed_at: failedAt,
          provider: "instagram",
          error: trimHistoryText(payload.errorMessage, 500),
        }),
      ),
      error: payload.errorMessage,
    };
  });
}

export async function stopRunPublish(runId: string, payload: PublishControlInput) {
  const parsed = publishControlSchema.parse(payload);

  if (parsed.action !== "stop") {
    throw new Error("게시 중단 처리에는 stop 액션이 필요합니다.");
  }

  return patchRun(runId, (current) => {
    if (current.publish_result.status === "publishing") {
      throw new Error("아직 게시 중인 run은 업로드가 끝난 뒤에만 중단 처리할 수 있습니다.");
    }

    if (current.publish_result.status === "published") {
      throw new Error("이미 게시가 끝난 run은 중단 처리할 수 없습니다.");
    }

    const stoppedAt = now();
    const reason = trimHistoryText(
      parsed.reason ?? "운영자가 이번 게시 재시도를 중단했어요.",
      500,
    );

    return {
      ...current,
      workflow_status: "image_approved",
      publish_result: {
        ...current.publish_result,
        retryable: false,
        next_action: "none",
        hold_reason: reason,
        held_at: stoppedAt,
      },
      error: reason ?? current.error,
      telegram: {
        ...current.telegram,
        publish_control_message_id: null,
      },
    };
  });
}
