import { type DesignPlan, type SourceBundle } from "@/lib/agents/schema";
import {
  formatOptionalText,
  renderPromptInput,
  renderSkillInstructions,
} from "@/lib/agents/skills/shared";

const designerSkill = {
  role: [
    "Assign question badges, visual tones, and bottom modules that fit the design plan.",
    "Stay inside the planner layout_pattern and module_candidates for each slide.",
    "Keep the deck close to the editorial Q&A Instagram system.",
  ],
  hardRules: [
    "Middle slides need a clear question badge and page counter rhythm.",
    "The lower module must feel large and intentional, never like a tiny footer card.",
    "Timeline layouts must be balanced.",
    "Checklist tables need strong left-step hierarchy and a calm right column.",
    "Do not output reader-visible production notes.",
  ],
  allowedInputs: [
    "Source bundle.",
    "Design plan.",
    "Current copy deck.",
    "Optional operator revision request.",
  ],
  outputContract: [
    "Return only a design deck.",
    "Each slide must keep the planner rhythm while assigning badge and bottom module.",
  ],
} as const;

export function designerInstructions() {
  return renderSkillInstructions("designer", designerSkill);
}

export function designerInput(
  bundle: SourceBundle,
  plan: DesignPlan,
  draft: object,
  revisionRequest?: string | null,
) {
  return renderPromptInput("Assign the visual tone, question badge, and bottom module for each slide.", [
    { label: "Operator revision request", value: formatOptionalText(revisionRequest) },
    { label: "Design plan", value: plan, mode: "json" },
    { label: "Source bundle", value: bundle, mode: "json" },
    { label: "Current copy deck", value: draft, mode: "json" },
  ]);
}
