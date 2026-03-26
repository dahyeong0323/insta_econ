import { createJiti } from "jiti";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  interopDefault: true,
  alias: {
    "@": path.join(root, "src"),
  },
});

const {
  buildDefaultEditorialPlan,
  formatPageCounter,
  getExpectedModuleTypeForPattern,
  getSlideVariant,
  getEditorialRoleSequence,
  resolveEditorialSlide,
} = jiti(path.join(root, "src/lib/design/editorial-core.ts"));
const {
  buildFallbackProject,
  buildFallbackSourceBundle,
} = jiti(path.join(root, "src/lib/agents/fallback.ts"));
const { renderStandaloneSlideHtml } = jiti(path.join(root, "src/lib/agents/render.ts"));
const { runQa } = jiti(path.join(root, "src/lib/agents/pipeline.ts"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSourceText(repeat = 1) {
  const base = [
    "물가는 가게에서 파는 물건과 서비스의 평균적인 가격 수준입니다.",
    "같은 금액으로 살 수 있는 물건이 줄어들면 사람들은 물가가 올랐다고 느낍니다.",
    "사과 한 개 가격만 보면 전체 물가를 알기 어렵고 여러 품목을 함께 봐야 합니다.",
    "학생은 편의점 간식, 교통비, 준비물 가격에서 물가 변화를 가장 쉽게 체감합니다.",
    "중앙은행은 물가가 너무 빠르게 오르지 않도록 금리 같은 수단을 활용합니다.",
    "물가 상승률은 지난해와 비교해 평균 가격이 얼마나 달라졌는지 보여줍니다.",
    "같은 5퍼센트 상승이어도 자주 사는 품목이 오르면 체감은 더 크게 느껴집니다.",
    "가격이 조금 내려도 이미 오른 생활비 부담은 바로 사라지지 않을 수 있습니다.",
    "월급이나 용돈 증가 속도가 물가보다 느리면 실제 구매력은 줄어듭니다.",
    "그래서 물가를 볼 때는 숫자 하나보다 생활 속 변화와 함께 이해하는 것이 중요합니다.",
    "교통비가 100원 오르는 일과 간식값이 100원 오르는 일은 체감이 다를 수 있습니다.",
    "물가를 이해하면 뉴스 속 금리, 월급, 환율 이야기도 더 연결해서 볼 수 있습니다.",
  ];

  return Array.from({ length: repeat }, () => base).flat().join(" ");
}

function verifyPlan(plan, slideCount) {
  assert(plan.slides.length === slideCount, `plan slide count mismatch: expected ${slideCount}`);
  assert(plan.slides[0]?.role === "hook", "plan must start with hook");
  assert(plan.slides.at(-1)?.role === "closing", "plan must end with closing");

  const expectedRoles = getEditorialRoleSequence(slideCount);
  plan.slides.forEach((slide, index) => {
    assert(
      slide.role === expectedRoles[index],
      `role sequence drift at slide ${slide.slide_number}: expected ${expectedRoles[index]}, got ${slide.role}`,
    );

    if (index > 0) {
      assert(
        plan.slides[index - 1].layout_pattern !== slide.layout_pattern,
        `consecutive layout repetition at slide ${slide.slide_number}`,
      );
    }
  });
}

function verifyProject(project, plan) {
  const qaReport = runQa(project, buildFallbackSourceBundle(createSourceText(2), createSourceText(2), "물가"), plan);
  assert(qaReport.high_count === 0, `fixture QA high issues: ${qaReport.high_count}`);

  for (const slide of project.slides) {
    const resolved = resolveEditorialSlide(slide, project.slides.length);
    const html = renderStandaloneSlideHtml(slide, project.slides.length, project.project_title);
    const variant = getSlideVariant(resolved);
    const expectedModuleType = getExpectedModuleTypeForPattern(resolved.layout_pattern);

    assert(
      resolved.module.type === expectedModuleType,
      `module drift at slide ${slide.slide_number}: expected ${expectedModuleType}, got ${resolved.module.type}`,
    );

    assert(
      html === slide.standalone_html,
      `standalone html drift at slide ${slide.slide_number}`,
    );

    if (variant === "cover") {
      assert(html.includes('class="canvas cover"'), "cover html missing cover canvas");
      assert(html.includes(resolved.question_badge), "cover html missing question badge");
      continue;
    }

    if (variant === "closing") {
      assert(html.includes('class="canvas closing"'), "closing html missing closing canvas");
      assert(
        html.includes(formatPageCounter(slide.slide_number, project.slides.length)),
        `closing html missing page counter on slide ${slide.slide_number}`,
      );
      continue;
    }

    assert(html.includes('class="canvas middle"'), "middle html missing middle canvas");
    assert(
      html.includes(formatPageCounter(slide.slide_number, project.slides.length)),
      `middle html missing page counter on slide ${slide.slide_number}`,
    );
    assert(html.includes("overflow:hidden"), `middle html missing overflow hidden on slide ${slide.slide_number}`);
  }
}

function runFixture(slideCount, textRepeat) {
  const sourceText = createSourceText(textRepeat);
  const bundle = buildFallbackSourceBundle(sourceText, sourceText, `물가 fixture ${slideCount}`);
  const plan = buildDefaultEditorialPlan(slideCount);
  const project = buildFallbackProject(bundle, plan);

  verifyPlan(plan, slideCount);
  verifyProject(project, plan);
}

function main() {
  runFixture(6, 1);
  runFixture(8, 2);
  runFixture(10, 3);
  console.log("editorial core fixtures passed: 6, 8, 10 slides");
}

main();
