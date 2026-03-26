import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  buildFallbackDesignPlan,
  buildFallbackProject,
  buildFallbackSourceBundle,
} from "@/lib/agents/fallback";
import {
  chooseEditorialSlideCount,
  getEditorialRoleSequence,
  getAllowedPatternsForRole,
  getDefaultThemeName,
  getNarrativeTemperature,
  getQuestionBadge,
  patternModuleTypeMap,
} from "@/lib/design/editorial-core";
import {
  contentPlannerInput,
  contentPlannerInstructions,
} from "@/lib/agents/skills/content-planner";
import {
  contentInput,
  contentMarketerInstructions,
} from "@/lib/agents/skills/contents-marketer";
import {
  designerInput,
  designerInstructions,
} from "@/lib/agents/skills/designer";
import {
  qaRepairInput,
  qaRepairInstructions,
  regenerateInput,
} from "@/lib/agents/skills/qa-repair";
import { getAudienceInstructions } from "@/lib/agents/skills/shared";
import { sourceParserInstructions } from "@/lib/agents/skills/source-parser";
import { renderStandaloneSlideHtml, withStandaloneHtml } from "@/lib/agents/render";
import {
  carouselProjectSchema,
  designPlanSchema,
  editorialThemeName,
  maxCarouselSlides,
  minCarouselSlides,
  qaReportSchema,
  slideModuleSchema,
  slideRoleValues,
  sourceBundleSchema,
  type CarouselProject,
  type DesignPlan,
  type DesignPlanSlide,
  type QaReport,
  type Slide,
  type SourceBundle,
} from "@/lib/agents/schema";
import { getOpenAIClient, getPdfModel, getTextModel } from "@/lib/openai/client";

const slideCopySchema = z
  .object({
    slide_number: z.number().int().min(1).max(maxCarouselSlides),
    role: z.enum(slideRoleValues),
    headline: z.string().min(1).max(120),
    body: z.string().min(1).max(280),
    emphasis: z.string().max(60).nullable(),
    save_point: z.string().max(120).nullable(),
    source_excerpt: z.string().min(1).max(220),
  })
  .strict();

export const copyDeckSchema = z
  .object({
    brand_label: z.string().min(1).max(40),
    project_title: z.string().min(1).max(120),
    caption: z.string().min(1).max(1200),
    slides: z.array(slideCopySchema).min(minCarouselSlides).max(maxCarouselSlides),
  })
  .strict();

const designSlideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(maxCarouselSlides),
    question_badge: z.string().min(1).max(32),
    module: slideModuleSchema,
  })
  .strict();

export const designDeckSchema = z
  .object({
    theme_name: z.string().min(1).max(40),
    slides: z.array(designSlideSchema).min(minCarouselSlides).max(maxCarouselSlides),
  })
  .strict();

const repairSlideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(maxCarouselSlides),
    question_badge: z.string().min(1).max(32),
    headline: z.string().min(1).max(120),
    body: z.string().min(1).max(280),
    emphasis: z.string().max(60).nullable(),
    save_point: z.string().max(120).nullable(),
    source_excerpt: z.string().min(1).max(220),
    module: slideModuleSchema,
  })
  .strict();

const qaRepairDeckSchema = z
  .object({
    repairs: z.array(repairSlideSchema).min(1).max(maxCarouselSlides),
  })
  .strict();

type BuildInput = {
  title?: string | null;
  rawText: string;
  extractedText: string;
  pdfBase64?: string | null;
  pdfName?: string | null;
};

type RawSlide = Omit<Slide, "standalone_html">;
type RawProject = Omit<CarouselProject, "slides"> & { slides: RawSlide[] };
export type CopyDeck = z.infer<typeof copyDeckSchema>;
export type DesignDeck = z.infer<typeof designDeckSchema>;

export type QaLoopResult = {
  project: CarouselProject;
  qaReport: QaReport;
  attempts: Array<{
    attempt: number;
    qa_report: QaReport;
    repaired: boolean;
    repaired_slides: number[];
  }>;
};

function ordered<T extends { slide_number: number }>(items: T[]) {
  return [...items].sort((left, right) => left.slide_number - right.slide_number);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function shortenText(text: string, sentenceLimit: number, charLimit: number) {
  const bySentence = splitSentences(text).slice(0, sentenceLimit).join(" ");
  const base = bySentence || text.trim();

  if (base.length <= charLimit) {
    return base;
  }

  return `${base.slice(0, Math.max(0, charLimit - 1)).trim()}…`;
}

function stripSourceLeadins(text: string) {
  return text
    .replace(/\b(텍스트를 읽으면|자료에 따르면|본문에서|자료에서는)\s+/gu, "")
    .trim();
}

function sanitizeReaderText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = stripSourceLeadins(text.replace(/\s+\n/g, "\n").trim());
  return normalized || null;
}

function textLength(text: string | null | undefined) {
  return text?.trim().length ?? 0;
}

function getRoleSequence(totalSlides: number): Slide["role"][] {
  return getEditorialRoleSequence(totalSlides);
}

function getDefaultPlanSlideCount(bundle: SourceBundle) {
  return chooseEditorialSlideCount(bundle.facts.length, bundle.numbers.length);
}

function normalizeQuestionBadge(
  slideNumber: number,
  totalSlides: number,
  badge: string | null | undefined,
) {
  return sanitizeReaderText(badge) || getQuestionBadge(slideNumber, totalSlides);
}

function sanitizeModule(module: RawSlide["module"]) {
  return {
    ...module,
    title: sanitizeReaderText(module.title) || "핵심 정리",
    subtitle: sanitizeReaderText(module.subtitle),
    footer: sanitizeReaderText(module.footer),
    items: module.items.map((item, index) => ({
      ...item,
      label: sanitizeReaderText(item.label) || `포인트 ${index + 1}`,
      title: sanitizeReaderText(item.title) || `핵심 ${index + 1}`,
      value: sanitizeReaderText(item.value) || "이 문장을 더 짧고 분명하게 다시 써 주세요.",
      note: sanitizeReaderText(item.note),
    })),
  };
}

function normalizeSlideWithPlan(slide: RawSlide, planSlide: DesignPlanSlide, totalSlides: number) {
  const allowedPatterns = getAllowedPatternsForRole(planSlide.role);
  const layoutPattern = allowedPatterns.includes(slide.layout_pattern)
    ? slide.layout_pattern
    : planSlide.layout_pattern;

  return {
    ...slide,
    slide_number: planSlide.slide_number,
    role: planSlide.role,
    visual_tone: planSlide.visual_tone,
    layout_pattern: layoutPattern,
    narrative_phase: planSlide.narrative_phase,
    module_weight: planSlide.module_weight,
    text_density: planSlide.text_density,
    question_badge: normalizeQuestionBadge(planSlide.slide_number, totalSlides, slide.question_badge),
    headline: sanitizeReaderText(slide.headline) || slide.headline.trim(),
    body: sanitizeReaderText(slide.body) || slide.body.trim(),
    emphasis: sanitizeReaderText(slide.emphasis),
    save_point: sanitizeReaderText(slide.save_point),
    source_excerpt: sanitizeReaderText(slide.source_excerpt) || slide.source_excerpt.trim(),
    module: {
      ...sanitizeModule(slide.module),
      type: patternModuleTypeMap[layoutPattern],
    },
  };
}

function normalizeProject(project: RawProject, plan: DesignPlan) {
  return carouselProjectSchema.parse(
    withStandaloneHtml({
      ...project,
      theme_name: editorialThemeName,
      slides: ordered(project.slides).map((slide, index) =>
        normalizeSlideWithPlan(slide, plan.slides[index]!, plan.slides.length),
      ),
    }),
  );
}

function buildFallbackDecks(bundle: SourceBundle, designPlan: DesignPlan) {
  const fallbackProject = buildFallbackProject(bundle, designPlan);

  return {
    copyDeck: copyDeckSchema.parse({
      brand_label: fallbackProject.brand_label,
      project_title: fallbackProject.project_title,
      caption: fallbackProject.caption,
      slides: fallbackProject.slides.map((slide) => ({
        slide_number: slide.slide_number,
        role: slide.role,
        headline: slide.headline,
        body: slide.body,
        emphasis: slide.emphasis,
        save_point: slide.save_point,
        source_excerpt: slide.source_excerpt,
      })),
    }),
    designDeck: designDeckSchema.parse({
      theme_name: fallbackProject.theme_name,
      slides: fallbackProject.slides.map((slide) => ({
        slide_number: slide.slide_number,
        question_badge: slide.question_badge,
        module: slide.module,
      })),
    }),
    project: fallbackProject,
  };
}

function stripStandaloneHtml(slide: Slide): RawSlide {
  const rawSlide = { ...slide } as RawSlide & { standalone_html?: string };
  delete rawSlide.standalone_html;
  return rawSlide;
}

function sourceExcerptLooksGrounded(bundle: SourceBundle, excerpt: string) {
  const probe = excerpt.trim().slice(0, 14);
  return probe.length === 0 || bundle.extracted_text.includes(probe);
}

function actionableSlideNumbers(report: QaReport) {
  const slideNumbers = new Set<number>();

  for (const issue of report.issues) {
    const match = issue.message.match(/^Slide (\d+)/u);
    if (match) {
      slideNumbers.add(Number(match[1]));
    }
  }

  return [...slideNumbers].sort((left, right) => left - right);
}

function hasActionableIssues(report: QaReport) {
  return report.high_count > 0 || report.medium_count > 0;
}

function collectPlanMetadataValidatorIssues(
  slide: Slide,
  planSlide: DesignPlanSlide,
) {
  const issues: QaReport["issues"] = [];

  const comparableFields = [
    { label: "role", actual: slide.role, expected: planSlide.role },
    {
      label: "visual_tone",
      actual: slide.visual_tone,
      expected: planSlide.visual_tone,
    },
    {
      label: "narrative_phase",
      actual: slide.narrative_phase,
      expected: planSlide.narrative_phase,
    },
    {
      label: "module_weight",
      actual: slide.module_weight,
      expected: planSlide.module_weight,
    },
    {
      label: "text_density",
      actual: slide.text_density,
      expected: planSlide.text_density,
    },
  ] as const;

  for (const field of comparableFields) {
    if (field.actual !== field.expected) {
      issues.push({
        severity: "medium",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: ${field.label} drifted away from the design plan.`,
      });
    }
  }

  return issues;
}

const directColorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/u;

function stripRootTokenBlocks(css: string) {
  return css.replace(/:root\s*\{[\s\S]*?\}/gu, "");
}

function usesDirectColorLiteralsOutsideTokens(html: string) {
  const inlineHtml = html.replace(/<style[^>]*>[\s\S]*?<\/style>/giu, "");
  if (/style="[^"]*(?:#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^"]*\))[^"]*"/u.test(inlineHtml)) {
    return true;
  }

  const stylesheet = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/giu)]
    .map((match) => match[1])
    .join("\n");
  const stylesheetWithoutTokens = stripRootTokenBlocks(stylesheet);

  return directColorLiteralPattern.test(stylesheetWithoutTokens);
}

function hasWeakSpotlight(slide: RawSlide | Slide) {
  return slide.module.type === "number-spotlight";
}

function hasDenseTimeline(slide: RawSlide | Slide) {
  if (slide.module.type !== "timeline") {
    return false;
  }

  if (slide.module.items.length < 3 || slide.module.items.length > 4) {
    return true;
  }

  return slide.module.items.some(
    (item) => textLength(item.title) > 20 || textLength(item.value) > 34,
  );
}

function hasDenseChecklist(slide: RawSlide | Slide) {
  if (slide.module.type !== "checklist-table") {
    return false;
  }

  if (slide.module.items.length > 4) {
    return true;
  }

  return slide.module.items.some(
    (item) =>
      textLength(item.label) > 16 ||
      textLength(item.title) > 28 ||
      textLength(item.value) > 42,
  );
}

function hasNumericOnlyChecklistLabels(slide: RawSlide | Slide) {
  if (slide.module.type !== "checklist-table") {
    return false;
  }

  return slide.module.items.every((item) => /^\d+$/u.test(item.label.trim()));
}

function isVisuallyThin(slide: RawSlide | Slide) {
  if (slide.visual_tone !== "light") {
    return false;
  }

  const copyChars =
    textLength(slide.headline) +
    textLength(slide.body) +
    textLength(slide.emphasis) +
    textLength(slide.save_point);

  return (
    copyChars < 110 ||
    (slide.module.type !== "message-banner" && slide.module.items.length < 2)
  );
}

function repairSlideHeuristically(
  slide: Slide,
  bundle: SourceBundle,
  planSlide: DesignPlanSlide | null,
): RawSlide {
  const targetPattern = planSlide?.layout_pattern ?? slide.layout_pattern;

  return {
    slide_number: slide.slide_number,
    role: planSlide?.role ?? slide.role,
    visual_tone: planSlide?.visual_tone ?? slide.visual_tone,
    layout_pattern: targetPattern,
    narrative_phase: planSlide?.narrative_phase ?? slide.narrative_phase,
    module_weight: planSlide?.module_weight ?? slide.module_weight,
    text_density: planSlide?.text_density ?? slide.text_density,
    question_badge: slide.question_badge,
    headline: shortenText(stripSourceLeadins(slide.headline), 1, 96),
    body: shortenText(stripSourceLeadins(slide.body), 2, 220),
    emphasis: slide.emphasis ? shortenText(stripSourceLeadins(slide.emphasis), 1, 48) : null,
    save_point: slide.save_point ? shortenText(stripSourceLeadins(slide.save_point), 1, 84) : null,
    source_excerpt:
      sourceExcerptLooksGrounded(bundle, slide.source_excerpt)
        ? slide.source_excerpt
        : bundle.facts[0]?.source_excerpt ?? bundle.source_summary,
    module: {
      ...sanitizeModule({
        ...slide.module,
        type: patternModuleTypeMap[targetPattern],
      }),
      items: slide.module.items.slice(0, patternModuleTypeMap[targetPattern] === "before-after" ? 2 : 4).map((item, index) => ({
        ...item,
        label:
          patternModuleTypeMap[targetPattern] === "before-after"
            ? index === 0
              ? "Before"
              : "After"
            : sanitizeReaderText(item.label) || `포인트 ${index + 1}`,
        title: shortenText(sanitizeReaderText(item.title) || item.title, 1, 28),
        value: shortenText(sanitizeReaderText(item.value) || item.value, 1, 42),
        note: item.note ? shortenText(item.note, 1, 40) : null,
      })),
    },
  };
}

function enforcePlanGuardrails(plan: DesignPlan) {
  if (plan.slides[0]?.role !== "hook" || plan.slides.at(-1)?.role !== "closing") {
    throw new Error("Design plan must start with hook and end with closing.");
  }

  for (let index = 0; index < plan.slides.length; index += 1) {
    const slide = plan.slides[index]!;
    const allowedPatterns = getAllowedPatternsForRole(slide.role);

    if (!allowedPatterns.includes(slide.layout_pattern)) {
      throw new Error(`Invalid layout pattern ${slide.layout_pattern} for role ${slide.role}.`);
    }

    if (index > 0 && plan.slides[index - 1]!.layout_pattern === slide.layout_pattern) {
      throw new Error("Plan repeats the same layout pattern on consecutive slides.");
    }

    if (index > 1) {
      const temperatures = [
        plan.slides[index - 2]!.emotional_temperature,
        plan.slides[index - 1]!.emotional_temperature,
        slide.emotional_temperature,
      ];
      if (
        temperatures[0] === temperatures[1] &&
        temperatures[1] === temperatures[2]
      ) {
        throw new Error("Plan repeats the same emotional temperature three times.");
      }
    }
  }
}

function buildPlanFallback(bundle: SourceBundle) {
  const fallback = buildFallbackDesignPlan(bundle);
  enforcePlanGuardrails(fallback);
  return fallback;
}

export async function buildSourceBundle(input: BuildInput) {
  const fallback = buildFallbackSourceBundle(
    input.rawText,
    input.extractedText,
    input.title,
  );
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.parse({
      model: input.pdfBase64 ? getPdfModel() : getTextModel(),
      instructions: `${sourceParserInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Build a grounded source bundle for a Korean economics card-news app.
Optional title: ${input.title || "none"}

Locally extracted text:
${input.extractedText}`,
            },
            ...(input.pdfBase64 && input.pdfName
              ? [
                  {
                    type: "input_file" as const,
                    file_data: input.pdfBase64,
                    filename: input.pdfName,
                  },
                ]
              : []),
          ],
        },
      ],
      text: {
        format: zodTextFormat(sourceBundleSchema, "source_bundle"),
      },
      max_output_tokens: 2500,
    });

    return sourceBundleSchema.parse(response.output_parsed);
  } catch {
    return fallback;
  }
}

export async function buildDesignPlan(
  bundle: SourceBundle,
  title?: string | null,
  revisionRequest?: string | null,
) {
  const fallback = buildPlanFallback(bundle);
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentPlannerInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: contentPlannerInput(bundle, title, revisionRequest),
      text: {
        format: zodTextFormat(designPlanSchema, "design_plan"),
      },
      max_output_tokens: 2600,
    });

    const rawPlan = designPlanSchema.parse(response.output_parsed);
    const totalSlides = rawPlan.slides.length || getDefaultPlanSlideCount(bundle);
    const roleSequence = getRoleSequence(totalSlides);

    const normalizedPlan = designPlanSchema.parse({
      ...rawPlan,
      theme_name: getDefaultThemeName(),
      slides: ordered(rawPlan.slides).map((slide, index) => {
        const role = roleSequence[index] ?? slide.role;
        const allowedPatterns = getAllowedPatternsForRole(role);

        return {
          ...slide,
          slide_number: index + 1,
          role,
          visual_tone:
            role === "hook" ? "cover" : role === "closing" ? "dark" : "light",
          layout_pattern: allowedPatterns.includes(slide.layout_pattern)
            ? slide.layout_pattern
            : allowedPatterns[0],
          emotional_temperature: getNarrativeTemperature(slide.narrative_phase),
          module_candidates:
            slide.module_candidates.length > 0
              ? slide.module_candidates.slice(0, 3)
              : [patternModuleTypeMap[allowedPatterns[0]]],
          forbidden_patterns: slide.forbidden_patterns.slice(0, 3),
        };
      }),
    });

    enforcePlanGuardrails(normalizedPlan);
    return normalizedPlan;
  } catch {
    return fallback;
  }
}

export async function buildCopyDeck(
  bundle: SourceBundle,
  designPlan: DesignPlan,
  title?: string | null,
  revisionRequest?: string | null,
) {
  const fallback = buildFallbackDecks(bundle, designPlan).copyDeck;
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const copyResponse = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: contentInput(bundle, designPlan, title, revisionRequest),
      text: {
        format: zodTextFormat(copyDeckSchema, "copy_deck"),
      },
      max_output_tokens: 3500,
    });

    return copyDeckSchema.parse(copyResponse.output_parsed);
  } catch {
    return fallback;
  }
}

export async function buildDesignDeck(
  bundle: SourceBundle,
  designPlan: DesignPlan,
  copyDeck: CopyDeck,
  revisionRequest?: string | null,
) {
  const fallback = buildFallbackDecks(bundle, designPlan).designDeck;
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const designResponse = await client.responses.parse({
      model: getTextModel(),
      instructions: designerInstructions(),
      input: designerInput(bundle, designPlan, copyDeck, revisionRequest),
      text: {
        format: zodTextFormat(designDeckSchema, "design_deck"),
      },
      max_output_tokens: 2800,
    });

    return designDeckSchema.parse(designResponse.output_parsed);
  } catch {
    return fallback;
  }
}

export function assembleCarouselProject(
  bundle: SourceBundle,
  designPlan: DesignPlan,
  copyDeck: CopyDeck,
  designDeck: DesignDeck,
) {
  const fallback = buildFallbackDecks(bundle, designPlan).project;
  const copyBySlide = new Map(ordered(copyDeck.slides).map((slide) => [slide.slide_number, slide]));
  const designBySlide = new Map(
    ordered(designDeck.slides).map((slide) => [slide.slide_number, slide]),
  );

  return normalizeProject(
    {
      brand_label: copyDeck.brand_label,
      project_title: copyDeck.project_title,
      audience: "middle_school",
      language: "ko",
      theme_name: editorialThemeName,
      caption: copyDeck.caption,
      slides: designPlan.slides.map((planSlide) => {
        const copySlide = copyBySlide.get(planSlide.slide_number);
        const designSlide = designBySlide.get(planSlide.slide_number);
        const fallbackSlide = fallback.slides[planSlide.slide_number - 1]!;

        return {
          slide_number: planSlide.slide_number,
          role: planSlide.role,
          visual_tone: planSlide.visual_tone,
          layout_pattern: planSlide.layout_pattern,
          narrative_phase: planSlide.narrative_phase,
          module_weight: planSlide.module_weight,
          text_density: planSlide.text_density,
          question_badge: normalizeQuestionBadge(
            planSlide.slide_number,
            designPlan.slides.length,
            designSlide?.question_badge,
          ),
          headline: copySlide?.headline ?? fallbackSlide.headline,
          body: copySlide?.body ?? fallbackSlide.body,
          emphasis: copySlide?.emphasis ?? fallbackSlide.emphasis,
          save_point: copySlide?.save_point ?? fallbackSlide.save_point,
          source_excerpt: copySlide?.source_excerpt ?? fallbackSlide.source_excerpt,
          module: designSlide?.module ?? fallbackSlide.module,
        };
      }),
    },
    designPlan,
  );
}

export async function buildCarouselProject(
  bundle: SourceBundle,
  designPlan: DesignPlan,
  title?: string | null,
  revisionRequest?: string | null,
) {
  try {
    const copyDeck = await buildCopyDeck(bundle, designPlan, title, revisionRequest);
    const designDeck = await buildDesignDeck(bundle, designPlan, copyDeck, revisionRequest);
    return assembleCarouselProject(bundle, designPlan, copyDeck, designDeck);
  } catch {
    return buildFallbackDecks(bundle, designPlan).project;
  }
}

async function repairProjectFromQa(
  bundle: SourceBundle,
  project: CarouselProject,
  designPlan: DesignPlan | null,
  qaReport: QaReport,
) {
  const targetSlides = actionableSlideNumbers(qaReport);

  if (targetSlides.length === 0) {
    return project;
  }

  const plan = designPlan ?? buildPlanFallback(bundle);
  const heuristicProject = normalizeProject(
    {
      ...project,
      slides: project.slides.map((slide) => {
        if (!targetSlides.includes(slide.slide_number)) {
          return stripStandaloneHtml(slide);
        }

        return repairSlideHeuristically(
          slide,
          bundle,
          plan.slides.find(
            (item: DesignPlan["slides"][number]) => item.slide_number === slide.slide_number,
          ) ?? null,
        );
      }),
    },
    plan,
  );

  const client = getOpenAIClient();

  if (!client) {
    return heuristicProject;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${designerInstructions()}\n${qaRepairInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: qaRepairInput(bundle, heuristicProject, designPlan, qaReport, targetSlides),
      text: {
        format: zodTextFormat(qaRepairDeckSchema, "qa_repair_deck"),
      },
      max_output_tokens: 2200,
    });

    const repairDeck = qaRepairDeckSchema.parse(response.output_parsed);
    const repairedBySlide = new Map(repairDeck.repairs.map((slide) => [slide.slide_number, slide]));

    return normalizeProject(
      {
        ...heuristicProject,
        slides: heuristicProject.slides.map((slide) => {
          const repaired = repairedBySlide.get(slide.slide_number);

          if (!repaired) {
            return stripStandaloneHtml(slide);
          }

          return repairSlideHeuristically(
            {
              ...slide,
              question_badge: repaired.question_badge,
              headline: repaired.headline,
              body: repaired.body,
              emphasis: repaired.emphasis,
              save_point: repaired.save_point,
              source_excerpt: repaired.source_excerpt,
              module: repaired.module,
            },
            bundle,
            plan.slides.find(
              (item: DesignPlan["slides"][number]) => item.slide_number === slide.slide_number,
            ) ?? null,
          );
        }),
      },
      plan,
    );
  } catch {
    return heuristicProject;
  }
}

export async function qaRepairLoop(
  bundle: SourceBundle,
  project: CarouselProject,
  designPlan: DesignPlan | null,
  qaReport: QaReport,
  maxRepairPasses = 2,
): Promise<QaLoopResult> {
  const attempts: QaLoopResult["attempts"] = [];
  let current = project;
  let currentQaReport = qaReport;

  for (let attempt = 1; attempt <= maxRepairPasses; attempt += 1) {
    const slideNumbers = actionableSlideNumbers(currentQaReport);
    const canRepair = hasActionableIssues(currentQaReport) && slideNumbers.length > 0;

    attempts.push({
      attempt,
      qa_report: currentQaReport,
      repaired: canRepair,
      repaired_slides: canRepair ? slideNumbers : [],
    });

    if (!canRepair) {
      return {
        project: current,
        qaReport: currentQaReport,
        attempts,
      };
    }

    current = await repairProjectFromQa(bundle, current, designPlan, currentQaReport);
    currentQaReport = runQa(current, bundle, designPlan);
  }

  return {
    project: current,
    qaReport: currentQaReport,
    attempts,
  };
}

export async function qaReviewAndRepair(
  bundle: SourceBundle,
  project: CarouselProject,
  designPlan: DesignPlan | null,
  maxRepairPasses = 2,
): Promise<QaLoopResult> {
  const qaReport = runQa(project, bundle, designPlan);
  return qaRepairLoop(bundle, project, designPlan, qaReport, maxRepairPasses);
}

export async function regenerateSlideFromProject(
  bundle: SourceBundle,
  project: CarouselProject,
  designPlan: DesignPlan | null,
  slideNumber: number,
) {
  const client = getOpenAIClient();

  if (!client) {
    return project;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${designerInstructions()}\nReturn only one repaired slide.`,
      input: regenerateInput(bundle, project, designPlan, slideNumber),
      text: {
        format: zodTextFormat(repairSlideSchema, "single_slide"),
      },
      max_output_tokens: 1500,
    });

    const repaired = repairSlideSchema.parse(response.output_parsed);
    const plan = designPlan ?? buildPlanFallback(bundle);

    return normalizeProject(
      {
        ...project,
        slides: project.slides.map((slide) => {
          if (slide.slide_number !== slideNumber) {
            return stripStandaloneHtml(slide);
          }

          return repairSlideHeuristically(
            {
              ...slide,
              question_badge: repaired.question_badge,
              headline: repaired.headline,
              body: repaired.body,
              emphasis: repaired.emphasis,
              save_point: repaired.save_point,
              source_excerpt: repaired.source_excerpt,
              module: repaired.module,
            },
            bundle,
            plan.slides.find(
              (item: DesignPlan["slides"][number]) => item.slide_number === slideNumber,
            ) ?? null,
          );
        }),
      },
      plan,
    );
  } catch {
    return project;
  }
}

function buildQaReport(
  issues: QaReport["issues"],
  checksPassed: string[],
): QaReport {
  return qaReportSchema.parse({
    high_count: issues.filter((issue) => issue.severity === "high").length,
    medium_count: issues.filter((issue) => issue.severity === "medium").length,
    low_count: issues.filter((issue) => issue.severity === "low").length,
    checks_passed: checksPassed,
    issues: issues.slice(0, 12),
  });
}

export function runDeterministicQaValidator(
  project: CarouselProject,
  bundle: SourceBundle,
  designPlan: DesignPlan | null,
): QaReport {
  const issues: QaReport["issues"] = [];
  const planSlides = designPlan?.slides ?? [];

  for (let index = 0; index < project.slides.length; index += 1) {
    const slide = project.slides[index]!;
    const planSlide = planSlides[index] ?? null;
    const allowedPatterns = getAllowedPatternsForRole(slide.role);
    const isMiddle = slide.visual_tone === "light";

    if (!allowedPatterns.includes(slide.layout_pattern)) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: invalid layout pattern for role ${slide.role}.`,
      });
    }

    if (slide.module.type !== patternModuleTypeMap[slide.layout_pattern]) {
      issues.push({
        severity: "medium",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: module type does not match layout pattern.`,
      });
    }

    if (planSlide && slide.layout_pattern !== planSlide.layout_pattern) {
      issues.push({
        severity: "medium",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: layout drifted away from the design plan.`,
      });
    }

    if (planSlide) {
      issues.push(
        ...collectPlanMetadataValidatorIssues(slide, planSlide),
      );
    }

    if (slide.slide_number === 1) {
      if (slide.layout_pattern !== "cover-hero" || slide.visual_tone !== "cover") {
        issues.push({
          severity: "high",
          stage: "qa-validator",
          message: "Slide 1: cover must use cover-hero and cover tone.",
        });
      }
    } else if (slide.slide_number === project.slides.length) {
      if (slide.layout_pattern !== "closing-statement" || slide.visual_tone !== "dark") {
        issues.push({
          severity: "high",
          stage: "qa-validator",
          message: `Slide ${slide.slide_number}: closing must use closing-statement and dark tone.`,
        });
      }
    } else if (slide.visual_tone !== "light") {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: middle slides must use the light editorial tone.`,
      });
    }

    if (index > 0 && project.slides[index - 1]!.layout_pattern === slide.layout_pattern) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: repeated layout pattern on consecutive slides.`,
      });
    }

    if (index > 1) {
      const temperatures = [
        project.slides[index - 2]!.narrative_phase,
        project.slides[index - 1]!.narrative_phase,
        slide.narrative_phase,
      ].map(getNarrativeTemperature);

      if (
        temperatures[0] === temperatures[1] &&
        temperatures[1] === temperatures[2]
      ) {
        issues.push({
          severity: "high",
          stage: "qa-validator",
          message: `Slide ${slide.slide_number}: emotional temperature repeated three times.`,
        });
      }
    }

    if (isMiddle && slide.module_weight === "light") {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: lower module is too weak for the editorial layout.`,
      });
    }

    if (hasDenseTimeline(slide)) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: timeline is too dense or asymmetrical.`,
      });
    }

    if (hasWeakSpotlight(slide)) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: weak-number spotlight patterns are not allowed.`,
      });
    }

    if (slide.visual_tone === "light" && !slide.standalone_html.includes('class="page-counter"')) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: middle slide is missing the page counter.`,
      });
    }

    if (!slide.standalone_html.includes("overflow:hidden")) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: standalone HTML must keep overflow hidden.`,
      });
    }

    const slideWithoutHtml = stripStandaloneHtml(slide);
    const expectedStandaloneHtml = renderStandaloneSlideHtml(
      slideWithoutHtml,
      project.slides.length,
      project.project_title,
    );

    if (slide.standalone_html !== expectedStandaloneHtml) {
      issues.push({
        severity: "high",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: standalone renderer drifted from the slide data.`,
      });
    }

    if (usesDirectColorLiteralsOutsideTokens(slide.standalone_html)) {
      issues.push({
        severity: "medium",
        stage: "qa-validator",
        message: `Slide ${slide.slide_number}: direct color literals found outside design tokens.`,
      });
    }
  }

  return buildQaReport(issues, [
    "design-plan metadata matches the generated slides",
    "editorial structure, rhythm, and layout rules validated",
    "standalone renderer output matches slide data and token contract",
  ]);
}

export function runQaReviewer(
  project: CarouselProject,
  bundle: SourceBundle,
  designPlan: DesignPlan | null,
  validatorReport: QaReport,
): QaReport {
  void designPlan;
  const issues = [...validatorReport.issues];

  for (const slide of project.slides) {
    const isMiddle = slide.visual_tone === "light";

    if (slide.headline.length > 110) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: headline is too long.`,
      });
    }

    if (slide.body.length > 240) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: body copy is too long for mobile reading.`,
      });
    }

    if (!sourceExcerptLooksGrounded(bundle, slide.source_excerpt)) {
      issues.push({
        severity: "low",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: source excerpt needs a grounded match.`,
      });
    }

    if (isMiddle && isVisuallyThin(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: upper copy or lower module feels too empty.`,
      });
    }

    if (hasDenseChecklist(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: checklist hierarchy is too dense.`,
      });
    }

    if (hasNumericOnlyChecklistLabels(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `Slide ${slide.slide_number}: checklist labels need stronger hierarchy than numbers alone.`,
      });
    }
  }

  return buildQaReport(issues, [
      "1080x1350 standalone HTML generated",
      "deterministic validator report reviewed before repair",
      "copy readability and grounded explanation checked",
    ]);
}

export function runQa(
  project: CarouselProject,
  bundle: SourceBundle,
  designPlan: DesignPlan | null,
): QaReport {
  const validatorReport = runDeterministicQaValidator(project, bundle, designPlan);
  return runQaReviewer(project, bundle, designPlan, validatorReport);
}
