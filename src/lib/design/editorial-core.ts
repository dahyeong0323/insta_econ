import {
  editorialThemeName,
  type DesignPlan,
  type DesignPlanSlide,
  type LayoutPattern,
  type ModuleType,
  type ModuleWeight,
  type NarrativePhase,
  type Slide,
  type SlideRole,
  type TextDensity,
  type VisualTone,
} from "@/lib/agents/schema";

type SlideVariant = "cover" | "middle" | "closing";

export const brandText = "보리의 10대를 위한 경제";
export const editorialThemeLabel = "Editorial Q&A";

export const editorialTheme = {
  name: editorialThemeName,
  canvasWidth: 1080,
  canvasHeight: 1350,
  pagePaddingX: 58,
  pagePaddingLeft: 68,
  pagePaddingY: 58,
  borderRadius: 34,
  colors: {
    cover: "#ff6b35",
    coverShadow: "rgba(255,107,53,0.22)",
    light: "#f3f1f6",
    lightAlt: "#f5f3f8",
    lightBorder: "#e7e4eb",
    dark: "#121215",
    darkShadow: "rgba(17,17,19,0.28)",
    ink: "#18181b",
    muted: "#7a7480",
    subtle: "#b8b2bc",
    accent: "#ff6b35",
    accentSoft: "#ff8358",
    accentDeep: "#db5c2b",
    white: "#ffffff",
    badgeDark: "rgba(0,0,0,0.12)",
    highlightBlue: "#5d8ff5",
    highlightGreen: "#4fd89e",
    highlightPink: "#f57aaa",
    highlightYellow: "#ffc74b",
    cardShadow: "rgba(44,34,24,0.10)",
  },
} as const;

export const accentSurface = {
  orange: { background: "#ff7a4e", color: "#ffffff" },
  blue: { background: "#5d8ff5", color: "#ffffff" },
  green: { background: "#4fd89e", color: "#103727" },
  pink: { background: "#f57aaa", color: "#ffffff" },
  yellow: { background: "#ffc74b", color: "#3f2d02" },
  dark: { background: "#1f2023", color: "#f5f4f7" },
} as const;

export const narrativeTemperatureMap: Record<NarrativePhase, number> = {
  hook: 1,
  definition: 2,
  turn: 3,
  proof: 4,
  practice: 3,
  recap: 4,
  closing: 5,
};

export const roleSequenceMap: Record<number, SlideRole[]> = {
  6: ["hook", "core", "why", "compare", "recap", "closing"],
  7: ["hook", "core", "why", "example", "compare", "recap", "closing"],
  8: ["hook", "core", "why", "example", "compare", "number_or_steps", "recap", "closing"],
  9: ["hook", "core", "why", "example", "compare", "example", "number_or_steps", "recap", "closing"],
  10: [
    "hook",
    "core",
    "why",
    "example",
    "compare",
    "example",
    "compare",
    "number_or_steps",
    "recap",
    "closing",
  ],
};

export const rolePatternMatrix: Record<SlideRole, LayoutPattern[]> = {
  hook: ["cover-hero"],
  core: ["qa-checklist", "qa-code-window"],
  why: ["qa-before-after", "qa-role-strip"],
  example: ["qa-timeline", "qa-code-window"],
  compare: ["qa-three-card", "qa-before-after", "qa-role-strip"],
  number_or_steps: ["qa-checklist", "qa-code-window", "qa-message-banner"],
  recap: ["qa-message-banner", "qa-three-card", "qa-checklist"],
  closing: ["closing-statement"],
};

export const patternModuleTypeMap: Record<LayoutPattern, ModuleType> = {
  "cover-hero": "message-banner",
  "qa-checklist": "checklist-table",
  "qa-before-after": "before-after",
  "qa-role-strip": "role-strip",
  "qa-code-window": "code-window",
  "qa-timeline": "timeline",
  "qa-three-card": "three-card-summary",
  "qa-message-banner": "message-banner",
  "closing-statement": "message-banner",
};

export const moduleTypePatternMap: Record<ModuleType, LayoutPattern> = {
  "role-strip": "qa-role-strip",
  "before-after": "qa-before-after",
  "code-window": "qa-code-window",
  "checklist-table": "qa-checklist",
  timeline: "qa-timeline",
  "three-card-summary": "qa-three-card",
  "number-spotlight": "qa-message-banner",
  "message-banner": "qa-message-banner",
};

const defaultPhaseByRole: Record<SlideRole, NarrativePhase> = {
  hook: "hook",
  core: "definition",
  why: "turn",
  example: "proof",
  compare: "practice",
  number_or_steps: "practice",
  recap: "recap",
  closing: "closing",
};

const defaultWeightByPattern: Record<LayoutPattern, ModuleWeight> = {
  "cover-hero": "light",
  "qa-checklist": "heavy",
  "qa-before-after": "heavy",
  "qa-role-strip": "heavy",
  "qa-code-window": "heavy",
  "qa-timeline": "medium",
  "qa-three-card": "heavy",
  "qa-message-banner": "medium",
  "closing-statement": "light",
};

const defaultDensityByPattern: Record<LayoutPattern, TextDensity> = {
  "cover-hero": "balanced",
  "qa-checklist": "dense",
  "qa-before-after": "balanced",
  "qa-role-strip": "tight",
  "qa-code-window": "dense",
  "qa-timeline": "balanced",
  "qa-three-card": "balanced",
  "qa-message-banner": "tight",
  "closing-statement": "tight",
};

const densityConfig: Record<
  TextDensity,
  {
    titleWidth: string;
    titleSize: number;
    bodyWidth: string;
    bodySize: number;
    bodyMarginTop: number;
    bodyLineHeight: number;
    emphasisSize: number;
    saveSize: number;
  }
> = {
  tight: {
    titleWidth: "94%",
    titleSize: 72,
    bodyWidth: "86%",
    bodySize: 29,
    bodyMarginTop: 34,
    bodyLineHeight: 1.55,
    emphasisSize: 24,
    saveSize: 20,
  },
  balanced: {
    titleWidth: "90%",
    titleSize: 66,
    bodyWidth: "84%",
    bodySize: 28,
    bodyMarginTop: 40,
    bodyLineHeight: 1.6,
    emphasisSize: 25,
    saveSize: 21,
  },
  dense: {
    titleWidth: "92%",
    titleSize: 60,
    bodyWidth: "88%",
    bodySize: 27,
    bodyMarginTop: 42,
    bodyLineHeight: 1.64,
    emphasisSize: 24,
    saveSize: 20,
  },
};

const weightConfig: Record<
  ModuleWeight,
  {
    minHeight: number;
    zoneTop: number;
    zoneBottom: number;
  }
> = {
  light: {
    minHeight: 300,
    zoneTop: 20,
    zoneBottom: 8,
  },
  medium: {
    minHeight: 360,
    zoneTop: 26,
    zoneBottom: 14,
  },
  heavy: {
    minHeight: 430,
    zoneTop: 30,
    zoneBottom: 18,
  },
};

export const editorialTokenCss = `
:root{
  --canvas-width:1080px;
  --canvas-height:1350px;
  --radius-canvas:34px;
  --radius-panel:32px;
  --radius-chip:18px;
  --safe-x-left:68px;
  --safe-x-right:58px;
  --safe-y-top:58px;
  --safe-y-bottom:58px;
  --shadow-cover:0 28px 70px rgba(255,107,53,.22);
  --shadow-card:0 24px 56px rgba(44,34,24,.08);
  --shadow-module:0 24px 50px rgba(34,29,27,.10);
  --shadow-dark:0 28px 70px rgba(17,17,19,.28);
  --font-base:"IBM Plex Sans KR","Noto Sans KR","Pretendard","Apple SD Gothic Neo",sans-serif;
  --ink:#16161a;
  --ink-soft:#746f78;
  --muted:#b7b2bb;
  --muted-deep:#8f8893;
  --badge-dark:rgba(0,0,0,.12);
  --cover-badge-ink:#2a211d;
  --cover-body-ink:#95553e;
  --cover-brand-ink:#8f513e;
  --closing-counter-ink:#616168;
  --closing-body-ink:#d3d1d6;
  --closing-brand-ink:#606067;
  --cover-outline:#342721;
  --cover-card:#d7805f;
  --cover-paper:#ffe7d8;
  --cover-chip:#ffd368;
  --cover-outline-strong:rgba(52,39,33,.86);
  --cover-ring-soft:rgba(255,184,162,.60);
  --cover-orb-strong:rgba(255,255,255,.22);
  --cover-orb-soft:rgba(255,255,255,.15);
  --cover-orb-top:rgba(255,255,255,.18);
  --orange-tint-soft:rgba(255,141,98,.20);
  --blue-tint-soft:rgba(93,143,245,.10);
  --green-tint-soft:rgba(81,216,161,.20);
  --accent-halo:rgba(255,255,255,.12);
  --banner-kicker-ink:rgba(255,255,255,.78);
  --code-divider:rgba(255,255,255,.08);
  --timeline-track:#dfdbe3;
  --soft-divider:#efeaf2;
  --code-dot-red:#ff5f57;
  --code-dot-yellow:#febc2e;
  --code-dot-green:#28c840;
  --code-title-ink:#aaa5ae;
  --code-accent:#86c571;
  --code-body:#d7c0b0;
  --paper:#f3f1f6;
  --paper-border:#e7e3eb;
  --orange:#ff6b35;
  --orange-strong:#ff7847;
  --orange-soft:#ff8c62;
  --orange-banner:#ff8858;
  --orange-quiet:#9c5d48;
  --blue:#5d8ff5;
  --green:#51d8a1;
  --pink:#f57aaa;
  --yellow:#ffc74b;
  --dark:#1f1f22;
  --dark-surface:#111113;
  --white:#ffffff;
  --green-ink:#0f3929;
  --yellow-ink:#3f2b00;
  --dark-card-ink:#f7f6f9;
  --shadow-accent:0 24px 50px rgba(255,107,53,.16);
  --shadow-accent-soft:0 24px 50px rgba(255,107,53,.14);
}
`;

export const accentTokenMap: Record<
  Slide["module"]["items"][number]["accent"],
  {
    background: string;
    color: string;
  }
> = {
  orange: {
    background: "var(--orange-strong)",
    color: "var(--white)",
  },
  blue: {
    background: "var(--blue)",
    color: "var(--white)",
  },
  green: {
    background: "var(--green)",
    color: "var(--green-ink)",
  },
  pink: {
    background: "var(--pink)",
    color: "var(--white)",
  },
  yellow: {
    background: "var(--yellow)",
    color: "var(--yellow-ink)",
  },
  dark: {
    background: "var(--dark)",
    color: "var(--dark-card-ink)",
  },
};

export function getDefaultThemeName() {
  return editorialThemeName;
}

export function getNarrativeTemperature(phase: NarrativePhase) {
  return narrativeTemperatureMap[phase];
}

export function getEditorialRoleSequence(totalSlides: number) {
  return roleSequenceMap[totalSlides] ?? roleSequenceMap[8];
}

export function chooseEditorialSlideCount(factCount: number, numberCount = 0) {
  if (factCount >= 11) {
    return 10;
  }

  if (factCount >= 9) {
    return 9;
  }

  if (factCount >= 7 || numberCount >= 2) {
    return 8;
  }

  if (factCount >= 5) {
    return 7;
  }

  return 6;
}

export function getQuestionBadge(slideNumber: number, totalSlides: number) {
  if (slideNumber === 1) {
    return "Hello";
  }

  if (slideNumber === totalSlides) {
    return "Q";
  }

  return "Q";
}

export function formatPageCounter(page: number, totalSlides: number) {
  return `${String(page).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
}

export function getAllowedPatternsForRole(role: SlideRole) {
  return rolePatternMatrix[role];
}

export function getExpectedModuleTypeForPattern(pattern: LayoutPattern) {
  return patternModuleTypeMap[pattern] ?? null;
}

export function getPatternForModuleType(type: ModuleType) {
  return moduleTypePatternMap[type] ?? "qa-checklist";
}

export function getVisualToneForPattern(pattern: LayoutPattern): VisualTone {
  if (pattern === "cover-hero") {
    return "cover";
  }

  if (pattern === "closing-statement") {
    return "dark";
  }

  return "light";
}

export function getDefaultModuleWeight(pattern: LayoutPattern) {
  return defaultWeightByPattern[pattern];
}

export function getDefaultTextDensity(pattern: LayoutPattern) {
  return defaultDensityByPattern[pattern];
}

export function isEditorialTheme(themeName: string | null | undefined) {
  return !themeName || themeName === editorialThemeName;
}

export function getSlideVariant(
  slide: Pick<Slide, "visual_tone" | "layout_pattern">,
): SlideVariant {
  if (slide.layout_pattern === "cover-hero" || slide.visual_tone === "cover") {
    return "cover";
  }

  if (slide.layout_pattern === "closing-statement" || slide.visual_tone === "dark") {
    return "closing";
  }

  return "middle";
}

export function getPatternDecoration(pattern: LayoutPattern) {
  switch (pattern) {
    case "qa-checklist":
      return "square-bubble";
    case "qa-before-after":
      return "soft-orbs";
    case "qa-role-strip":
      return "corner-pills";
    case "qa-code-window":
      return "none";
    case "qa-timeline":
      return "none";
    case "qa-three-card":
      return "top-orb";
    case "qa-message-banner":
      return "soft-orbs";
    default:
      return "none";
  }
}

export function getSlideLayoutMetrics(
  slide: Pick<Slide, "layout_pattern" | "module_weight" | "text_density" | "visual_tone">,
) {
  const variant = getSlideVariant(slide);

  if (variant === "cover") {
    return {
      variant,
      titleWidth: "74%",
      titleSize: 84,
      bodyWidth: "78%",
      bodySize: 30,
      bodyMarginTop: 40,
      bodyLineHeight: 1.5,
      emphasisSize: 18,
      saveSize: 18,
      moduleMinHeight: 330,
      moduleZoneTop: 0,
      moduleZoneBottom: 0,
      moduleWidth: "100%",
    };
  }

  if (variant === "closing") {
    return {
      variant,
      titleWidth: "84%",
      titleSize: 70,
      bodyWidth: "72%",
      bodySize: 33,
      bodyMarginTop: 180,
      bodyLineHeight: 1.72,
      emphasisSize: 28,
      saveSize: 62,
      moduleMinHeight: 0,
      moduleZoneTop: 0,
      moduleZoneBottom: 0,
      moduleWidth: "100%",
    };
  }

  const density = densityConfig[slide.text_density];
  const weight = weightConfig[slide.module_weight];
  const narrowPattern =
    slide.layout_pattern === "qa-timeline" || slide.layout_pattern === "qa-code-window";

  return {
    variant,
    titleWidth: density.titleWidth,
    titleSize: density.titleSize,
    bodyWidth: density.bodyWidth,
    bodySize: density.bodySize,
    bodyMarginTop: density.bodyMarginTop,
    bodyLineHeight: density.bodyLineHeight,
    emphasisSize: density.emphasisSize,
    saveSize: density.saveSize,
    moduleMinHeight: weight.minHeight,
    moduleZoneTop: weight.zoneTop,
    moduleZoneBottom: weight.zoneBottom,
    moduleWidth: narrowPattern ? "94%" : "100%",
  };
}

export function getResolvedPattern(role: SlideRole, pattern: LayoutPattern | null | undefined) {
  const allowed = getAllowedPatternsForRole(role);

  if (pattern && allowed.includes(pattern)) {
    return pattern;
  }

  return rolePatternMatrix[role][0];
}

export function buildEditorialMeta(
  role: SlideRole,
  pattern: LayoutPattern | null | undefined,
  slideNumber: number,
  totalSlides: number,
) {
  const resolvedRole =
    slideNumber === 1 ? "hook" : slideNumber === totalSlides ? "closing" : role;
  const resolvedPattern =
    slideNumber === 1
      ? "cover-hero"
      : slideNumber === totalSlides
        ? "closing-statement"
        : getResolvedPattern(resolvedRole, pattern);

  return {
    role: resolvedRole,
    pattern: resolvedPattern,
    visualTone: getVisualToneForPattern(resolvedPattern),
    narrativePhase:
      slideNumber === 1
        ? "hook"
        : slideNumber === totalSlides
          ? "closing"
          : defaultPhaseByRole[resolvedRole],
    moduleWeight: getDefaultModuleWeight(resolvedPattern),
    textDensity: getDefaultTextDensity(resolvedPattern),
    questionBadge: getQuestionBadge(slideNumber, totalSlides),
  } as const;
}

function getQuestionTone(role: SlideRole) {
  switch (role) {
    case "hook":
      return "공감형 첫 질문";
    case "core":
      return "정의 확인형";
    case "why":
      return "원인 추적형";
    case "example":
      return "상황 예시형";
    case "compare":
      return "비교 구분형";
    case "number_or_steps":
      return "실전 적용형";
    case "recap":
      return "기억 고정형";
    case "closing":
      return "마무리형";
    default:
      return "설명형";
  }
}

function getQuestionAngle(role: SlideRole) {
  switch (role) {
    case "hook":
      return "처음 들으면 가장 먼저 생길 질문";
    case "core":
      return "정확한 뜻을 묻는 질문";
    case "why":
      return "왜 그렇게 되는지 묻는 질문";
    case "example":
      return "생활 속에서는 어떻게 보이는지 묻는 질문";
    case "compare":
      return "헷갈리는 개념 차이를 묻는 질문";
    case "number_or_steps":
      return "숫자나 절차를 어떻게 읽는지 묻는 질문";
    case "recap":
      return "지금 기억할 한 가지만 묻는 질문";
    case "closing":
      return "마지막으로 남길 결론 질문";
    default:
      return "핵심을 묻는 질문";
  }
}

function getTextBudget(pattern: LayoutPattern) {
  switch (pattern) {
    case "cover-hero":
      return { headline_max: 72, body_max: 120, emphasis_max: 48, save_point_max: 72 };
    case "closing-statement":
      return { headline_max: 88, body_max: 150, emphasis_max: 52, save_point_max: 84 };
    case "qa-message-banner":
      return { headline_max: 90, body_max: 180, emphasis_max: 52, save_point_max: 84 };
    default:
      return { headline_max: 90, body_max: 220, emphasis_max: 52, save_point_max: 84 };
  }
}

function getModuleGoal(role: SlideRole, pattern: LayoutPattern) {
  if (pattern === "cover-hero") {
    return "표지에서 주제를 즉시 인지시키기";
  }

  if (pattern === "closing-statement") {
    return "저장할 결론 한 줄을 남기기";
  }

  switch (role) {
    case "core":
      return "핵심 정의와 조건을 정리";
    case "why":
      return "오해와 실제 구조를 대비";
    case "example":
      return "생활 속 흐름이나 예시를 설명";
    case "compare":
      return "헷갈리는 차이를 구분";
    case "number_or_steps":
      return "실전 절차나 수치를 분해";
    case "recap":
      return "관통 메시지를 굵게 정리";
    default:
      return "핵심을 시각적으로 정리";
  }
}

function getPlanCandidates(role: SlideRole, pattern: LayoutPattern): ModuleType[] {
  const expected = getExpectedModuleTypeForPattern(pattern);
  const secondary =
    role === "number_or_steps"
      ? ["code-window", "checklist-table", "number-spotlight"]
      : role === "compare"
        ? ["three-card-summary", "before-after", "role-strip"]
        : role === "why"
          ? ["before-after", "role-strip", "checklist-table"]
          : role === "example"
            ? ["timeline", "three-card-summary", "code-window"]
            : role === "recap"
              ? ["message-banner", "three-card-summary", "checklist-table"]
              : ["checklist-table", "code-window", "three-card-summary"];

  return [expected, ...secondary]
    .filter(
      (value, index, array): value is ModuleType =>
        Boolean(value) && array.indexOf(value) === index,
    )
    .slice(0, 3);
}

function getForbiddenPatterns(index: number, pattern: LayoutPattern, slides: DesignPlanSlide[]) {
  const previousPattern = index > 0 ? slides[index - 1]?.layout_pattern : null;
  const blocked = [pattern];

  if (previousPattern && previousPattern !== pattern) {
    blocked.push(previousPattern);
  }

  return blocked.slice(0, 3);
}

export function buildDefaultEditorialPlan(totalSlides: number): DesignPlan {
  const roles = getEditorialRoleSequence(totalSlides);
  const slides = roles.map((role, index) => {
    const slideNumber = index + 1;
    const meta = buildEditorialMeta(role, undefined, slideNumber, totalSlides);

    return {
      slide_number: slideNumber,
      role: meta.role,
      visual_tone: meta.visualTone,
      layout_pattern: meta.pattern,
      narrative_phase: meta.narrativePhase,
      module_weight: meta.moduleWeight,
      text_density: meta.textDensity,
      emotional_temperature: getNarrativeTemperature(meta.narrativePhase),
      question_angle: getQuestionAngle(meta.role),
      question_tone: getQuestionTone(meta.role),
      module_goal: getModuleGoal(meta.role, meta.pattern),
      module_candidates: getPlanCandidates(meta.role, meta.pattern),
      forbidden_patterns: [],
      text_budget: getTextBudget(meta.pattern),
    };
  });

  const normalizedSlides = slides.map((slide, index) => ({
    ...slide,
    forbidden_patterns: getForbiddenPatterns(index, slide.layout_pattern, slides),
  }));

  return {
    theme_name: editorialThemeName,
    guardrails: [
      "같은 layout_pattern을 연속 사용하지 않는다.",
      "같은 감정 온도를 3장 연속 반복하지 않는다.",
      "중간 슬라이드는 Q 배지와 페이지 카운터를 유지한다.",
      "약한 숫자는 spotlight 대신 checklist 또는 code-window로 처리한다.",
    ],
    story_arc: "공감 -> 정의 -> 전환 -> 예시/비교 -> 정리 -> 마무리",
    slides: normalizedSlides,
  };
}

export function normalizeSlideForEditorial(
  slide: Pick<
    Slide,
    | "slide_number"
    | "role"
    | "layout_pattern"
    | "module"
    | "visual_tone"
    | "narrative_phase"
    | "module_weight"
    | "text_density"
    | "question_badge"
  >,
  totalSlides: number,
) {
  const meta = buildEditorialMeta(slide.role, slide.layout_pattern, slide.slide_number, totalSlides);

  return {
    ...slide,
    role: meta.role,
    layout_pattern: meta.pattern,
    visual_tone: meta.visualTone,
    narrative_phase: slide.narrative_phase ?? meta.narrativePhase,
    module_weight: slide.module_weight ?? meta.moduleWeight,
    text_density: slide.text_density ?? meta.textDensity,
    question_badge: slide.question_badge?.trim() || meta.questionBadge,
    module: {
      ...slide.module,
      type: getExpectedModuleTypeForPattern(meta.pattern) ?? slide.module.type,
    },
  };
}

export function resolveEditorialSlide(slide: Slide, totalSlides: number): Slide {
  const normalized = normalizeSlideForEditorial(slide, totalSlides);

  return {
    ...slide,
    ...normalized,
    module: normalized.module,
  };
}

export function isMiddleEditorialPattern(pattern: LayoutPattern) {
  return pattern !== "cover-hero" && pattern !== "closing-statement";
}
