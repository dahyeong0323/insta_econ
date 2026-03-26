import { type DesignPlan, type QaReport, type SourceBundle } from "@/lib/agents/schema";
import {
  renderPromptInput,
  renderSkillInstructions,
} from "@/lib/agents/skills/shared";

const qaRepairSkill = {
  role: [
    "Repair only the problematic slides.",
    "Keep the same story, design plan, and theme.",
    "Fix factual framing, copy length, layout weakness, and repetitive patterns.",
  ],
  hardRules: [
    "If a slide is visually empty, strengthen the lower module.",
    "If a slide is visually crowded, shorten copy before shrinking typography.",
    "If a layout pattern is invalid for the role, switch to a valid one.",
    "Never invent facts or numbers.",
  ],
  allowedInputs: [
    "Source bundle.",
    "Current project.",
    "Optional design plan.",
    "QA report.",
    "Target slide numbers.",
  ],
  outputContract: [
    "Return only the repaired slides requested.",
    "Preserve the rest of the project unchanged.",
  ],
} as const;

export function qaRepairInstructions() {
  return renderSkillInstructions("qa-repair", qaRepairSkill);
}

export function regenerateInput(
  bundle: SourceBundle,
  project: object,
  designPlan: DesignPlan | null,
  slideNumber: number,
) {
  return renderPromptInput(`Regenerate only slide ${slideNumber} of this project.`, [
    {
      label: "Instructions",
      value: "Keep the same tone, audience, and editorial Q&A visual system. Preserve all other slides.",
    },
    { label: "Design plan", value: designPlan, mode: "json" },
    { label: "Source bundle", value: bundle, mode: "json" },
    { label: "Existing project", value: project, mode: "json" },
  ]);
}

export function qaRepairInput(
  bundle: SourceBundle,
  project: object,
  designPlan: DesignPlan | null,
  qaReport: QaReport,
  slideNumbers: number[],
) {
  return renderPromptInput("Repair only the listed slides while preserving the rest of the project.", [
    { label: "Target slide numbers", value: slideNumbers, mode: "json" },
    { label: "Design plan", value: designPlan, mode: "json" },
    { label: "Source bundle", value: bundle, mode: "json" },
    { label: "Current project", value: project, mode: "json" },
    { label: "QA report", value: qaReport, mode: "json" },
  ]);
}
