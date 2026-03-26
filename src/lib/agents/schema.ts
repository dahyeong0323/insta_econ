import { z } from "zod";

export const audienceValues = ["middle_school"] as const;
export const runEntrypointValues = ["manual", "research"] as const;
export const runStatusValues = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export const workflowStatusValues = [
  "draft",
  "researched",
  "script_pending_approval",
  "script_approved",
  "rendering",
  "image_pending_approval",
  "image_approved",
  "publishing",
  "published",
  "failed",
] as const;
export const approvalStatusValues = [
  "not_requested",
  "pending",
  "approved",
  "rejected",
] as const;
export const approvalTargetValues = ["script", "image"] as const;
export const approvalDecisionValues = ["approved", "rejected"] as const;
export const approvalChannelValues = ["telegram", "local_preview"] as const;
export const approvalEventTypeValues = [
  "requested",
  "approved",
  "rejected",
  "held",
  "skipped",
] as const;
export const publishStatusValues = [
  "not_requested",
  "pending",
  "publishing",
  "published",
  "failed",
] as const;
export const publishTriggerValues = [
  "manual_api",
  "auto_on_image_approval",
] as const;
export const publishAttemptStatusValues = ["publishing", "published", "failed"] as const;
export const publishNextActionValues = [
  "none",
  "retrying",
  "manual_retry",
  "manual_fix_required",
] as const;
export const publishControlActionValues = ["retry", "stop"] as const;
export const stageValues = [
  "source-parser",
  "content-planner",
  "contents-marketer",
  "designer",
  "developer",
  "qa-validator",
  "qa-reviewer",
  "qa-repair",
] as const;
export const originalPdfAgentValues = [
  "researcher",
  "contents-marketer",
  "designer",
  "developer",
  "qa-reviewer",
] as const;

type StageResponsibilitySpec = {
  originalAgent: (typeof originalPdfAgentValues)[number];
  stagePurpose: string;
  splitNote?: string;
  forbiddenResponsibilities: readonly string[];
};

export const stageResponsibilityMap = {
  "source-parser": {
    originalAgent: "researcher",
    stagePurpose: "Extract grounded source facts, numbers, terms, and quote candidates only.",
    splitNote: "Current runtime splits the original researcher into source-parser + content-planner.",
    forbiddenResponsibilities: [
      "Do not choose slide rhythm, question angles, or module structure.",
      "Do not write slide copy, badges, or reader-facing carousel text.",
      "Do not touch HTML, rendering, or QA pass/fail decisions.",
    ],
  },
  "content-planner": {
    originalAgent: "researcher",
    stagePurpose: "Turn the grounded source bundle into the deck plan, rhythm, and question flow.",
    splitNote: "Current runtime splits the original researcher into source-parser + content-planner.",
    forbiddenResponsibilities: [
      "Do not write final slide copy.",
      "Do not assign final badge/module payloads outside the plan contract.",
      "Do not edit rendered project output or make QA decisions.",
    ],
  },
  "contents-marketer": {
    originalAgent: "contents-marketer",
    stagePurpose: "Write reader-facing Korean slide copy that follows the approved plan exactly.",
    forbiddenResponsibilities: [
      "Do not change slide count, role sequence, or layout rhythm.",
      "Do not output visual production notes, module specs, or HTML.",
      "Do not review or repair slides as QA.",
    ],
  },
  designer: {
    originalAgent: "designer",
    stagePurpose: "Assign badges, visual tone details, and module payloads inside the plan contract.",
    forbiddenResponsibilities: [
      "Do not invent new source facts or rewrite the story arc.",
      "Do not output standalone HTML or renderer implementation details.",
      "Do not decide whether the deck passes QA.",
    ],
  },
  developer: {
    originalAgent: "developer",
    stagePurpose: "Assemble the validated project and standalone render output from saved artifacts.",
    forbiddenResponsibilities: [
      "Do not change the source bundle, plan, or copy intent on your own.",
      "Do not perform review-only QA judgment.",
      "Do not choose new topic angles or redesign the narrative rhythm.",
    ],
  },
  "qa-validator": {
    originalAgent: "qa-reviewer",
    stagePurpose: "Run deterministic structural checks before human-like review heuristics.",
    splitNote: "Current runtime splits the original qa-reviewer into qa-validator + qa-reviewer.",
    forbiddenResponsibilities: [
      "Do not rewrite slides or mutate the project.",
      "Do not introduce new facts, copy, or layout decisions.",
      "Do not act as the repair stage.",
    ],
  },
  "qa-reviewer": {
    originalAgent: "qa-reviewer",
    stagePurpose: "Review readability, grounding, and presentation quality without editing slides.",
    splitNote: "Current runtime splits the original qa-reviewer into qa-validator + qa-reviewer.",
    forbiddenResponsibilities: [
      "Do not rewrite slides or mutate the project.",
      "Do not act as the repair stage.",
      "Do not expand scope into topic planning or rendering.",
    ],
  },
  "qa-repair": {
    originalAgent: "developer",
    stagePurpose: "Repair only the flagged slides while preserving the approved story and plan.",
    splitNote: "Current runtime treats repair as a developer-side execution pass after review.",
    forbiddenResponsibilities: [
      "Do not re-plan the entire deck or change unaffected slides.",
      "Do not invent unsupported facts, numbers, or quotes.",
      "Do not act as the reviewer that decides whether issues exist.",
    ],
  },
} satisfies Record<(typeof stageValues)[number], StageResponsibilitySpec>;
export const minCarouselSlides = 6;
export const maxCarouselSlides = 10;
export const editorialThemeName = "editorial-qna" as const;
export const slideRoleValues = [
  "hook",
  "core",
  "why",
  "example",
  "compare",
  "number_or_steps",
  "recap",
  "closing",
] as const;
export const moduleTypeValues = [
  "role-strip",
  "before-after",
  "code-window",
  "checklist-table",
  "timeline",
  "three-card-summary",
  "number-spotlight",
  "message-banner",
] as const;
export const visualToneValues = ["cover", "light", "dark"] as const;
export const layoutPatternValues = [
  "cover-hero",
  "qa-checklist",
  "qa-before-after",
  "qa-role-strip",
  "qa-code-window",
  "qa-timeline",
  "qa-three-card",
  "qa-message-banner",
  "closing-statement",
] as const;
export const narrativePhaseValues = [
  "hook",
  "definition",
  "turn",
  "proof",
  "practice",
  "recap",
  "closing",
] as const;
export const moduleWeightValues = ["light", "medium", "heavy"] as const;
export const textDensityValues = ["tight", "balanced", "dense"] as const;

const approvalStateDefaults = {
  status: "not_requested" as const,
  requested_at: null,
  responded_at: null,
  approved_at: null,
  rejected_at: null,
  approver: null,
  response_text: null,
  channel: null,
  telegram_message_id: null,
};

const publishResultDefaults = {
  status: "not_requested" as const,
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
  next_action: "none" as const,
  hold_reason: null,
  held_at: null,
  last_trigger: null,
};

const telegramDeliveryDefaults = {
  last_chat_id: null,
  script_message_id: null,
  image_message_id: null,
  script_reply_message_id: null,
  image_reply_message_id: null,
  publish_control_message_id: null,
};

const approvalHistoryDefaults: ApprovalHistoryEntry[] = [];
const publishAttemptDefaults: PublishAttempt[] = [];

export const sourceFactSchema = z
  .object({
    fact: z.string().min(1).max(220),
    source_excerpt: z.string().min(1).max(240),
  })
  .strict();

export const sourceBundleSchema = z
  .object({
    raw_text: z.string().min(1),
    extracted_text: z.string().min(1),
    source_title: z.string().min(1).max(120),
    source_summary: z.string().min(1).max(320),
    key_terms: z.array(z.string().min(1).max(40)).min(3).max(8),
    facts: z.array(sourceFactSchema).min(4).max(12),
    numbers: z.array(z.string().min(1).max(60)).max(8),
    quote_candidates: z.array(z.string().min(1).max(180)).max(5),
    simplification_notes: z.array(z.string().min(1).max(140)).min(2).max(5),
  })
  .strict();

export const moduleCardSchema = z
  .object({
    label: z.string().min(1).max(40),
    title: z.string().min(1).max(80),
    value: z.string().min(1).max(120),
    note: z.string().max(120).nullable(),
    accent: z.enum(["orange", "blue", "green", "pink", "yellow", "dark"]),
  })
  .strict();

export const slideModuleSchema = z
  .object({
    type: z.enum(moduleTypeValues),
    title: z.string().min(1).max(80),
    subtitle: z.string().max(120).nullable(),
    items: z.array(moduleCardSchema).min(1).max(5),
    footer: z.string().max(140).nullable(),
  })
  .strict();

function inferLegacyLayoutPattern(
  visualTone: (typeof visualToneValues)[number],
  moduleType: (typeof moduleTypeValues)[number],
) {
  if (visualTone === "cover") {
    return "cover-hero" as const;
  }

  if (visualTone === "dark") {
    return "closing-statement" as const;
  }

  switch (moduleType) {
    case "role-strip":
      return "qa-role-strip" as const;
    case "before-after":
      return "qa-before-after" as const;
    case "code-window":
      return "qa-code-window" as const;
    case "checklist-table":
      return "qa-checklist" as const;
    case "timeline":
      return "qa-timeline" as const;
    case "three-card-summary":
      return "qa-three-card" as const;
    case "message-banner":
    case "number-spotlight":
    default:
      return "qa-message-banner" as const;
  }
}

function inferLegacyNarrativePhase(role: (typeof slideRoleValues)[number]) {
  switch (role) {
    case "hook":
      return "hook" as const;
    case "core":
      return "definition" as const;
    case "why":
      return "turn" as const;
    case "example":
    case "compare":
      return "proof" as const;
    case "number_or_steps":
      return "practice" as const;
    case "recap":
      return "recap" as const;
    case "closing":
      return "closing" as const;
  }
}

function inferLegacyModuleWeight(
  visualTone: (typeof visualToneValues)[number],
  role: (typeof slideRoleValues)[number],
) {
  if (visualTone !== "light") {
    return "light" as const;
  }

  if (role === "recap") {
    return "medium" as const;
  }

  return "heavy" as const;
}

function inferLegacyTextDensity(
  visualTone: (typeof visualToneValues)[number],
  role: (typeof slideRoleValues)[number],
) {
  if (visualTone !== "light" || role === "hook" || role === "closing") {
    return "tight" as const;
  }

  if (role === "core" || role === "why") {
    return "balanced" as const;
  }

  return "dense" as const;
}

export const slideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(maxCarouselSlides),
    role: z.enum(slideRoleValues),
    visual_tone: z.enum(visualToneValues),
    layout_pattern: z.enum(layoutPatternValues).optional(),
    narrative_phase: z.enum(narrativePhaseValues).optional(),
    module_weight: z.enum(moduleWeightValues).optional(),
    text_density: z.enum(textDensityValues).optional(),
    question_badge: z.string().min(1).max(32),
    headline: z.string().min(1).max(120),
    body: z.string().min(1).max(280),
    emphasis: z.string().max(60).nullable(),
    save_point: z.string().max(120).nullable(),
    source_excerpt: z.string().min(1).max(220),
    module: slideModuleSchema,
    standalone_html: z.string().min(1),
  })
  .strict()
  .transform((slide) => ({
    ...slide,
    layout_pattern:
      slide.layout_pattern ??
      inferLegacyLayoutPattern(slide.visual_tone, slide.module.type),
    narrative_phase: slide.narrative_phase ?? inferLegacyNarrativePhase(slide.role),
    module_weight:
      slide.module_weight ?? inferLegacyModuleWeight(slide.visual_tone, slide.role),
    text_density:
      slide.text_density ?? inferLegacyTextDensity(slide.visual_tone, slide.role),
  }));

export const designPlanSlideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(maxCarouselSlides),
    role: z.enum(slideRoleValues),
    visual_tone: z.enum(visualToneValues),
    layout_pattern: z.enum(layoutPatternValues),
    narrative_phase: z.enum(narrativePhaseValues),
    module_weight: z.enum(moduleWeightValues),
    text_density: z.enum(textDensityValues),
    emotional_temperature: z.number().int().min(1).max(5),
    question_angle: z.string().min(1).max(80),
    question_tone: z.string().min(1).max(40),
    module_goal: z.string().min(1).max(120),
    module_candidates: z.array(z.enum(moduleTypeValues)).min(1).max(3),
    forbidden_patterns: z.array(z.enum(layoutPatternValues)).max(3),
    text_budget: z
      .object({
        headline_max: z.number().int().min(24).max(120),
        body_max: z.number().int().min(60).max(280),
        emphasis_max: z.number().int().min(20).max(60),
        save_point_max: z.number().int().min(20).max(120),
      })
      .strict(),
  })
  .strict();

const carouselSlidesSchema = z
  .array(slideSchema)
  .min(minCarouselSlides)
  .max(maxCarouselSlides)
  .superRefine((slides, ctx) => {
    const seen = new Set<number>();

    slides.forEach((slide, index) => {
      const expectedSlideNumber = index + 1;

      if (seen.has(slide.slide_number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate slide number ${slide.slide_number}.`,
          path: [index, "slide_number"],
        });
      }

      seen.add(slide.slide_number);

      if (slide.slide_number !== expectedSlideNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Slide numbers must be sequential starting at 1. Expected ${expectedSlideNumber}.`,
          path: [index, "slide_number"],
        });
      }
    });

    if (slides[0]?.role !== "hook") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first slide must use the hook role.",
        path: [0, "role"],
      });
    }

    const lastSlideIndex = slides.length - 1;

    if (lastSlideIndex >= 0 && slides[lastSlideIndex]?.role !== "closing") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The final slide must use the closing role.",
        path: [lastSlideIndex, "role"],
      });
    }
  });

export const qaIssueSchema = z
  .object({
    severity: z.enum(["high", "medium", "low"]),
    stage: z.enum(stageValues),
    message: z.string().min(1).max(220),
  })
  .strict();

export const qaReportSchema = z
  .object({
    high_count: z.number().int().min(0),
    medium_count: z.number().int().min(0),
    low_count: z.number().int().min(0),
    checks_passed: z.array(z.string().min(1).max(80)).min(3).max(10),
    issues: z.array(qaIssueSchema).max(12),
  })
  .strict();

export const qaValidatorReportSchema = qaReportSchema;

export const carouselProjectSchema = z
  .object({
    brand_label: z.string().min(1).max(40),
    project_title: z.string().min(1).max(120),
    audience: z.enum(audienceValues),
    language: z.literal("ko"),
    theme_name: z.string().min(1).max(40),
    caption: z.string().min(1).max(1200),
    slides: carouselSlidesSchema,
  })
  .strict();

export const designPlanSchema = z
  .object({
    theme_name: z.string().min(1).max(40),
    guardrails: z.array(z.string().min(1).max(120)).min(3).max(8),
    story_arc: z.string().min(1).max(200),
    slides: z.array(designPlanSlideSchema).min(minCarouselSlides).max(maxCarouselSlides),
  })
  .strict();

export const stageLogSchema = z
  .object({
    stage: z.enum(stageValues),
    status: z.enum(["pending", "running", "completed", "failed"]),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    summary: z.string().max(200).nullable(),
  })
  .strict();

export const approvalStateSchema = z
  .object({
    status: z.enum(approvalStatusValues).default(approvalStateDefaults.status),
    requested_at: z.string().nullable().default(approvalStateDefaults.requested_at),
    responded_at: z.string().nullable().default(approvalStateDefaults.responded_at),
    approved_at: z.string().nullable().default(approvalStateDefaults.approved_at),
    rejected_at: z.string().nullable().default(approvalStateDefaults.rejected_at),
    approver: z.string().max(80).nullable().default(approvalStateDefaults.approver),
    response_text: z.string().max(500).nullable().default(approvalStateDefaults.response_text),
    channel: z.enum(approvalChannelValues).nullable().default(approvalStateDefaults.channel),
    telegram_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(approvalStateDefaults.telegram_message_id),
  })
  .strict();

export const approvalHistoryEntrySchema = z
  .object({
    id: z.string().min(1),
    approval_type: z.enum(approvalTargetValues),
    event_type: z.enum(approvalEventTypeValues),
    occurred_at: z.string(),
    approval_status: z.enum(approvalStatusValues),
    workflow_status: z.enum(workflowStatusValues),
    channel: z.enum(approvalChannelValues).nullable(),
    approver: z.string().max(80).nullable(),
    note: z.string().max(1000).nullable(),
    chat_id: z.string().max(120).nullable(),
    telegram_message_id: z.string().max(120).nullable(),
    delivery_summary: z.string().max(1200).nullable(),
  })
  .strict();

export const publishResultSchema = z
  .object({
    status: z.enum(publishStatusValues).default(publishResultDefaults.status),
    requested_at: z.string().nullable().default(publishResultDefaults.requested_at),
    started_at: z.string().nullable().default(publishResultDefaults.started_at),
    published_at: z.string().nullable().default(publishResultDefaults.published_at),
    provider: z.enum(["instagram"]).nullable().default(publishResultDefaults.provider),
    instagram_creation_id: z
      .string()
      .max(120)
      .nullable()
      .default(publishResultDefaults.instagram_creation_id),
    instagram_media_id: z
      .string()
      .max(120)
      .nullable()
      .default(publishResultDefaults.instagram_media_id),
    permalink: z.string().max(500).nullable().default(publishResultDefaults.permalink),
    error: z.string().max(500).nullable().default(publishResultDefaults.error),
    current_attempt_id: z.string().max(120).nullable().default(null),
    retryable: z.boolean().default(publishResultDefaults.retryable),
    next_action: z
      .enum(publishNextActionValues)
      .default(publishResultDefaults.next_action),
    hold_reason: z.string().max(500).nullable().default(publishResultDefaults.hold_reason),
    held_at: z.string().nullable().default(publishResultDefaults.held_at),
    last_trigger: z
      .enum(publishTriggerValues)
      .nullable()
      .default(publishResultDefaults.last_trigger),
  })
  .strict();

export const publishAttemptSchema = z
  .object({
    id: z.string().min(1),
    trigger: z.enum(publishTriggerValues),
    requested_by: z.string().max(80).nullable(),
    status: z.enum(publishAttemptStatusValues),
    requested_at: z.string(),
    started_at: z.string(),
    completed_at: z.string().nullable(),
    caption: z.string().max(2200).nullable(),
    provider: z.enum(["instagram"]).nullable(),
    instagram_creation_id: z.string().max(120).nullable(),
    instagram_media_id: z.string().max(120).nullable(),
    permalink: z.string().max(500).nullable(),
    error: z.string().max(500).nullable(),
  })
  .strict();

export const telegramDeliverySchema = z
  .object({
    last_chat_id: z.string().max(120).nullable().default(telegramDeliveryDefaults.last_chat_id),
    script_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(telegramDeliveryDefaults.script_message_id),
    image_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(telegramDeliveryDefaults.image_message_id),
    script_reply_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(telegramDeliveryDefaults.script_reply_message_id),
    image_reply_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(telegramDeliveryDefaults.image_reply_message_id),
    publish_control_message_id: z
      .string()
      .max(120)
      .nullable()
      .default(telegramDeliveryDefaults.publish_control_message_id),
  })
  .strict();

export const runStateSchema = z
  .object({
    id: z.string().min(1),
    entrypoint: z.enum(runEntrypointValues).default("manual"),
    status: z.enum(runStatusValues),
    current_stage: z.enum(stageValues).nullable(),
    workflow_status: z.enum(workflowStatusValues).default("draft"),
    title: z.string().max(120).nullable(),
    audience: z.enum(audienceValues),
    created_at: z.string(),
    updated_at: z.string(),
    source_file_name: z.string().nullable(),
    source_bundle: sourceBundleSchema.nullable(),
    design_plan: designPlanSchema.nullable().default(null),
    project: carouselProjectSchema.nullable(),
    qa_report: qaReportSchema.nullable(),
    telegram: telegramDeliverySchema.default(telegramDeliveryDefaults),
    script_approval: approvalStateSchema.default(approvalStateDefaults),
    image_approval: approvalStateSchema.default(approvalStateDefaults),
    approval_history: z
      .array(approvalHistoryEntrySchema)
      .default(approvalHistoryDefaults),
    publish_result: publishResultSchema.default(publishResultDefaults),
    publish_attempts: z.array(publishAttemptSchema).default(publishAttemptDefaults),
    error: z.string().nullable(),
    logs: z.array(stageLogSchema).min(stageValues.length - 1).max(stageValues.length),
  })
  .strict();

export const createRunSchema = z.object({
  title: z.string().max(120).optional(),
  sourceText: z.string().max(150000).optional(),
  audience: z.enum(audienceValues).default("middle_school"),
  entrypoint: z.enum(runEntrypointValues).optional().default("manual"),
  deferProcessing: z.boolean().optional().default(false),
});

export const requestApprovalSchema = z
  .object({
    approvalType: z.enum(approvalTargetValues),
    channel: z.enum(approvalChannelValues).default("local_preview"),
    approver: z.string().max(80).optional(),
    chatId: z.string().max(120).optional(),
    telegramMessageId: z.string().max(120).optional(),
    note: z.string().max(500).optional(),
    deliverySummary: z.string().max(1200).optional(),
  })
  .strict();

export const respondApprovalSchema = z
  .object({
    approvalType: z.enum(approvalTargetValues),
    decision: z.enum(approvalDecisionValues),
    approver: z.string().max(80).optional(),
    responseText: z.string().max(500).optional(),
    channel: z.enum(approvalChannelValues).optional(),
    chatId: z.string().max(120).optional(),
    telegramMessageId: z.string().max(120).optional(),
  })
  .strict();

export const publishRunSchema = z
  .object({
    caption: z.string().max(2200).optional(),
    trigger: z.enum(publishTriggerValues).optional().default("manual_api"),
    requestedBy: z.string().max(80).optional(),
  })
  .strict();

export const publishControlSchema = z
  .object({
    action: z.enum(publishControlActionValues),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const regenerateSlideSchema = z
  .object({
    slideNumber: z.number().int().min(1),
  })
  .strict();

export type Audience = (typeof audienceValues)[number];
export type RunEntrypoint = (typeof runEntrypointValues)[number];
export type StageName = (typeof stageValues)[number];
export type ModuleType = (typeof moduleTypeValues)[number];
export type WorkflowStatus = (typeof workflowStatusValues)[number];
export type SlideRole = (typeof slideRoleValues)[number];
export type VisualTone = (typeof visualToneValues)[number];
export type ApprovalStatus = (typeof approvalStatusValues)[number];
export type ApprovalTarget = (typeof approvalTargetValues)[number];
export type ApprovalDecision = (typeof approvalDecisionValues)[number];
export type ApprovalEventType = (typeof approvalEventTypeValues)[number];
export type PublishTrigger = (typeof publishTriggerValues)[number];
export type PublishControlAction = (typeof publishControlActionValues)[number];
export type LayoutPattern = (typeof layoutPatternValues)[number];
export type NarrativePhase = (typeof narrativePhaseValues)[number];
export type ModuleWeight = (typeof moduleWeightValues)[number];
export type TextDensity = (typeof textDensityValues)[number];
export type SourceBundle = z.infer<typeof sourceBundleSchema>;
export type SlideModule = z.infer<typeof slideModuleSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type QaReport = z.infer<typeof qaReportSchema>;
export type QaValidatorReport = z.infer<typeof qaValidatorReportSchema>;
export type CarouselProject = z.infer<typeof carouselProjectSchema>;
export type DesignPlanSlide = z.infer<typeof designPlanSlideSchema>;
export type DesignPlan = z.infer<typeof designPlanSchema>;
export type ApprovalState = z.infer<typeof approvalStateSchema>;
export type ApprovalHistoryEntry = z.infer<typeof approvalHistoryEntrySchema>;
export type PublishResult = z.infer<typeof publishResultSchema>;
export type PublishAttempt = z.infer<typeof publishAttemptSchema>;
export type RequestApprovalInput = z.infer<typeof requestApprovalSchema>;
export type RespondApprovalInput = z.infer<typeof respondApprovalSchema>;
export type PublishRunInput = z.infer<typeof publishRunSchema>;
export type PublishControlInput = z.infer<typeof publishControlSchema>;
export type RunState = z.infer<typeof runStateSchema>;
