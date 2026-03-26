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
const {
  carouselProjectSchema,
  designPlanSchema,
  sourceBundleSchema,
} = jiti(path.join(root, "src/lib/agents/schema.ts"));
const { runQa } = jiti(path.join(root, "src/lib/agents/pipeline.ts"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createFixture() {
  const sourceText = [
    "물가는 여러 상품과 서비스의 평균 가격 수준입니다.",
    "같은 돈으로 살 수 있는 것이 줄면 구매력이 낮아집니다.",
    "학생은 간식값, 교통비, 준비물 가격에서 물가 변화를 먼저 느낍니다.",
    "한두 상품 가격만 보지 말고 전체 평균과 생활비 변화를 같이 봐야 합니다.",
    "생활 예시를 붙여 설명할수록 개념이 더 오래 남습니다.",
    "물가와 임금의 속도가 다르면 실제 구매력은 달라질 수 있습니다.",
    "그래서 물가는 생활 속 변화와 연결해서 이해해야 합니다.",
  ].join(" ");

  const bundle = sourceBundleSchema.parse(
    buildFallbackSourceBundle(sourceText, sourceText, "drift fixture"),
  );
  const plan = designPlanSchema.parse(buildFallbackDesignPlan(bundle));
  const project = carouselProjectSchema.parse(buildFallbackProject(bundle, plan));

  return { bundle, plan, project };
}

function hasIssue(report, snippet) {
  return report.issues.some((issue) => issue.message.includes(snippet));
}

function main() {
  const { bundle, plan, project } = createFixture();

  const baseline = runQa(project, bundle, plan);
  assert(
    !hasIssue(baseline, "drifted away from the design plan"),
    "baseline fixture should not report planner metadata drift.",
  );
  assert(
    !hasIssue(baseline, "standalone renderer drifted from the slide data"),
    "baseline fixture should not report renderer drift.",
  );

  const metadataDriftProject = carouselProjectSchema.parse({
    ...project,
    slides: project.slides.map((slide) =>
      slide.slide_number === 2
        ? {
            ...slide,
            text_density: slide.text_density === "balanced" ? "dense" : "balanced",
          }
        : slide,
    ),
  });

  const metadataReport = runQa(metadataDriftProject, bundle, plan);
  assert(
    hasIssue(metadataReport, "text_density drifted away from the design plan"),
    "metadata drift fixture should report text_density drift.",
  );

  const rendererDriftProject = carouselProjectSchema.parse({
    ...project,
    slides: project.slides.map((slide) =>
      slide.slide_number === 3
        ? {
            ...slide,
            standalone_html: "<html><body>drifted</body></html>",
          }
        : slide,
    ),
  });

  const rendererReport = runQa(rendererDriftProject, bundle, plan);
  assert(
    hasIssue(rendererReport, "standalone renderer drifted from the slide data"),
    "renderer drift fixture should report standalone renderer drift.",
  );

  const stylesheetLiteralProject = carouselProjectSchema.parse({
    ...project,
    slides: project.slides.map((slide) =>
      slide.slide_number === 4
        ? {
            ...slide,
            standalone_html: slide.standalone_html.replace("var(--paper-border)", "#123456"),
          }
        : slide,
    ),
  });

  const stylesheetLiteralReport = runQa(stylesheetLiteralProject, bundle, plan);
  assert(
    hasIssue(stylesheetLiteralReport, "direct color literals found outside design tokens"),
    "stylesheet literal fixture should report direct color literals outside design tokens.",
  );

  console.log("planner and renderer drift fixtures passed");
}

main();
