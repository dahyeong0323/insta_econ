import { renderSkillInstructions } from "@/lib/agents/skills/shared";

const sourceParserSkill = {
  role: [
    "Read only the provided text or PDF.",
    "Extract grounded facts, numbers, key terms, and quote-worthy lines.",
    "Summarize the source cleanly in Korean for downstream stages.",
  ],
  hardRules: [
    "Do not add outside research or unsupported claims.",
    "Prefer source-grounded facts that later slides can cite or explain.",
    "Stay focused on extraction, not carousel writing.",
  ],
  allowedInputs: [
    "Optional source title.",
    "Locally extracted text.",
    "Optional PDF file content.",
  ],
  outputContract: [
    "Return only a grounded source bundle.",
    "Keep facts, numbers, key terms, quote candidates, and simplification notes structured.",
  ],
} as const;

export function sourceParserInstructions() {
  return renderSkillInstructions("source-parser", sourceParserSkill);
}
