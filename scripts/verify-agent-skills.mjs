import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createJiti } from "jiti";

const root = process.cwd();
const snapshotPath = path.join(root, "scripts", "fixtures", "agent-skills.snapshot.json");
const shouldUpdate = process.argv.includes("--update");

const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  interopDefault: true,
  alias: {
    "@": path.join(root, "src"),
  },
});

const { getAudienceInstructions } = jiti(path.join(root, "src/lib/agents/skills/shared.ts"));
const { sourceParserInstructions } = jiti(
  path.join(root, "src/lib/agents/skills/source-parser.ts"),
);
const {
  contentPlannerInput,
  contentPlannerInstructions,
} = jiti(path.join(root, "src/lib/agents/skills/content-planner.ts"));
const { contentInput, contentMarketerInstructions } = jiti(
  path.join(root, "src/lib/agents/skills/contents-marketer.ts"),
);
const { designerInput, designerInstructions } = jiti(
  path.join(root, "src/lib/agents/skills/designer.ts"),
);
const { qaRepairInput, qaRepairInstructions, regenerateInput } = jiti(
  path.join(root, "src/lib/agents/skills/qa-repair.ts"),
);
const { buildDefaultEditorialPlan } = jiti(path.join(root, "src/lib/design/editorial-core.ts"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSnapshot() {
  const sourceBundle = {
    raw_text: "물가가 오르면 왜 체감이 다를까?",
    extracted_text: "물가가 오르면 같은 돈으로 살 수 있는 것이 줄어듭니다.",
    source_title: "물가와 체감 생활비",
    source_summary: "물가 상승은 숫자보다 생활비 체감으로 더 크게 느껴질 수 있습니다.",
    key_terms: ["물가", "구매력", "생활비"],
    facts: [
      {
        fact: "같은 돈으로 살 수 있는 양이 줄어들면 구매력이 떨어집니다.",
        source_excerpt: "같은 돈으로 살 수 있는 양이 줄어들면 구매력이 떨어집니다.",
      },
      {
        fact: "자주 사는 물건 가격이 오르면 체감 부담은 더 크게 느껴질 수 있습니다.",
        source_excerpt:
          "자주 사는 물건 가격이 오르면 체감 부담은 더 크게 느껴질 수 있습니다.",
      },
    ],
    numbers: ["5%"],
    quote_candidates: ["숫자보다 생활비 체감이 더 크게 느껴질 수 있습니다."],
    simplification_notes: ["어려운 용어는 바로 풀어서 설명합니다.", "생활 예시와 함께 설명합니다."],
  };

  const designPlan = buildDefaultEditorialPlan(6);
  const copyDeck = {
    brand_label: "보리의 10대를 위한 경제",
    project_title: "물가와 체감 생활비",
    caption: "물가를 숫자와 생활비 체감으로 함께 이해하는 카드뉴스입니다.",
    slides: designPlan.slides.map((slide) => ({
      slide_number: slide.slide_number,
      role: slide.role,
      headline: `Slide ${slide.slide_number} headline`,
      body: `Slide ${slide.slide_number} body copy`,
      emphasis: slide.slide_number === 1 ? "핵심 먼저" : null,
      save_point: slide.slide_number === 6 ? "숫자보다 체감" : null,
      source_excerpt: sourceBundle.facts[slide.slide_number % sourceBundle.facts.length].source_excerpt,
    })),
  };
  const project = {
    brand_label: copyDeck.brand_label,
    project_title: copyDeck.project_title,
    audience: "middle_school",
    language: "ko",
    theme_name: "editorial-qna",
    caption: copyDeck.caption,
    slides: designPlan.slides.map((slide) => ({
      slide_number: slide.slide_number,
      role: slide.role,
      visual_tone: slide.visual_tone,
      layout_pattern: slide.layout_pattern,
      narrative_phase: slide.narrative_phase,
      module_weight: slide.module_weight,
      text_density: slide.text_density,
      question_badge: slide.slide_number === 1 ? "Hello" : "Q",
      headline: `Slide ${slide.slide_number} headline`,
      body: `Slide ${slide.slide_number} body copy`,
      emphasis: slide.slide_number === 1 ? "핵심 먼저" : null,
      save_point: slide.slide_number === 6 ? "숫자보다 체감" : null,
      source_excerpt: sourceBundle.facts[slide.slide_number % sourceBundle.facts.length].source_excerpt,
      module: {
        type: slide.module_candidates[0],
        title: `Module ${slide.slide_number}`,
        subtitle: null,
        items: [
          {
            label: "핵심",
            title: `포인트 ${slide.slide_number}`,
            value: `값 ${slide.slide_number}`,
            note: null,
            accent: "orange",
          },
        ],
        footer: null,
      },
    })),
  };
  const qaReport = {
    high_count: 1,
    medium_count: 1,
    low_count: 0,
    checks_passed: ["shape ok", "copy ok", "tokens ok"],
    issues: [
      {
        severity: "high",
        stage: "qa-reviewer",
        message: "Slide 2: layout drifted away from the design plan.",
      },
      {
        severity: "medium",
        stage: "qa-reviewer",
        message: "Slide 4: body copy is too long for mobile reading.",
      },
    ],
  };

  return {
    audience: getAudienceInstructions("middle_school"),
    skills: {
      source_parser: sourceParserInstructions(),
      content_planner: contentPlannerInstructions(),
      contents_marketer: contentMarketerInstructions(),
      designer: designerInstructions(),
      qa_repair: qaRepairInstructions(),
    },
    prompts: {
      content_planner_input: contentPlannerInput(sourceBundle, "물가", "더 짧고 선명하게"),
      content_input: contentInput(sourceBundle, designPlan, "물가", "3장을 더 쉽게"),
      designer_input: designerInput(sourceBundle, designPlan, copyDeck, "하단 모듈을 더 크게"),
      regenerate_input: regenerateInput(sourceBundle, project, designPlan, 2),
      qa_repair_input: qaRepairInput(sourceBundle, project, designPlan, qaReport, [2, 4]),
    },
  };
}

function verifyInstructionSections(snapshot) {
  for (const [skillName, instructions] of Object.entries(snapshot.skills)) {
    assert(
      instructions.includes("Role:\n- "),
      `${skillName} instructions are missing the Role section`,
    );
    assert(
      instructions.includes("Hard rules:\n- "),
      `${skillName} instructions are missing the Hard rules section`,
    );
    assert(
      instructions.includes("Original PDF alignment:\n- Original PDF owner: "),
      `${skillName} instructions are missing the Original PDF alignment section`,
    );
    assert(
      instructions.includes("Forbidden responsibilities:\n- "),
      `${skillName} instructions are missing the Forbidden responsibilities section`,
    );
    assert(
      instructions.includes("Allowed inputs:\n- "),
      `${skillName} instructions are missing the Allowed inputs section`,
    );
    assert(
      instructions.includes("Output contract:\n- "),
      `${skillName} instructions are missing the Output contract section`,
    );
  }
}

async function main() {
  const snapshot = buildSnapshot();
  verifyInstructionSections(snapshot);
  const rendered = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (shouldUpdate) {
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, rendered, "utf8");
    console.log(`agent skill snapshot updated: ${path.relative(root, snapshotPath)}`);
    return;
  }

  const existing = await readFile(snapshotPath, "utf8").catch(() => null);
  if (!existing) {
    throw new Error(
      `agent skill snapshot is missing. Run \`npm run verify:agent-skills -- --update\` first.`,
    );
  }

  assert(
    existing === rendered,
    "agent skill snapshot drift detected. Run `npm run verify:agent-skills -- --update` if intentional.",
  );

  console.log("agent skill snapshot passed");
}

await main();
