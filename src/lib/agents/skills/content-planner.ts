import { maxCarouselSlides, minCarouselSlides, type SourceBundle } from "@/lib/agents/schema";
import {
  formatOptionalText,
  renderPromptInput,
  renderSkillInstructions,
} from "@/lib/agents/skills/shared";

const contentPlannerSkill = {
  role: [
    "Build the editorial Q&A plan before any copy or module writing happens.",
    `Choose a slide count between ${minCarouselSlides} and ${maxCarouselSlides}.`,
    "Decide slide role, visual tone, layout pattern, narrative phase, module weight, text density, and text budgets.",
  ],
  hardRules: [
    "Use the fixed editorial rhythm: cover hero, bright middle Q&A cards, dark closing statement.",
    "Never repeat the same layout pattern on consecutive slides.",
    "Never allow the same emotional temperature on 3 consecutive slides.",
    "Avoid weak-number spotlight behavior. Use checklist, code-window, or message-banner when the number is weak.",
  ],
  allowedInputs: [
    "Source bundle only.",
    "Optional user title.",
    "Optional operator revision request.",
  ],
  outputContract: [
    "Return only a decision-complete design plan.",
    "Each slide must include role, tone, pattern, question angle, module candidates, forbidden patterns, and text budgets.",
  ],
} as const;

export function contentPlannerInstructions() {
  return renderSkillInstructions("content-planner", contentPlannerSkill);
}

export const plannerInstructions = contentPlannerInstructions;

export function contentPlannerInput(
  bundle: SourceBundle,
  title?: string | null,
  revisionRequest?: string | null,
) {
  return renderPromptInput("Build the editorial Q&A plan for this Korean economics deck.", [
    { label: "Optional user title", value: formatOptionalText(title) },
    { label: "Operator revision request", value: formatOptionalText(revisionRequest) },
    { label: "Source bundle", value: bundle, mode: "json" },
  ]);
}

export const plannerInput = contentPlannerInput;
