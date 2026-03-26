import { z, type ZodType } from "zod";

import {
  type ApprovalDecision,
  type ApprovalHistoryEntry,
  type ApprovalState,
  type ApprovalTarget,
  carouselProjectSchema,
  createRunSchema,
  designPlanSchema,
  publishControlSchema,
  publishRunSchema,
  type PublishAttempt,
  type PublishControlInput,
  regenerateSlideSchema,
  requestApprovalSchema,
  respondApprovalSchema,
  qaReportSchema,
  qaValidatorReportSchema,
  stageValues,
  type CarouselProject,
  type DesignPlan,
  type PublishRunInput,
  type PublishResult,
  type RequestApprovalInput,
  type RespondApprovalInput,
  type RunEntrypoint,
  type RunState,
  type SourceBundle,
  type StageName,
  type WorkflowStatus,
  sourceBundleSchema,
} from "@/lib/agents/schema";
import {
  assembleCarouselProject,
  buildCopyDeck,
  buildDesignDeck,
  buildDesignPlan,
  buildSourceBundle,
  copyDeckSchema,
  designDeckSchema,
  qaRepairLoop,
  regenerateSlideFromProject,
  runDeterministicQaValidator,
  runQaReviewer,
  type CopyDeck,
  type DesignDeck,
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

const replayableStageValues = [
  "content-planner",
  "contents-marketer",
  "designer",
  "developer",
  "qa-validator",
  "qa-reviewer",
  "qa-repair",
] as const;

const replayStageSchema = z.object({
  stage: z.enum(replayableStageValues),
  revisionRequest: z.string().max(1000).optional(),
});

type ReplayableStage = (typeof replayableStageValues)[number];

type ArtifactMigrationReport = {
  repaired_at: string;
  strategy_version: "2026-03-26";
  repaired: string[];
  reused: string[];
  missing: string[];
  notes: string[];
};

function now() {
  return new Date().toISOString();
}

function getStageIndex(stage: StageName | ReplayableStage) {
  return stageValues.indexOf(stage);
}

function shouldRunStage(fromStage: ReplayableStage, stage: ReplayableStage) {
  return getStageIndex(stage) >= getStageIndex(fromStage);
}

function resetStageLogsFrom(
  logs: RunState["logs"],
  fromStage: ReplayableStage,
) {
  return logs.map((log) =>
    getStageIndex(log.stage) >= getStageIndex(fromStage)
      ? {
          ...log,
          status: "pending" as const,
          started_at: null,
          ended_at: null,
          summary: null,
        }
      : log,
  );
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

function getQaRepairPasses(run: RunState) {
  return getRunRevisionRequest(run) ? 4 : 2;
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

async function skipStage(runId: string, stage: StageName, summary: string) {
  await patchRun(runId, (current) => ({
    ...current,
    logs: current.logs.map((log) =>
      log.stage === stage
        ? {
            ...log,
            status: "completed",
            started_at: log.started_at ?? now(),
            ended_at: now(),
            summary,
          }
        : log,
    ),
  }));
}

async function writeProjectArtifacts(
  runId: string,
  sourceBundle: SourceBundle,
  designPlan: DesignPlan | null,
  project: CarouselProject,
) {
  await writeArtifact(runId, "source-bundle.json", JSON.stringify(sourceBundle, null, 2));
  if (designPlan) {
    await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
  }
  await writeArtifact(runId, "project.json", JSON.stringify(project, null, 2));

  for (const slide of project.slides) {
    await writeArtifact(runId, `slide-${slide.slide_number}.html`, slide.standalone_html);
  }
}

async function readValidatedArtifact<T>(
  runId: string,
  filename: string,
  schema: ZodType<T>,
  label: string,
) {
  const buffer = await readArtifact(runId, filename).catch(() => null);

  if (!buffer) {
    throw new Error(`${label} artifact is missing: ${filename}`);
  }

  try {
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    return schema.parse(parsed);
  } catch (error) {
    throw new Error(
      `${label} artifact is invalid: ${filename}${
        error instanceof Error ? ` (${error.message})` : ""
      }`,
    );
  }
}

async function tryReadValidatedArtifact<T>(
  runId: string,
  filename: string,
  schema: ZodType<T>,
) {
  const buffer = await readArtifact(runId, filename).catch(() => null);

  if (!buffer) {
    return null;
  }

  try {
    return schema.parse(JSON.parse(buffer.toString("utf8")) as unknown);
  } catch {
    return null;
  }
}

async function readSourceBundleArtifact(runId: string) {
  return readValidatedArtifact(runId, "source-bundle.json", sourceBundleSchema, "source bundle");
}

async function readDesignPlanArtifact(runId: string) {
  return readValidatedArtifact(runId, "design-plan.json", designPlanSchema, "design plan");
}

async function readOptionalDesignPlanArtifact(runId: string) {
  return tryReadValidatedArtifact(runId, "design-plan.json", designPlanSchema);
}

async function readCopyDeckArtifact(runId: string) {
  return readValidatedArtifact(runId, "copy-deck.json", copyDeckSchema, "copy deck");
}

async function readDesignDeckArtifact(runId: string) {
  return readValidatedArtifact(runId, "design-deck.json", designDeckSchema, "design deck");
}

async function readProjectArtifact(runId: string) {
  return readValidatedArtifact(runId, "project.json", carouselProjectSchema, "project");
}

async function readQaValidatorReportArtifact(runId: string) {
  return readValidatedArtifact(
    runId,
    "qa-validator-report.json",
    qaValidatorReportSchema,
    "qa validator report",
  );
}

async function readQaReviewReportArtifact(runId: string) {
  return readValidatedArtifact(runId, "qa-review-report.json", qaReportSchema, "qa review report");
}

function buildCopyDeckFromProject(project: CarouselProject): CopyDeck {
  return copyDeckSchema.parse({
    brand_label: project.brand_label,
    project_title: project.project_title,
    caption: project.caption,
    slides: project.slides.map((slide) => ({
      slide_number: slide.slide_number,
      role: slide.role,
      headline: slide.headline,
      body: slide.body,
      emphasis: slide.emphasis,
      save_point: slide.save_point,
      source_excerpt: slide.source_excerpt,
    })),
  });
}

function buildDesignDeckFromProject(project: CarouselProject): DesignDeck {
  return designDeckSchema.parse({
    theme_name: project.theme_name,
    slides: project.slides.map((slide) => ({
      slide_number: slide.slide_number,
      question_badge: slide.question_badge,
      module: slide.module,
    })),
  });
}

function clampTextBudget(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildDesignPlanFromProject(project: CarouselProject): DesignPlan {
  return designPlanSchema.parse({
    theme_name: project.theme_name,
    guardrails: [
      "Preserve the migrated slide order and role sequence.",
      "Preserve the existing layout pattern on each migrated slide.",
      "Keep replay compatible with the current editorial core contracts.",
    ],
    story_arc: `${project.slides[0]?.headline ?? project.project_title} -> ${project.slides.at(-1)?.headline ?? "closing"}`,
    slides: project.slides.map((slide) => ({
      slide_number: slide.slide_number,
      role: slide.role,
      visual_tone: slide.visual_tone,
      layout_pattern: slide.layout_pattern,
      narrative_phase: slide.narrative_phase,
      module_weight: slide.module_weight,
      text_density: slide.text_density,
      emotional_temperature:
        slide.narrative_phase === "hook"
          ? 5
          : slide.narrative_phase === "closing"
            ? 2
            : slide.narrative_phase === "practice"
              ? 4
              : slide.narrative_phase === "proof"
                ? 3
                : slide.narrative_phase === "turn"
                  ? 4
                  : slide.narrative_phase === "recap"
                    ? 2
                    : 3,
      question_angle: (slide.question_badge || slide.headline).slice(0, 80),
      question_tone:
        slide.role === "hook"
          ? "curious"
          : slide.role === "closing"
            ? "clear"
            : "guide",
      module_goal: (slide.module.title || slide.headline).slice(0, 120),
      module_candidates: [slide.module.type],
      forbidden_patterns: [],
      text_budget: {
        headline_max: clampTextBudget(slide.headline.length + 12, 24, 120),
        body_max: clampTextBudget(slide.body.length + 40, 60, 280),
        emphasis_max: clampTextBudget((slide.emphasis?.length ?? 0) + 12, 20, 60),
        save_point_max: clampTextBudget((slide.save_point?.length ?? 0) + 20, 20, 120),
      },
    })),
  });
}

async function resolveLegacySourceBundle(
  runId: string,
  run: RunState,
  report: ArtifactMigrationReport,
) {
  const artifactBundle = await tryReadValidatedArtifact(
    runId,
    "source-bundle.json",
    sourceBundleSchema,
  );

  if (artifactBundle) {
    report.reused.push("source-bundle.json");
    return artifactBundle;
  }

  if (run.source_bundle) {
    const sourceBundle = sourceBundleSchema.parse(run.source_bundle);
    await writeArtifact(runId, "source-bundle.json", JSON.stringify(sourceBundle, null, 2));
    report.repaired.push("source-bundle.json");
    report.notes.push("Recovered source bundle artifact from run state.");
    return sourceBundle;
  }

  const sourceText = await readArtifact(runId, "source.txt")
    .then((buffer) => buffer.toString("utf8"))
    .catch(() => "");
  const pdfBuffer = run.source_file_name
    ? await readArtifact(runId, `source-${run.source_file_name}`).catch(() => null)
    : null;
  const localPdfText = pdfBuffer ? await extractTextFromPdfBuffer(pdfBuffer).catch(() => "") : "";
  const mergedText = [sourceText, localPdfText].filter(Boolean).join("\n\n");

  if (!mergedText.trim()) {
    report.missing.push("source-bundle.json");
    report.notes.push("Could not recover a source bundle because neither state nor source artifacts were available.");
    return null;
  }

  const rebuilt = await buildSourceBundle({
    title: run.title,
    rawText: sourceText || localPdfText,
    extractedText: mergedText,
    pdfBase64: pdfBuffer ? `data:application/pdf;base64,${pdfBuffer.toString("base64")}` : null,
    pdfName: run.source_file_name,
  });
  await writeArtifact(runId, "source-bundle.json", JSON.stringify(rebuilt, null, 2));
  report.repaired.push("source-bundle.json");
  report.notes.push("Rebuilt source bundle artifact from source.txt / source PDF.");
  return rebuilt;
}

async function repairLegacyRunArtifactsInternal(
  runId: string,
  run: RunState,
  revisionRequest?: string | null,
) {
  const report: ArtifactMigrationReport = {
    repaired_at: now(),
    strategy_version: "2026-03-26",
    repaired: [],
    reused: [],
    missing: [],
    notes: [],
  };

  const sourceBundle = await resolveLegacySourceBundle(runId, run, report);

  let project = await tryReadValidatedArtifact(runId, "project.json", carouselProjectSchema);
  if (project) {
    report.reused.push("project.json");
  } else if (run.project) {
    project = carouselProjectSchema.parse(run.project);
    await writeArtifact(runId, "project.json", JSON.stringify(project, null, 2));
    report.repaired.push("project.json");
    report.notes.push("Recovered project artifact from run state.");
  }

  let designPlan = await tryReadValidatedArtifact(runId, "design-plan.json", designPlanSchema);
  if (designPlan) {
    report.reused.push("design-plan.json");
  } else if (run.design_plan) {
    designPlan = designPlanSchema.parse(run.design_plan);
    await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
    report.repaired.push("design-plan.json");
    report.notes.push("Recovered design plan artifact from run state.");
  } else if (project) {
    designPlan = buildDesignPlanFromProject(project);
    await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
    report.repaired.push("design-plan.json");
    report.notes.push("Derived design plan artifact from the existing project.");
  } else if (sourceBundle) {
    designPlan = await buildDesignPlan(sourceBundle, run.title, revisionRequest);
    await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
    report.repaired.push("design-plan.json");
    report.notes.push("Rebuilt design plan artifact from source bundle.");
  }

  let copyDeck = await tryReadValidatedArtifact(runId, "copy-deck.json", copyDeckSchema);
  if (copyDeck) {
    report.reused.push("copy-deck.json");
  } else if (project) {
    copyDeck = buildCopyDeckFromProject(project);
    await writeArtifact(runId, "copy-deck.json", JSON.stringify(copyDeck, null, 2));
    report.repaired.push("copy-deck.json");
    report.notes.push("Derived copy deck artifact from the existing project.");
  }

  let designDeck = await tryReadValidatedArtifact(runId, "design-deck.json", designDeckSchema);
  if (designDeck) {
    report.reused.push("design-deck.json");
  } else if (project) {
    designDeck = buildDesignDeckFromProject(project);
    await writeArtifact(runId, "design-deck.json", JSON.stringify(designDeck, null, 2));
    report.repaired.push("design-deck.json");
    report.notes.push("Derived design deck artifact from the existing project.");
  }

  if (!project && sourceBundle && designPlan && copyDeck && designDeck) {
    project = assembleCarouselProject(sourceBundle, designPlan, copyDeck, designDeck);
    await writeArtifact(runId, "project.json", JSON.stringify(project, null, 2));
    report.repaired.push("project.json");
    report.notes.push("Reassembled project artifact from recovered stage artifacts.");
  }

  if (project) {
    for (const slide of project.slides) {
      const slideFilename = `slide-${slide.slide_number}.html`;
      const existingSlideHtml = await readArtifact(runId, slideFilename).catch(() => null);

      if (!existingSlideHtml) {
        await writeArtifact(runId, slideFilename, slide.standalone_html);
        report.repaired.push(slideFilename);
      } else {
        report.reused.push(slideFilename);
      }
    }
  }

  let qaValidatorReport = await tryReadValidatedArtifact(
    runId,
    "qa-validator-report.json",
    qaValidatorReportSchema,
  );
  if (qaValidatorReport) {
    report.reused.push("qa-validator-report.json");
  } else if (project && sourceBundle) {
    qaValidatorReport = runDeterministicQaValidator(project, sourceBundle, designPlan);
    await writeArtifact(
      runId,
      "qa-validator-report.json",
      JSON.stringify(qaValidatorReport, null, 2),
    );
    report.repaired.push("qa-validator-report.json");
    report.notes.push("Regenerated qa-validator-report.json from the recovered project.");
  }

  let qaReviewReport = await tryReadValidatedArtifact(
    runId,
    "qa-review-report.json",
    qaReportSchema,
  );
  if (qaReviewReport) {
    report.reused.push("qa-review-report.json");
  } else if (project && sourceBundle) {
    qaReviewReport = runQaReviewer(
      project,
      sourceBundle,
      designPlan,
      qaValidatorReport ?? runDeterministicQaValidator(project, sourceBundle, designPlan),
    );
    await writeArtifact(runId, "qa-review-report.json", JSON.stringify(qaReviewReport, null, 2));
    report.repaired.push("qa-review-report.json");
    report.notes.push("Regenerated qa-review-report.json from the recovered project.");
  }

  let qaReport = await tryReadValidatedArtifact(runId, "qa-report.json", qaReportSchema);
  if (qaReport) {
    report.reused.push("qa-report.json");
  } else if (run.qa_report) {
    qaReport = qaReportSchema.parse(run.qa_report);
    await writeArtifact(runId, "qa-report.json", JSON.stringify(qaReport, null, 2));
    report.repaired.push("qa-report.json");
    report.notes.push("Recovered qa-report.json from run state.");
  } else if (qaReviewReport) {
    qaReport = qaReviewReport;
    await writeArtifact(runId, "qa-report.json", JSON.stringify(qaReport, null, 2));
    report.repaired.push("qa-report.json");
    report.notes.push("Seeded qa-report.json from the recovered reviewer report.");
  }

  const qaAttemptsBuffer = await readArtifact(runId, "qa-attempts.json").catch(() => null);
  if (qaAttemptsBuffer) {
    report.reused.push("qa-attempts.json");
  } else if (project) {
    await writeArtifact(runId, "qa-attempts.json", JSON.stringify([], null, 2));
    report.repaired.push("qa-attempts.json");
  }

  if (!project) {
    report.missing.push("project.json");
  }
  if (!designPlan) {
    report.missing.push("design-plan.json");
  }
  if (!copyDeck) {
    report.missing.push("copy-deck.json");
  }
  if (!designDeck) {
    report.missing.push("design-deck.json");
  }
  if (!qaValidatorReport) {
    report.missing.push("qa-validator-report.json");
  }
  if (!qaReviewReport) {
    report.missing.push("qa-review-report.json");
  }
  if (!qaReport) {
    report.missing.push("qa-report.json");
  }

  await writeArtifact(runId, "artifact-migration-report.json", JSON.stringify(report, null, 2));

  const nextRun = await patchRun(
    runId,
    (current) => ({
      ...current,
      source_bundle: sourceBundle ?? current.source_bundle,
      design_plan: designPlan ?? current.design_plan,
      project: project ?? current.project,
      qa_report: qaReport ?? current.qa_report,
    }),
    {
      allowFailedRun: true,
    },
  );

  return {
    run: nextRun,
    sourceBundle,
    designPlan,
    project,
    qaReport,
    report,
  };
}

export async function repairLegacyRunArtifacts(runId: string) {
  const run = await readRunState(runId);
  return repairLegacyRunArtifactsInternal(runId, run, getRunRevisionRequest(run));
}

async function runQaValidatorArtifactStage(runId: string) {
  const sourceBundle = await readSourceBundleArtifact(runId);
  const designPlan = await readOptionalDesignPlanArtifact(runId);
  const project = await readProjectArtifact(runId);
  const qaValidatorReport = runDeterministicQaValidator(project, sourceBundle, designPlan);
  await writeArtifact(
    runId,
    "qa-validator-report.json",
    JSON.stringify(qaValidatorReport, null, 2),
  );

  return {
    project,
    qaValidatorReport,
    issueCount:
      qaValidatorReport.high_count +
      qaValidatorReport.medium_count +
      qaValidatorReport.low_count,
    hasActionableIssues:
      qaValidatorReport.high_count > 0 || qaValidatorReport.medium_count > 0,
  };
}

async function runQaReviewerArtifactStage(
  runId: string,
) {
  const sourceBundle = await readSourceBundleArtifact(runId);
  const designPlan = await readOptionalDesignPlanArtifact(runId);
  const project = await readProjectArtifact(runId);
  const qaValidatorReport = await readQaValidatorReportArtifact(runId);
  const qaReport = runQaReviewer(project, sourceBundle, designPlan, qaValidatorReport);
  await writeArtifact(runId, "qa-review-report.json", JSON.stringify(qaReport, null, 2));
  await writeArtifact(runId, "qa-report.json", JSON.stringify(qaReport, null, 2));

  const hasInitialActionableIssues =
    qaReport.high_count > 0 || qaReport.medium_count > 0;

  if (!hasInitialActionableIssues) {
    await writeArtifact(runId, "qa-attempts.json", JSON.stringify([], null, 2));
  }

  return {
    project,
    qaReport,
    hasInitialActionableIssues,
    initialIssueCount:
      qaReport.high_count + qaReport.medium_count + qaReport.low_count,
  };
}

async function runQaRepairArtifactStage(
  runId: string,
  maxRepairPasses: number,
) {
  const sourceBundle = await readSourceBundleArtifact(runId);
  const designPlan = await readOptionalDesignPlanArtifact(runId);
  const project = await readProjectArtifact(runId);
  const qaReviewReport = await readQaReviewReportArtifact(runId);
  const qaLoop = await qaRepairLoop(
    sourceBundle,
    project,
    designPlan,
    qaReviewReport,
    maxRepairPasses,
  );

  await writeArtifact(runId, "qa-report.json", JSON.stringify(qaLoop.qaReport, null, 2));
  await writeArtifact(runId, "qa-attempts.json", JSON.stringify(qaLoop.attempts, null, 2));
  await writeProjectArtifacts(runId, sourceBundle, designPlan, qaLoop.project);

  return qaLoop;
}

export async function replayRunFromStage(runId: string, payload: unknown) {
  const parsed = replayStageSchema.parse(payload);

  return withRunLock(runId, "process", async () => {
    const run = await readRunState(runId);

    if (run.workflow_status === "publishing") {
      throw new Error("Publishing 중인 run은 replay할 수 없습니다.");
    }

    if (run.workflow_status === "published") {
      throw new Error("이미 published 된 run은 replay 대신 새 run으로 처리해야 합니다.");
    }

    const revisionRequest =
      trimHistoryText(parsed.revisionRequest, 1000) ?? getRunRevisionRequest(run);

    const migration = await repairLegacyRunArtifactsInternal(runId, run, revisionRequest);
    const migratedRun = migration.run;

    await patchRun(
      runId,
      (current) => ({
        ...current,
        status: "running",
        current_stage: null,
        workflow_status: "rendering",
        qa_report: shouldRunStage(parsed.stage, "qa-reviewer") ? null : current.qa_report,
        image_approval: createIdleApprovalState(),
        publish_result: createEmptyPublishResult(),
        error: null,
        logs: resetStageLogsFrom(current.logs, parsed.stage),
      }),
        {
          allowFailedRun: true,
        },
      );

    try {
      const sourceBundle = migration.sourceBundle ?? await readValidatedArtifact(
        runId,
        "source-bundle.json",
        sourceBundleSchema,
        "source bundle",
      );

      let designPlan: DesignPlan;

      if (shouldRunStage(parsed.stage, "content-planner")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "content-planner",
          "기존 source artifact를 기준으로 design plan을 다시 구성하는 중",
        );
        await assertRunIsActive(runId);
        designPlan = await buildDesignPlan(sourceBundle, migratedRun.title, revisionRequest);
        await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
        await patchRun(runId, (current) => ({
          ...current,
          source_bundle: sourceBundle,
          design_plan: designPlan,
        }));
        await endStage(runId, "content-planner", "design plan artifact를 다시 생성했습니다.");
      } else {
        designPlan = await readValidatedArtifact(
          runId,
          "design-plan.json",
          designPlanSchema,
          "design plan",
        );
      }

      let copyDeck: CopyDeck;

      if (shouldRunStage(parsed.stage, "contents-marketer")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "contents-marketer",
          "design plan을 기준으로 copy deck artifact를 다시 생성하는 중",
        );
        await assertRunIsActive(runId);
        const marketerSourceBundle = await readSourceBundleArtifact(runId);
        const marketerDesignPlan = await readDesignPlanArtifact(runId);
        copyDeck = await buildCopyDeck(
          marketerSourceBundle,
          marketerDesignPlan,
          migratedRun.title,
          revisionRequest,
        );
        await writeArtifact(runId, "copy-deck.json", JSON.stringify(copyDeck, null, 2));
        await endStage(
          runId,
          "contents-marketer",
          `${copyDeck.slides.length}장 copy deck artifact를 다시 만들었습니다.`,
        );
      } else {
        copyDeck = await readCopyDeckArtifact(runId);
      }

      let designDeck: DesignDeck;

      if (shouldRunStage(parsed.stage, "designer")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "designer",
          "copy deck을 기준으로 design deck artifact를 다시 생성하는 중",
        );
        await assertRunIsActive(runId);
        const designerSourceBundle = await readSourceBundleArtifact(runId);
        const designerDesignPlan = await readDesignPlanArtifact(runId);
        const designerCopyDeck = await readCopyDeckArtifact(runId);
        designDeck = await buildDesignDeck(
          designerSourceBundle,
          designerDesignPlan,
          designerCopyDeck,
          revisionRequest,
        );
        await writeArtifact(runId, "design-deck.json", JSON.stringify(designDeck, null, 2));
        await endStage(runId, "designer", "design deck artifact를 다시 생성했습니다.");
      } else {
        designDeck = await readDesignDeckArtifact(runId);
      }

      let project: CarouselProject;

      if (shouldRunStage(parsed.stage, "developer")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "developer",
          "artifact contract를 다시 읽고 project/HTML artifact를 재조립하는 중",
        );
        const developerSourceBundle = await readValidatedArtifact(
          runId,
          "source-bundle.json",
          sourceBundleSchema,
          "source bundle",
        );
        const developerDesignPlan = await readValidatedArtifact(
          runId,
          "design-plan.json",
          designPlanSchema,
          "design plan",
        );
        const developerCopyDeck = await readValidatedArtifact(
          runId,
          "copy-deck.json",
          copyDeckSchema,
          "copy deck",
        );
        const developerDesignDeck = await readValidatedArtifact(
          runId,
          "design-deck.json",
          designDeckSchema,
          "design deck",
        );

        project = assembleCarouselProject(
          developerSourceBundle,
          developerDesignPlan,
          developerCopyDeck,
          developerDesignDeck,
        );
        await writeProjectArtifacts(
          runId,
          developerSourceBundle,
          developerDesignPlan,
          project,
        );
        await patchRun(runId, (current) => ({
          ...current,
          source_bundle: developerSourceBundle,
          design_plan: developerDesignPlan,
          project,
        }));
        await endStage(runId, "developer", "project와 standalone HTML artifact를 다시 생성했습니다.");
      } else {
        project = await readValidatedArtifact(
          runId,
          "project.json",
          carouselProjectSchema,
          "project",
        );
      }

      let qaReport: z.infer<typeof qaReportSchema>;
      let qaProject = project;
      let qaAttempts: Awaited<ReturnType<typeof qaRepairLoop>>["attempts"] = [];

      if (shouldRunStage(parsed.stage, "qa-validator")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "qa-validator",
          "project artifact를 기준으로 deterministic validator를 다시 실행하는 중",
        );
        await assertRunIsActive(runId);
        const validatorContract = await runQaValidatorArtifactStage(runId);
        await endStage(
          runId,
          "qa-validator",
          validatorContract.hasActionableIssues
            ? `QA validator가 ${validatorContract.issueCount}개 구조 이슈를 기록했습니다.`
            : "QA validator가 구조 규칙 검사를 통과했습니다.",
        );
      }

      if (shouldRunStage(parsed.stage, "qa-reviewer")) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "qa-reviewer",
          "project artifact를 기준으로 reviewer QA를 다시 실행하는 중",
        );
        await assertRunIsActive(runId);
        const qaContract = await runQaReviewerArtifactStage(runId);

        qaReport = qaContract.qaReport;
        qaProject = qaContract.project;

        await endStage(
          runId,
          "qa-reviewer",
          qaContract.hasInitialActionableIssues
            ? `QA reviewer가 ${qaContract.initialIssueCount}개 이슈를 찾아 qa-repair로 넘겼습니다.`
            : "QA reviewer 재검수를 통과했습니다.",
        );

        if (qaContract.hasInitialActionableIssues) {
          await assertRunIsActive(runId);
          await startStage(
            runId,
            "qa-repair",
            "reviewer 이슈를 기준으로 자동 repair를 다시 실행하는 중",
          );
          const qaLoop = await runQaRepairArtifactStage(runId, getQaRepairPasses(migratedRun));
          qaReport = qaLoop.qaReport;
          qaProject = qaLoop.project;
          qaAttempts = qaLoop.attempts;

          const repairCount = qaAttempts.filter((attempt) => attempt.repaired).length;
          await patchRun(runId, (current) => ({
            ...current,
            logs: current.logs.map((log) =>
              log.stage === "qa-repair"
                ? {
                    ...log,
                    status: qaReport.high_count > 0 ? "failed" : "completed",
                    ended_at: now(),
                    summary:
                      repairCount > 0
                        ? `qa-repair가 ${repairCount}회 자동 수정 후 다시 검수했습니다.`
                        : "qa-repair가 고칠 슬라이드를 찾지 못했습니다.",
                  }
                : log,
            ),
          }));
        } else {
          await skipStage(runId, "qa-repair", "수정할 이슈가 없어 qa-repair를 건너뛰었습니다.");
        }
      } else {
        const qaReviewReport = await readQaReviewReportArtifact(runId);
        const hasInitialActionableIssues =
          qaReviewReport.high_count > 0 || qaReviewReport.medium_count > 0;

        if (hasInitialActionableIssues) {
          await assertRunIsActive(runId);
          await startStage(
            runId,
            "qa-repair",
            "기존 reviewer report를 기준으로 자동 repair를 다시 실행하는 중",
          );
          const qaLoop = await runQaRepairArtifactStage(runId, getQaRepairPasses(migratedRun));
          qaReport = qaLoop.qaReport;
          qaProject = qaLoop.project;
          qaAttempts = qaLoop.attempts;

          const repairCount = qaAttempts.filter((attempt) => attempt.repaired).length;
          await patchRun(runId, (current) => ({
            ...current,
            logs: current.logs.map((log) =>
              log.stage === "qa-repair"
                ? {
                    ...log,
                    status: qaReport.high_count > 0 ? "failed" : "completed",
                    ended_at: now(),
                    summary:
                      repairCount > 0
                        ? `qa-repair가 ${repairCount}회 자동 수정 후 다시 검수했습니다.`
                        : "qa-repair가 고칠 슬라이드를 찾지 못했습니다.",
                  }
                : log,
            ),
          }));
        } else {
          qaReport = qaReviewReport;
          await writeArtifact(runId, "qa-report.json", JSON.stringify(qaReport, null, 2));
          await writeArtifact(runId, "qa-attempts.json", JSON.stringify([], null, 2));
          await skipStage(runId, "qa-repair", "기존 reviewer report에 수정할 이슈가 없어 건너뛰었습니다.");
        }
      }

      const completedRun = await patchRun(runId, (current) => ({
        ...current,
        source_bundle: sourceBundle,
        design_plan: designPlan,
        project: qaProject,
        qa_report: qaReport,
        status: qaReport.high_count > 0 ? "failed" : "completed",
        current_stage: qaReport.high_count > 0 ? "qa-repair" : null,
        workflow_status: qaReport.high_count > 0 ? "failed" : "image_pending_approval",
        image_approval:
          qaReport.high_count > 0
            ? current.image_approval
            : createPendingApprovalState("local_preview"),
        publish_result:
          qaReport.high_count > 0 ? current.publish_result : createEmptyPublishResult(),
        error: qaReport.high_count > 0 ? "QA high severity issues remain after replay." : null,
      }));

      if (completedRun.workflow_status === "image_pending_approval") {
        await notifyTelegramRunUpdate({
          run: completedRun,
          type: "image_review_ready",
        });
      }

      return completedRun;
    } catch (error) {
      const failedRun = await patchRun(
        runId,
        (current) => ({
          ...current,
          status: "failed",
          workflow_status: "failed",
          error: error instanceof Error ? error.message : "Unknown replay error",
          logs: current.logs.map((log) =>
            log.stage === current.current_stage && log.status === "running"
              ? { ...log, status: "failed", ended_at: now() }
              : log,
          ),
        }),
        {
          allowFailedRun: true,
        },
      );

      await notifyTelegramRunUpdate({
        run: failedRun,
        type: "run_failed",
        errorMessage: error instanceof Error ? error.message : "Unknown replay error",
      });

      return failedRun;
    }
  });
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
    design_plan: null,
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
        "content-planner",
        "슬라이드 역할, 질문 톤, 패턴 슬롯을 설계하는 중",
      );
      await assertRunIsActive(runId);
      const designPlan = await buildDesignPlan(
        sourceBundle,
        run.title,
        getRunRevisionRequest(run),
      );
      await writeArtifact(runId, "design-plan.json", JSON.stringify(designPlan, null, 2));
      await patchRun(runId, (current) => ({ ...current, design_plan: designPlan }));
      await endStage(runId, "content-planner", "디자인 플랜을 먼저 만들었어요.");

      await assertRunIsActive(runId);
      await startStage(
        runId,
        "contents-marketer",
        "중학생용 카드뉴스 카피 구조를 만드는 중",
      );
      await assertRunIsActive(runId);
      const marketerSourceBundle = await readSourceBundleArtifact(runId);
      const marketerDesignPlan = await readDesignPlanArtifact(runId);
      const copyDeck = await buildCopyDeck(
        marketerSourceBundle,
        marketerDesignPlan,
        run.title,
        getRunRevisionRequest(run),
      );
      await writeArtifact(runId, "copy-deck.json", JSON.stringify(copyDeck, null, 2));
      await endStage(
        runId,
        "contents-marketer",
        `${copyDeck.slides.length}장 카드뉴스 카피 초안을 만들었어요.`,
      );

      await assertRunIsActive(runId);
      await startStage(runId, "designer", "시각 모듈과 카드 구성을 정리하는 중");
      await assertRunIsActive(runId);
      const designerSourceBundle = await readSourceBundleArtifact(runId);
      const designerDesignPlan = await readDesignPlanArtifact(runId);
      const designerCopyDeck = await readCopyDeckArtifact(runId);
      const designDeck = await buildDesignDeck(
        designerSourceBundle,
        designerDesignPlan,
        designerCopyDeck,
        getRunRevisionRequest(run),
      );
      await writeArtifact(runId, "design-deck.json", JSON.stringify(designDeck, null, 2));
      await endStage(runId, "designer", "슬라이드별 시각 구성을 정리했어요.");

      await assertRunIsActive(runId);
      await startStage(runId, "developer", "artifact 계약을 읽어 standalone HTML과 export 자산을 만드는 중");
      const developerSourceBundle = await readValidatedArtifact(
        runId,
        "source-bundle.json",
        sourceBundleSchema,
        "source bundle",
      );
      const developerDesignPlan = await readValidatedArtifact(
        runId,
        "design-plan.json",
        designPlanSchema,
        "design plan",
      );
      const developerCopyDeck = await readValidatedArtifact(
        runId,
        "copy-deck.json",
        copyDeckSchema,
        "copy deck",
      );
      const developerDesignDeck = await readValidatedArtifact(
        runId,
        "design-deck.json",
        designDeckSchema,
        "design deck",
      );
      let project = assembleCarouselProject(
        developerSourceBundle,
        developerDesignPlan,
        developerCopyDeck,
        developerDesignDeck,
      );
      await writeProjectArtifacts(runId, developerSourceBundle, developerDesignPlan, project);
      await patchRun(runId, (current) => ({
        ...current,
        source_bundle: developerSourceBundle,
        design_plan: developerDesignPlan,
        project,
      }));
      await endStage(
        runId,
        "developer",
        "artifact 계약을 다시 읽고 미리보기와 HTML 아티팩트를 저장했어요.",
      );

      await assertRunIsActive(runId);
      /* Legacy duplicate qa-validator stage start removed.
      await startStage(
        runId,
        "qa-validator",
        "내용, 길이, 리듬, 패턴 반복, 모듈 밀도를 검수하는 중",
      ); */
      await assertRunIsActive(runId);
      await assertRunIsActive(runId);
      await startStage(
        runId,
        "qa-validator",
        "standalone 구조, design-plan, renderer contract를 deterministic하게 검사하는 중",
      );
      await assertRunIsActive(runId);
      const qaValidatorContract = await runQaValidatorArtifactStage(runId);
      await endStage(
        runId,
        "qa-validator",
        qaValidatorContract.hasActionableIssues
          ? `QA validator가 ${qaValidatorContract.issueCount}개 구조 이슈를 찾았어요.`
          : "QA validator가 구조 규칙 검사를 통과했어요.",
      );

      await assertRunIsActive(runId);
      await startStage(
        runId,
        "qa-reviewer",
        "validator artifact를 읽고 최종 reviewer report를 만드는 중",
      );
      await assertRunIsActive(runId);
      const qaContract = await runQaReviewerArtifactStage(runId);
      const { hasInitialActionableIssues, initialIssueCount } = qaContract;

      await endStage(
        runId,
        "qa-reviewer",
        hasInitialActionableIssues
          ? `QA reviewer가 ${initialIssueCount}개 이슈를 찾아 qa-repair로 넘겼어요.`
          : "QA reviewer가 자동 검수를 통과시켰어요.",
      );
      const qaLoop = {
        project: qaContract.project,
        qaReport: qaContract.qaReport,
        attempts: [] as Awaited<ReturnType<typeof qaRepairLoop>>["attempts"],
      };
      project = qaLoop.project;

      if (hasInitialActionableIssues) {
        await assertRunIsActive(runId);
        await startStage(
          runId,
          "qa-repair",
          "문제가 있는 슬라이드를 자동으로 고치고 다시 검수하는 중",
        );
        const repairedQaLoop = await runQaRepairArtifactStage(runId, getQaRepairPasses(run));
        qaLoop.project = repairedQaLoop.project;
        qaLoop.qaReport = repairedQaLoop.qaReport;
        qaLoop.attempts = repairedQaLoop.attempts;
        project = qaLoop.project;

        const repairCount = qaLoop.attempts.filter((attempt) => attempt.repaired).length;
        await patchRun(runId, (current) => ({
          ...current,
          logs: current.logs.map((log) =>
            log.stage === "qa-repair"
              ? {
                  ...log,
                  status: qaLoop.qaReport.high_count > 0 ? "failed" : "completed",
                  ended_at: now(),
                  summary:
                    repairCount > 0
                      ? `qa-repair가 ${repairCount}번 자동 수정 후 다시 검수했어요.`
                      : "qa-repair가 고칠 슬라이드를 찾지 못했어요.",
                }
              : log,
          ),
        }));
      } else {
        await skipStage(runId, "qa-repair", "수정할 문제가 없어 qa-repair를 건너뛰었어요.");
      }

      const completedRun = await patchRun(runId, (current) => ({
        ...current,
        source_bundle: developerSourceBundle,
        design_plan: developerDesignPlan,
        project,
        qa_report: qaLoop.qaReport,
        status: qaLoop.qaReport.high_count > 0 ? "failed" : "completed",
        current_stage: qaLoop.qaReport.high_count > 0 ? "qa-repair" : null,
        workflow_status: qaLoop.qaReport.high_count > 0 ? "failed" : "image_pending_approval",
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
  const migration = await repairLegacyRunArtifactsInternal(
    runId,
    current,
    getRunRevisionRequest(current),
  );
  const repairedRun = migration.run;

  if (!repairedRun.project || !repairedRun.source_bundle) {
    throw new Error("생성된 프로젝트가 아직 없습니다.");
  }

  const sourceBundle =
    migration.sourceBundle ??
    (await readValidatedArtifact(
      runId,
      "source-bundle.json",
      sourceBundleSchema,
      "source bundle",
    ));
  const project =
    migration.project ??
    (await readValidatedArtifact(
      runId,
      "project.json",
      carouselProjectSchema,
      "project",
    ));
  const designPlan = repairedRun.design_plan
    ? await readValidatedArtifact(runId, "design-plan.json", designPlanSchema, "design plan")
    : null;

  const regenerated = await regenerateSlideFromProject(
    sourceBundle,
    project,
    designPlan,
    parsed.slideNumber,
  );

  await writeProjectArtifacts(runId, sourceBundle, designPlan, regenerated);
  await runQaValidatorArtifactStage(runId);
  const qaReview = await runQaReviewerArtifactStage(runId);
  const qaLoop = qaReview.hasInitialActionableIssues
    ? await runQaRepairArtifactStage(runId, 2)
    : {
        project: qaReview.project,
        qaReport: qaReview.qaReport,
        attempts: [] as Awaited<ReturnType<typeof qaRepairLoop>>["attempts"],
      };

  return patchRun(runId, (run) => ({
    ...run,
    source_bundle: sourceBundle,
    design_plan: designPlan,
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
