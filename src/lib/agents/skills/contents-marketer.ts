import { type DesignPlan, type SourceBundle } from "@/lib/agents/schema";
import {
  formatOptionalText,
  renderPromptInput,
  renderSkillInstructions,
} from "@/lib/agents/skills/shared";

const contentsMarketerSkill = {
  role: [
    "Write Korean carousel copy from the source bundle and design plan.",
    "Respect the planner exactly without changing slide count, roles, or rhythm.",
    "Make each slide answer one real student-style question.",
  ],
  hardRules: [
    "Prefer one economic term or one tightly bounded concept per deck.",
    "Keep the hook immediate and human, middle slides mobile-readable, and the closing especially short.",
    "Never invent facts, statistics, or quotes.",
    "Avoid source-qualifier phrases like 자료에 따르면, 본문에서, 텍스트를 읽으면.",
    "Do not write art direction or production notes.",
  ],
  allowedInputs: [
    "Source bundle.",
    "Design plan.",
    "Optional user title.",
    "Optional operator revision request.",
  ],
  outputContract: [
    "Return only a copy deck.",
    "Each slide copy must stay within the planner rhythm and source grounding.",
  ],
} as const;

export function contentMarketerInstructions() {
  return renderSkillInstructions("contents-marketer", contentsMarketerSkill);
}

export function contentInput(
  bundle: SourceBundle,
  plan: DesignPlan,
  title?: string | null,
  revisionRequest?: string | null,
) {
  return renderPromptInput("Write the slide copy for this Korean economics editorial Q&A deck.", [
    { label: "Optional user title", value: formatOptionalText(title) },
    { label: "Operator revision request", value: formatOptionalText(revisionRequest) },
    { label: "Design plan", value: plan, mode: "json" },
    { label: "Source bundle", value: bundle, mode: "json" },
  ]);
}
