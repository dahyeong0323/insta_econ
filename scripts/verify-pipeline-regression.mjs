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
  buildFallbackProject,
  buildFallbackSourceBundle,
} = jiti(path.join(root, "src/lib/agents/fallback.ts"));
const {
  copyDeckSchema,
  designDeckSchema,
  assembleCarouselProject,
  runDeterministicQaValidator,
  runQaReviewer,
} = jiti(path.join(root, "src/lib/agents/pipeline.ts"));
const { renderStandaloneSlideHtml } = jiti(path.join(root, "src/lib/agents/render.ts"));
const { buildDefaultEditorialPlan } = jiti(path.join(root, "src/lib/design/editorial-core.ts"));
const {
  carouselProjectSchema,
  designPlanSchema,
  stageResponsibilityMap,
  stageValues,
  sourceBundleSchema,
} = jiti(path.join(root, "src/lib/agents/schema.ts"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripStandaloneHtml(slide) {
  const rawSlide = { ...slide };
  delete rawSlide.standalone_html;
  return rawSlide;
}

function hasIssue(report, snippet) {
  return report.issues.some((issue) => issue.message.includes(snippet));
}

function verifyStageResponsibilityMap() {
  assert(
    Object.keys(stageResponsibilityMap).length === stageValues.length,
    "stage responsibility regression: every stage must have exactly one responsibility mapping.",
  );

  for (const stage of stageValues) {
    const spec = stageResponsibilityMap[stage];
    assert(spec, `stage responsibility regression: missing mapping for ${stage}.`);
    assert(
      spec.forbiddenResponsibilities.length > 0,
      `stage responsibility regression: ${stage} must define forbidden responsibilities.`,
    );
  }

  assert(
    stageResponsibilityMap["source-parser"].originalAgent === "researcher",
    "stage responsibility regression: source-parser must map to researcher.",
  );
  assert(
    stageResponsibilityMap["content-planner"].originalAgent === "researcher",
    "stage responsibility regression: content-planner must map to researcher.",
  );
  assert(
    stageResponsibilityMap["qa-validator"].originalAgent === "qa-reviewer",
    "stage responsibility regression: qa-validator must map to qa-reviewer.",
  );
  assert(
    stageResponsibilityMap["qa-reviewer"].originalAgent === "qa-reviewer",
    "stage responsibility regression: qa-reviewer must map to qa-reviewer.",
  );
  assert(
    stageResponsibilityMap["qa-repair"].originalAgent === "developer",
    "stage responsibility regression: qa-repair must map to developer.",
  );
}

function createFixtureArtifacts(slideCount = 8) {
  const sourceText = [
    "물가는 여러 상품과 서비스의 평균 가격 수준을 뜻합니다.",
    "같은 돈으로 살 수 있는 것이 줄어들면 구매력이 떨어집니다.",
    "학생은 간식값이나 교통비 같은 생활비에서 물가 변화를 먼저 체감합니다.",
    "자주 사는 품목이 오르면 숫자보다 더 크게 느껴질 수 있습니다.",
    "그래서 물가는 생활 속 변화와 연결해서 봐야 이해가 쉬워집니다.",
    "숫자 하나보다 실제 소비 변화와 함께 보면 개념이 더 또렷해집니다.",
    "물가와 임금 변화 속도가 다르면 실제 구매력도 달라집니다.",
    "중학생에게는 생활 예시를 붙여 설명할수록 개념이 오래 남습니다.",
  ].join(" ");

  const bundle = sourceBundleSchema.parse(
    buildFallbackSourceBundle(sourceText, sourceText, `pipeline regression ${slideCount}`),
  );
  const plan = designPlanSchema.parse(buildDefaultEditorialPlan(slideCount));
  const fallbackProject = carouselProjectSchema.parse(buildFallbackProject(bundle, plan));

  const copyDeck = copyDeckSchema.parse({
    brand_label: fallbackProject.brand_label,
    project_title: fallbackProject.project_title,
    caption: fallbackProject.caption,
    slides: fallbackProject.slides.map((slide) => ({
      slide_number: slide.slide_number,
      role: slide.role,
      headline: slide.headline,
      body: slide.body,
      emphasis: slide.emphasis,
      save_point: slide.save_point,
      source_excerpt: slide.source_excerpt,
    })),
  });

  const designDeck = designDeckSchema.parse({
    theme_name: fallbackProject.theme_name,
    slides: fallbackProject.slides.map((slide) => ({
      slide_number: slide.slide_number,
      question_badge: slide.question_badge,
      module: slide.module,
    })),
  });

  return {
    bundle,
    plan,
    copyDeck,
    designDeck,
  };
}

function createLongBody(length = 250) {
  return "생활 예시를 붙여 개념을 천천히 풀어 설명합니다. ".repeat(20).slice(0, length);
}

function main() {
  verifyStageResponsibilityMap();
  const artifacts = createFixtureArtifacts(8);
  const before = {
    bundle: stableStringify(artifacts.bundle),
    plan: stableStringify(artifacts.plan),
    copyDeck: stableStringify(artifacts.copyDeck),
    designDeck: stableStringify(artifacts.designDeck),
  };

  const cleanProject = carouselProjectSchema.parse(
    assembleCarouselProject(
      artifacts.bundle,
      artifacts.plan,
      artifacts.copyDeck,
      artifacts.designDeck,
    ),
  );

  assert(stableStringify(artifacts.bundle) === before.bundle, "artifact regression: source bundle mutated during assembly.");
  assert(stableStringify(artifacts.plan) === before.plan, "artifact regression: design plan mutated during assembly.");
  assert(stableStringify(artifacts.copyDeck) === before.copyDeck, "artifact regression: copy deck mutated during assembly.");
  assert(stableStringify(artifacts.designDeck) === before.designDeck, "artifact regression: design deck mutated during assembly.");

  const combinedProject = deepClone(cleanProject);
  const totalSlides = combinedProject.slides.length;
  const projectTitle = combinedProject.project_title;

  combinedProject.slides[2].body = createLongBody();
  combinedProject.slides[2].standalone_html = renderStandaloneSlideHtml(
    stripStandaloneHtml(combinedProject.slides[2]),
    totalSlides,
    projectTitle,
  );

  combinedProject.slides[3].standalone_html = combinedProject.slides[3].standalone_html.replace(
    "var(--paper-border)",
    "#123456",
  );

  const beforeValidatorProject = stableStringify(combinedProject);
  const validatorReport = runDeterministicQaValidator(combinedProject, artifacts.bundle, artifacts.plan);

  assert(
    hasIssue(validatorReport, "direct color literals found outside design tokens"),
    "validator regression: stylesheet token drift should be reported.",
  );
  assert(
    !hasIssue(validatorReport, "body copy is too long for mobile reading"),
    "validator regression: reviewer-only body length issue leaked into validator.",
  );
  assert(
    validatorReport.issues.every((issue) => issue.stage === "qa-validator"),
    "validator regression: validator report should contain only qa-validator issues.",
  );
  assert(
    stableStringify(combinedProject) === beforeValidatorProject,
    "validator regression: validator mutated the project.",
  );

  const beforeReviewerProject = stableStringify(combinedProject);
  const reviewerReport = runQaReviewer(
    combinedProject,
    artifacts.bundle,
    artifacts.plan,
    validatorReport,
  );

  assert(
    hasIssue(reviewerReport, "direct color literals found outside design tokens"),
    "reviewer regression: reviewer report should preserve validator issues.",
  );
  assert(
    hasIssue(reviewerReport, "body copy is too long for mobile reading"),
    "reviewer regression: reviewer should add readability issues on top of validator output.",
  );
  assert(
    reviewerReport.issues.some((issue) => issue.stage === "qa-validator"),
    "reviewer regression: combined QA report should still include validator issues.",
  );
  assert(
    reviewerReport.issues.some((issue) => issue.stage === "qa-reviewer"),
    "reviewer regression: combined QA report should include reviewer-owned issues.",
  );
  assert(
    stableStringify(combinedProject) === beforeReviewerProject,
    "reviewer regression: reviewer mutated the project.",
  );

  console.log("pipeline regression fixture passed: artifacts, validator/reviewer split, token-only renderer");
}

main();
