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
  qaRepairLoop,
  runDeterministicQaValidator,
  runQa,
  runQaReviewer,
} = jiti(path.join(root, "src/lib/agents/pipeline.ts"));
const { buildDefaultEditorialPlan } = jiti(path.join(root, "src/lib/design/editorial-core.ts"));
const {
  carouselProjectSchema,
  designPlanSchema,
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

function createFixtureArtifacts(slideCount = 8) {
  const sourceText = [
    "물가는 여러 상품과 서비스의 평균 가격 수준입니다.",
    "같은 용돈으로 살 수 있는 것이 줄어들면 구매력이 떨어진다고 볼 수 있습니다.",
    "학생은 간식값, 교통비, 준비물 가격에서 물가 변화를 먼저 체감합니다.",
    "같은 5퍼센트 상승이라도 자주 사는 품목이 오르면 체감 부담은 더 크게 느껴질 수 있습니다.",
    "중앙은행은 물가가 너무 빠르게 오르지 않도록 금리 같은 수단을 활용합니다.",
    "숫자 하나보다 생활 속 변화와 함께 보면 물가를 더 쉽게 이해할 수 있습니다.",
    "월급이나 용돈 증가 속도가 물가보다 느리면 실제 구매력은 줄어듭니다.",
    "그래서 뉴스에서 물가를 볼 때는 체감 생활비와 함께 이해하는 것이 중요합니다.",
  ].join(" ");

  const bundle = sourceBundleSchema.parse(
    buildFallbackSourceBundle(sourceText, sourceText, `stage isolation ${slideCount}`),
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
    fallbackProject,
  };
}

function verifyDeveloperIsolation(artifacts) {
  const before = {
    bundle: stableStringify(artifacts.bundle),
    plan: stableStringify(artifacts.plan),
    copyDeck: stableStringify(artifacts.copyDeck),
    designDeck: stableStringify(artifacts.designDeck),
  };

  const project = carouselProjectSchema.parse(
    assembleCarouselProject(
      artifacts.bundle,
      artifacts.plan,
      artifacts.copyDeck,
      artifacts.designDeck,
    ),
  );

  assert(
    stableStringify(project) === stableStringify(artifacts.fallbackProject),
    "developer stage drifted from the fixture project assembled from the same artifacts.",
  );
  assert(stableStringify(artifacts.bundle) === before.bundle, "developer mutated source bundle artifact.");
  assert(stableStringify(artifacts.plan) === before.plan, "developer mutated design plan artifact.");
  assert(stableStringify(artifacts.copyDeck) === before.copyDeck, "developer mutated copy deck artifact.");
  assert(
    stableStringify(artifacts.designDeck) === before.designDeck,
    "developer mutated design deck artifact.",
  );

  return project;
}

function verifyValidatorIsolation(project, artifacts) {
  const beforeProject = stableStringify(project);
  const beforeBundle = stableStringify(artifacts.bundle);
  const beforePlan = stableStringify(artifacts.plan);

  const qaValidatorReport = runDeterministicQaValidator(project, artifacts.bundle, artifacts.plan);

  assert(
    qaValidatorReport.high_count === 0,
    `validator fixture should not raise high issues: ${qaValidatorReport.high_count}`,
  );
  assert(stableStringify(project) === beforeProject, "validator mutated project artifact.");
  assert(stableStringify(artifacts.bundle) === beforeBundle, "validator mutated source bundle artifact.");
  assert(stableStringify(artifacts.plan) === beforePlan, "validator mutated design plan artifact.");

  return qaValidatorReport;
}

function verifyReviewerIsolation(project, artifacts, qaValidatorReport) {
  const beforeProject = stableStringify(project);
  const beforeBundle = stableStringify(artifacts.bundle);
  const beforePlan = stableStringify(artifacts.plan);

  const qaReport = runQaReviewer(project, artifacts.bundle, artifacts.plan, qaValidatorReport);

  assert(qaReport.high_count === 0, `reviewer fixture should not raise high issues: ${qaReport.high_count}`);
  assert(stableStringify(project) === beforeProject, "reviewer mutated project artifact.");
  assert(stableStringify(artifacts.bundle) === beforeBundle, "reviewer mutated source bundle artifact.");
  assert(stableStringify(artifacts.plan) === beforePlan, "reviewer mutated design plan artifact.");

  return qaReport;
}

async function verifyRepairIsolation(project, artifacts) {
  const brokenProject = deepClone(project);
  const beforeBundle = stableStringify(artifacts.bundle);
  const beforePlan = stableStringify(artifacts.plan);

  brokenProject.slides[1].layout_pattern = "qa-message-banner";
  brokenProject.slides[1].module.type = "message-banner";
  brokenProject.slides[1].module_weight = "light";
  const originalBroken = stableStringify(brokenProject);

  const brokenQa = runQa(brokenProject, artifacts.bundle, artifacts.plan);
  assert(brokenQa.high_count > 0, "repair fixture must start with actionable high issues.");

  const repairLoop = await qaRepairLoop(
    artifacts.bundle,
    brokenProject,
    artifacts.plan,
    brokenQa,
    1,
  );

  assert(repairLoop.attempts.length === 1, "repair loop should run exactly one attempt in the fixture.");
  assert(repairLoop.attempts[0].repaired, "repair loop should mark the fixture attempt as repaired.");
  assert(
    repairLoop.qaReport.high_count === 0,
    `repair loop should resolve high issues in the fixture, got ${repairLoop.qaReport.high_count}.`,
  );
  assert(
    stableStringify(brokenProject) === originalBroken,
    "repair loop mutated the incoming project artifact instead of returning a new one.",
  );
  assert(stableStringify(artifacts.bundle) === beforeBundle, "repair loop mutated source bundle artifact.");
  assert(stableStringify(artifacts.plan) === beforePlan, "repair loop mutated design plan artifact.");
}

async function main() {
  const artifacts = createFixtureArtifacts(8);
  const project = verifyDeveloperIsolation(artifacts);
  const qaValidatorReport = verifyValidatorIsolation(project, artifacts);
  verifyReviewerIsolation(project, artifacts, qaValidatorReport);
  await verifyRepairIsolation(project, artifacts);
  console.log("stage isolation fixtures passed: developer, validator, reviewer, repair");
}

await main();
