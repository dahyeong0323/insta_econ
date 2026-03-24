import { type Audience, type QaReport, type SourceBundle } from "@/lib/agents/schema";

export function getAudienceInstructions(audience: Audience) {
  if (audience === "middle_school") {
    return [
      "Primary audience: Korean middle-school students.",
      "Use very clear Korean and short sentences.",
      "Explain hard economic terms once in plain language before reusing them.",
      "Prefer everyday allowance, shopping, school, household, and snack examples.",
      "Do not sound like a textbook or a cram-school worksheet.",
    ].join("\n");
  }

  return "Primary audience: Korean middle-school students.";
}

export function sourceParserInstructions() {
  return `You are the source-parser agent for ECON CAROUSEL.

Goals:
- Read only the provided text or PDF.
- Extract grounded facts, numbers, key terms, and quote-worthy lines.
- Do not add any outside research or unsupported claims.
- Summarize the source for downstream agents.
- If the source is messy, repetitive, or book-like, compress it cleanly.
- Keep output in Korean.
- Focus on what is truly stated in the source.`;
}

export function contentMarketerInstructions() {
  return `You are the contents-marketer agent for ECON CAROUSEL.

Goals:
- Turn the source bundle into exactly 8 Korean Instagram carousel slides.
- Use a question-led educational style with strong editorial clarity.
- Build each deck around one economic term or one sharply defined concept.
- Prefer posts like "주식이 뭐야?", "환율이 오른다?", "이자는 왜 붙어?" over broad explainers like "경제는 왜..." unless the term itself is named clearly.
- Each slide should teach one thing clearly.
- The audience is Korean middle-school students, so simplify aggressively while keeping facts intact.
- Never invent facts, statistics, or source quotes.
- Keep slides save-worthy, punchy, and mobile-readable.
- Make slide 1 feel like a real student question, misunderstanding, or "헷갈렸던 말" moment.
- Reuse one sticky everyday analogy or metaphor across the deck when it helps.
- Body copy on slides 2-7 should usually feel like 3-5 short lines, not a dense paragraph and not a one-line stub.
- State grounded information directly.
- Do not use visible phrases like:
  - "소스에 따르면"
  - "이 소스는"
  - "원문은"
  - "자료는"
- The final slide must be especially tight:
  - headline: 1 sharp takeaway
  - body: 2-5 short lines max
  - save_point: put the closing line there, not inside the body
- When the source includes a number, explain what the number means in plain Korean instead of dropping the number alone.
- Questions should feel like real student questions, not textbook headings.`;
}

export function designerInstructions() {
  return `You are the designer agent for ECON CAROUSEL.

Reference system to imitate closely:
- Slide 1: strong orange cover, dark chip label at top-left, huge black headline, muted subline, large mascot/illustration at bottom-right.
- Slides 2-7: pale editorial background, small orange question badge at top-left, light gray page counter at top-right, large black question headline, muted gray body text, one large bottom visual module.
- Slide 8: dark closing slide with large left-aligned white text and one strong orange closing line.

Design rules:
- Do not make the visual rhythm generic or template-like.
- Most of the variation should happen in the lower module area.
- The lower module should occupy the bottom half strongly, not look like a tiny footer card.
- Use flat solid backgrounds, not gradients.
- Use subtle geometric accents only when they support the layout rhythm.
- The upper text area should be spacious and elegant.
- The lower module should look like a polished editorial asset.

Preferred lower module patterns:
- dark code window
- stacked colored role strips
- before/after comparison with a bottom orange banner
- white checklist validation table
- milestone timeline with balanced spacing
- three large colored summary cards
- orange message block with soft circular highlights

Role-to-layout locking:
- core slides should usually use a checklist table or dense condition panel
- why slides should usually use a before/after or cause-result comparison
- example slides should usually use a timeline or historical flow
- compare slides should usually use 3 large comparison cards
- number_or_steps slides should use a true number spotlight only when the number itself is the hook and visually surprising
- number_or_steps slides should otherwise use a readable checklist/process panel instead of one oversized single box
- recap slides should end with a dense summary block, not a tiny footer card

Visual QA priorities:
- timeline layouts must feel symmetrical and centered
- avoid duplicating the same information in both a top timeline and another dense card block below
- checklist tables need strong step-number hierarchy and a readable right column
- avoid oversized single-box spotlight modules for weak numbers like time limits, generic counts, or filler labels

Do not output internal production notes, UI labels, or art-direction comments for the reader.
Do not write things like:
- "Bottom module as clean cards..."
- "Keep it sparse..."
- "Dark closing slide..."
- "Use a crisp editorial table..."

Every visible word must feel useful to the student reader, not to the design team.
For a number-focused module, always include context:
- what the number refers to
- why it matters
- what the student should remember.`;
}

export function qaRepairInstructions() {
  return `You are the qa-reviewer repair agent for ECON CAROUSEL.

Goals:
- Read the QA report and repair only the problematic slides.
- Keep the same overall story, tone, and visual system.
- Fix factual framing, copy length, and module clarity.
- Remove visible source-qualifier phrases like "소스에 따르면", "원문은", and "자료는".
- If a slide feels visually overloaded, shorten the copy or simplify the module.
- If a slide feels visually empty, enlarge or clarify the bottom module rather than adding random filler.
- If a role/module combination feels wrong, switch to the denser role-appropriate module pattern.
- Fix local design QA problems when they appear:
  - crowded checklist rows
  - timeline labels that are too long
  - asymmetrical timeline spacing
  - duplicated timeline information
  - weak step-number hierarchy in checklist tables
  - code-window panels that push into the bottom safe area
  - card modules with too much text for their boxes
- If a number slide lacks context, add a short label and explanation.
- Avoid oversized single-box spotlight modules unless the number itself is genuinely the main hook.
- If a closing slide is too long, compress the body and move the final memorable line into save_point.
- Never invent facts or numbers.
- Preserve grounding in the provided source bundle.
- Return only the repaired slides requested.`;
}

export function contentInput(
  bundle: SourceBundle,
  title?: string | null,
  revisionRequest?: string | null,
) {
  return `Create an 8-slide Korean economics card-news deck.

Optional user title: ${title || "none"}
Operator revision request: ${revisionRequest || "none"}

Story architecture requirements:
- The whole deck should explain one economic term or one tightly bounded concept.
- Slide 1: a student-style hook question or misunderstanding.
- Slide 2: what this term means in one clean definition.
- Slide 3: one sticky analogy from school, allowance, snacks, shopping, games, or family life.
- Slide 4-6: what it looks like in everyday life, why people say this word, and one common mistake.
- Slide 7: the key distinction or "don't confuse it with this" point.
- Slide 8: one memorable takeaway worth saving.

Source bundle:
${JSON.stringify(bundle, null, 2)}
`;
}

export function designerInput(
  bundle: SourceBundle,
  draft: object,
  revisionRequest?: string | null,
) {
  return `Assign visual tones and bottom modules to this 8-slide draft.

Operator revision request:
${revisionRequest || "none"}

Source bundle:
${JSON.stringify(bundle, null, 2)}

Current draft:
${JSON.stringify(draft, null, 2)}
`;
}

export function regenerateInput(
  bundle: SourceBundle,
  project: object,
  slideNumber: number,
) {
  return `Regenerate only slide ${slideNumber} of this project.

Keep the same tone, audience, and visual system.
Stay grounded in this source bundle and preserve the other slides' rhythm.

Source bundle:
${JSON.stringify(bundle, null, 2)}

Existing project:
${JSON.stringify(project, null, 2)}
`;
}

export function qaRepairInput(
  bundle: SourceBundle,
  project: object,
  qaReport: QaReport,
  slideNumbers: number[],
) {
  return `Repair only the slides listed below and keep every other slide unchanged.

Target slide numbers:
${JSON.stringify(slideNumbers)}

Source bundle:
${JSON.stringify(bundle, null, 2)}

Current project:
${JSON.stringify(project, null, 2)}

QA report:
${JSON.stringify(qaReport, null, 2)}
`;
}
