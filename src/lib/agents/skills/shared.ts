import {
  type Audience,
  stageResponsibilityMap,
  type StageName,
} from "@/lib/agents/schema";

type SkillSpec = {
  role: readonly string[];
  hardRules: readonly string[];
  allowedInputs: readonly string[];
  outputContract: readonly string[];
};

function renderAlignmentSection(agentName: StageName) {
  const spec = stageResponsibilityMap[agentName];
  const lines = [
    `- Original PDF owner: ${spec.originalAgent}`,
    `- Current stage purpose: ${spec.stagePurpose}`,
    ...("splitNote" in spec && spec.splitNote ? [`- Split note: ${spec.splitNote}`] : []),
  ];
  return `Original PDF alignment:\n${lines.join("\n")}`;
}

export function getAudienceInstructions(audience: Audience) {
  if (audience === "middle_school") {
    return [
      "Primary audience: Korean middle-school students learning economics.",
      "Use plain Korean without sounding childish or lecture-heavy.",
      "Explain the term first, then connect it to a familiar daily-life example.",
      "Keep each slide useful, short, and save-worthy on mobile.",
      "Do not visibly mention the audience inside the slide copy.",
    ].join("\n");
  }

  return "Primary audience: Korean middle-school students learning economics.";
}

export function renderSkillInstructions(agentName: StageName, spec: SkillSpec) {
  const renderSection = (title: string, items: readonly string[]) =>
    `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
  const responsibilitySpec = stageResponsibilityMap[agentName];

  return `You are the ${agentName} agent for ECON CAROUSEL.

${renderAlignmentSection(agentName)}

${renderSection("Role", spec.role)}

${renderSection("Hard rules", spec.hardRules)}

${renderSection("Forbidden responsibilities", responsibilitySpec.forbiddenResponsibilities)}

${renderSection("Allowed inputs", spec.allowedInputs)}

${renderSection("Output contract", spec.outputContract)}`;
}

export function renderPromptInput(
  title: string,
  sections: Array<{
    label: string;
    value: unknown;
    mode?: "text" | "json";
  }>,
) {
  const blocks = sections.map(({ label, value, mode = "text" }) => {
    const rendered =
      mode === "json"
        ? JSON.stringify(value, null, 2)
        : typeof value === "string"
          ? value
          : String(value);

    return `${label}:\n${rendered}`;
  });

  return [title, ...blocks].join("\n\n");
}

export function formatOptionalText(value: string | null | undefined) {
  return value?.trim() || "none";
}
