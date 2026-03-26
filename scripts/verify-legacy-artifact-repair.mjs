import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

import { createJiti } from "jiti";

const root = process.cwd();
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  interopDefault: true,
  alias: {
    "@": path.join(root, "src"),
  },
});

const {
  buildFallbackDesignPlan,
  buildFallbackProject,
  buildFallbackSourceBundle,
} = jiti(path.join(root, "src/lib/agents/fallback.ts"));
const { runQa } = jiti(path.join(root, "src/lib/agents/pipeline.ts"));
const {
  repairLegacyRunArtifacts,
} = jiti(path.join(root, "src/lib/runs/processor.ts"));
const {
  buildEmptyLogs,
  clearRun,
  readArtifact,
  writeRunState,
} = jiti(path.join(root, "src/lib/runs/storage.ts"));
const {
  carouselProjectSchema,
  designPlanSchema,
  qaReportSchema,
  sourceBundleSchema,
} = jiti(path.join(root, "src/lib/agents/schema.ts"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createIdleApprovalState() {
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

function createEmptyPublishResult() {
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

async function main() {
  const runId = `legacy-repair-${crypto.randomUUID()}`;
  const createdAt = new Date("2026-03-26T09:00:00.000Z").toISOString();
  const sourceText = [
    "물가는 여러 상품과 서비스의 평균 가격 수준을 뜻합니다.",
    "같은 돈으로 살 수 있는 것이 줄면 구매력은 약해집니다.",
    "학생은 간식값이나 교통비에서 물가 변화를 먼저 체감합니다.",
    "숫자 하나보다 생활 변화와 연결해서 설명해야 이해가 쉽습니다.",
  ].join(" ");

  const bundle = sourceBundleSchema.parse(
    buildFallbackSourceBundle(sourceText, sourceText, "legacy repair fixture"),
  );
  const plan = designPlanSchema.parse(buildFallbackDesignPlan(bundle));
  const project = carouselProjectSchema.parse(buildFallbackProject(bundle, plan));
  const qaReport = qaReportSchema.parse(runQa(project, bundle, plan));

  try {
    await writeRunState({
      id: runId,
      entrypoint: "manual",
      status: "completed",
      current_stage: null,
      workflow_status: "image_pending_approval",
      title: "legacy repair fixture",
      audience: "middle_school",
      created_at: createdAt,
      updated_at: createdAt,
      source_file_name: null,
      source_bundle: bundle,
      design_plan: null,
      project,
      qa_report: qaReport,
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
    });

    const result = await repairLegacyRunArtifacts(runId);

    for (const filename of [
      "source-bundle.json",
      "design-plan.json",
      "copy-deck.json",
      "design-deck.json",
      "project.json",
      "qa-validator-report.json",
      "qa-review-report.json",
      "qa-report.json",
      "qa-attempts.json",
      "artifact-migration-report.json",
      ...project.slides.map((slide) => `slide-${slide.slide_number}.html`),
    ]) {
      const content = await readArtifact(runId, filename).catch(() => null);
      assert(content, `expected repaired artifact to exist: ${filename}`);
    }

    assert(
      result.report.repaired.includes("design-plan.json"),
      "repair report should record migrated design-plan.json",
    );
    assert(
      result.report.repaired.includes("copy-deck.json"),
      "repair report should record migrated copy-deck.json",
    );
    assert(
      result.report.repaired.includes("design-deck.json"),
      "repair report should record migrated design-deck.json",
    );
    assert(
      result.report.repaired.includes("qa-validator-report.json"),
      "repair report should record migrated qa-validator-report.json",
    );
    assert(
      result.report.repaired.includes("qa-review-report.json"),
      "repair report should record migrated qa-review-report.json",
    );

    console.log("legacy artifact repair fixture passed");
  } finally {
    await clearRun(runId).catch(() => undefined);
  }
}

await main();
