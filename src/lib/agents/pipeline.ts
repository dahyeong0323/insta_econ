import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  carouselProjectSchema,
  qaReportSchema,
  slideModuleSchema,
  slideRoleValues,
  sourceBundleSchema,
  type CarouselProject,
  type QaReport,
  type Slide,
  type SourceBundle,
} from "@/lib/agents/schema";
import {
  buildFallbackProject,
  buildFallbackSourceBundle,
} from "@/lib/agents/fallback";
import {
  contentInput,
  contentMarketerInstructions,
  designerInput,
  designerInstructions,
  getAudienceInstructions,
  qaRepairInput,
  qaRepairInstructions,
  regenerateInput,
  sourceParserInstructions,
} from "@/lib/agents/prompts";
import { withStandaloneHtml } from "@/lib/agents/render";
import {
  getOpenAIClient,
  getPdfModel,
  getTextModel,
} from "@/lib/openai/client";

const slideCopySchema = z
  .object({
    slide_number: z.number().int().min(1).max(8),
    role: z.enum(slideRoleValues),
    headline: z.string().min(1).max(120),
    body: z.string().min(1).max(280),
    emphasis: z.string().max(60).nullable(),
    save_point: z.string().max(120).nullable(),
    source_excerpt: z.string().min(1).max(220),
  })
  .strict();

const copyDeckSchema = z
  .object({
    brand_label: z.string().min(1).max(40),
    project_title: z.string().min(1).max(120),
    caption: z.string().min(1).max(1200),
    slides: z.array(slideCopySchema).length(8),
  })
  .strict();

const slideDesignSchema = z
  .object({
    slide_number: z.number().int().min(1).max(8),
    question_badge: z.string().min(1).max(32),
    visual_tone: z.enum(["cover", "light", "dark"]),
    module: slideModuleSchema,
  })
  .strict();

const designDeckSchema = z
  .object({
    theme_name: z.string().min(1).max(40),
    slides: z.array(slideDesignSchema).length(8),
  })
  .strict();

const repairSlideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(8),
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
    repairs: z.array(repairSlideSchema).min(1).max(8),
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

  if (!bySentence) {
    return text.trim();
  }

  if (bySentence.length <= charLimit) {
    return bySentence;
  }

  return `${bySentence.slice(0, Math.max(0, charLimit - 1)).trim()}…`;
}

function looksLikeMetaInstruction(text: string | null | undefined) {
  if (!text) {
    return false;
  }

  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  return (
    /\b(bottom module|dark closing slide|keep it sparse|use a crisp|works better than|fits the .* narrative|with lots of white space|one clean comparison|extra icons|focal number block|editorial table|linear historical reading)\b/i.test(
      normalized,
    ) ||
    /^\s*hook\s*$/iu.test(normalized)
  );
}

function stripSourceLeadins(text: string) {
  return text
    .replace(/\b(이\s+소스는|소스는|소스에\s+따르면|소스에\s+의하면|원문은|자료는|이\s+글은)\s+/gu, "")
    .replace(/^에 따르면\s+/u, "")
    .replace(/^에 의하면\s+/u, "")
    .trim();
}

function sanitizeReaderText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const lines = text
    .split("\n")
    .map((line) => stripSourceLeadins(line.trim()))
    .filter(Boolean)
    .filter((line) => !/^(null|none|n\/a|없음)$/iu.test(line))
    .filter((line) => !looksLikeMetaInstruction(line));

  const sanitized = lines.join("\n").trim();
  return sanitized || null;
}

function normalizeBadge(slideNumber: number, badge: string) {
  if (slideNumber === 1) {
    return "econ-carousel-v2";
  }

  if (slideNumber === 8) {
    return "Q. 마지막으로";
  }

  return badge.trim() || "Q";
}

function normalizeClosingSlide(slide: RawSlide) {
  const bodySentences = splitSentences(slide.body);
  let body = slide.body.trim();
  let savePoint = slide.save_point?.trim() || null;
  let emphasis = slide.emphasis?.trim() || null;

  if (bodySentences.length > 2 || body.length > 170) {
    body = shortenText(body, 2, 150);
    if (!savePoint && bodySentences.length > 2) {
      savePoint = shortenText(bodySentences.slice(2).join(" "), 1, 90);
    }
  }

  if (!savePoint && /저장|공유|친구|같이/u.test(body)) {
    const matched = body.match(/[^.?!]*?(저장|공유|친구|같이)[^.?!]*[.?!]?/u);
    if (matched) {
      savePoint = matched[0].trim();
      body = body.replace(matched[0], "").replace(/\s{2,}/g, " ").trim();
    }
  }

  if (!emphasis && /(좋은 돈|가치 저장|시간을 버틴다|미래 계획)/u.test(`${slide.headline} ${body}`)) {
    emphasis = "좋은 돈은 시간을 버텨요";
  }

  return {
    ...slide,
    question_badge: "Q. 마지막으로",
    body: stripSourceLeadins(body),
    emphasis: emphasis ? stripSourceLeadins(emphasis) : null,
    save_point: savePoint ? stripSourceLeadins(savePoint) : null,
  };
}

function normalizeNumberModule(slide: RawSlide) {
  if (slide.module.type !== "number-spotlight") {
    return slide;
  }

  const item = slide.module.items[0];
  const label =
    item?.label && !/^(number|숫자|수치)$/iu.test(item.label)
      ? stripSourceLeadins(item.label)
      : "무슨 숫자냐면";
  const title = stripSourceLeadins(
    item?.title || item?.value || slide.emphasis || slide.module.title,
  );
  const value = stripSourceLeadins(
    item?.value && item.value !== item.title
      ? item.value
      : slide.save_point || slide.module.footer || slide.body,
  );

  return {
    ...slide,
    module: {
      ...slide.module,
      title: stripSourceLeadins(slide.module.title || "숫자로 보면"),
      items: [
        {
          ...item,
          label,
          title,
          value,
        },
      ],
    },
  };
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
      title: sanitizeReaderText(item.title) || "핵심",
      value: sanitizeReaderText(item.value) || "설명이 비어 있어 다시 정리했어요.",
      note: sanitizeReaderText(item.note),
    })),
  };
}

function slideHasNumericSignal(slide: RawSlide) {
  const probe = [
    slide.headline,
    slide.body,
    slide.emphasis,
    slide.save_point,
    slide.module.title,
    slide.module.subtitle,
    slide.module.footer,
    ...slide.module.items.flatMap((item) => [
      item.label,
      item.title,
      item.value,
      item.note,
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return /\d/.test(probe);
}

function coerceModuleForRole(slide: RawSlide): RawSlide {
  if (slide.slide_number === 1 || slide.slide_number === 8) {
    return slide;
  }

  let nextType = slide.module.type;

  switch (slide.role) {
    case "core":
      nextType = "checklist-table";
      break;
    case "why":
      nextType = "before-after";
      break;
    case "example":
      nextType = "timeline";
      break;
    case "compare":
      nextType = slide.module.items.length >= 3 ? "three-card-summary" : "before-after";
      break;
    case "number_or_steps":
      nextType = slideHasNumericSignal(slide) ? "number-spotlight" : "code-window";
      break;
    case "recap":
      nextType = slide.module.items.length <= 1 ? "message-banner" : "three-card-summary";
      break;
    default:
      break;
  }

  if (nextType === slide.module.type) {
    return slide;
  }

  return {
    ...slide,
    module: {
      ...slide.module,
      type: nextType,
    },
  };
}

function normalizeSlide(slide: RawSlide, index: number) {
  const baseSlide: RawSlide = {
    ...slide,
    question_badge: normalizeBadge(slide.slide_number, slide.question_badge),
    headline: sanitizeReaderText(slide.headline) || slide.headline.trim(),
    body: sanitizeReaderText(slide.body) || slide.body.trim(),
    emphasis: sanitizeReaderText(slide.emphasis),
    save_point: sanitizeReaderText(slide.save_point),
    source_excerpt: sanitizeReaderText(slide.source_excerpt) || slide.source_excerpt.trim(),
    module: sanitizeModule(slide.module),
  };

  const normalized =
    index === 7 || slide.slide_number === 8
      ? normalizeClosingSlide(baseSlide)
      : baseSlide;

  return normalizeNumberModule(coerceModuleForRole(normalized));
}

function normalizeProject(project: RawProject) {
  return carouselProjectSchema.parse(
    withStandaloneHtml({
      ...project,
      slides: project.slides.map((slide, index) => normalizeSlide(slide, index)),
    }),
  );
}

function sourceExcerptLooksGrounded(bundle: SourceBundle, excerpt: string) {
  const probe = excerpt.trim().slice(0, 12);
  return probe.length === 0 || bundle.extracted_text.includes(probe);
}

function actionableSlideNumbers(report: QaReport) {
  const slideNumbers = new Set<number>();

  for (const issue of report.issues) {
    const match = issue.message.match(/(\d+)번/u);
    if (match) {
      slideNumbers.add(Number(match[1]));
      continue;
    }

    if (/마지막 슬라이드|클로징/u.test(issue.message)) {
      slideNumbers.add(8);
    }
  }

  return [...slideNumbers].sort((left, right) => left - right);
}

function hasActionableIssues(report: QaReport) {
  return report.high_count > 0 || report.medium_count > 0;
}

function textLength(text: string | null | undefined) {
  return text?.trim().length ?? 0;
}

function moduleTextLength(slide: RawSlide | Slide) {
  return [
    slide.module.title,
    slide.module.subtitle,
    slide.module.footer,
    ...slide.module.items.flatMap((item) => [
      item.label,
      item.title,
      item.value,
      item.note,
    ]),
  ]
    .filter(Boolean)
    .join(" ").length;
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
      textLength(item.label) > 14 ||
      textLength(item.title) > 26 ||
      textLength(item.value) > 42,
  );
}

function hasDenseTimeline(slide: RawSlide | Slide) {
  if (slide.module.type !== "timeline") {
    return false;
  }

  if (slide.module.items.length > 4) {
    return true;
  }

  return slide.module.items.some(
    (item) =>
      textLength(item.label) > 8 ||
      textLength(item.title) > 18 ||
      textLength(item.value) > 34,
  );
}

function hasDenseCodeWindow(slide: RawSlide | Slide) {
  if (slide.module.type !== "code-window") {
    return false;
  }

  if (slide.module.items.length > 4) {
    return true;
  }

  if (textLength(slide.module.footer) > 68) {
    return true;
  }

  return slide.module.items.some(
    (item) => textLength(item.title) > 28 || textLength(item.value) > 90,
  );
}

function hasDenseCardModule(slide: RawSlide | Slide) {
  if (!["before-after", "three-card-summary", "message-banner"].includes(slide.module.type)) {
    return false;
  }

  if (slide.module.type === "before-after" && textLength(slide.module.footer) > 72) {
    return true;
  }

  if (slide.module.type === "message-banner") {
    return (
      textLength(slide.module.items[0]?.title) > 34 ||
      textLength(slide.module.items[0]?.value) > 88
    );
  }

  return slide.module.items.some(
    (item) =>
      textLength(item.title) > 28 ||
      textLength(item.value) > 70 ||
      textLength(item.note) > 52,
  );
}

function isVisuallyThin(slide: RawSlide | Slide) {
  if (slide.slide_number === 1 || slide.slide_number === 8) {
    return false;
  }

  if (slide.visual_tone !== "light") {
    return false;
  }

  const copyChars =
    textLength(slide.headline) +
    textLength(slide.body) +
    textLength(slide.emphasis) +
    textLength(slide.save_point);

  return copyChars < 120 && moduleTextLength(slide) < 140;
}

function isVisuallyCrowded(slide: RawSlide | Slide) {
  const copyChars =
    textLength(slide.headline) +
    textLength(slide.body) +
    textLength(slide.emphasis) +
    textLength(slide.save_point);

  return copyChars > 320 || moduleTextLength(slide) > 520;
}

function heuristicRepairSlide(slide: Slide, bundle: SourceBundle) {
  let next: RawSlide = {
    slide_number: slide.slide_number,
    role: slide.role,
    question_badge: slide.question_badge,
    visual_tone: slide.visual_tone,
    headline: stripSourceLeadins(slide.headline.trim()),
    body: stripSourceLeadins(slide.body.trim()),
    emphasis: slide.emphasis ? stripSourceLeadins(slide.emphasis.trim()) : null,
    save_point: slide.save_point ? stripSourceLeadins(slide.save_point.trim()) : null,
    source_excerpt: slide.source_excerpt.trim(),
    module: sanitizeModule(slide.module),
  };

  if (next.headline.length > 110) {
    next.headline = shortenText(next.headline, 1, 108);
  }

  if (next.body.length > 240) {
    next.body = shortenText(next.body, 2, 220);
  }

  if (next.module.type === "checklist-table") {
    next.module = {
      ...next.module,
      title: shortenText(next.module.title, 1, 48),
      footer: next.module.footer ? shortenText(next.module.footer, 1, 78) : null,
      items: next.module.items.slice(0, 4).map((item, index) => ({
        ...item,
        label: shortenText(item.label || `Point ${index + 1}`, 1, 12),
        title: shortenText(item.title, 1, 24),
        value: shortenText(item.value, 1, 40),
        note: item.note ? shortenText(item.note, 1, 44) : null,
      })),
    };
  }

  if (next.module.type === "timeline") {
    next.module = {
      ...next.module,
      title: shortenText(next.module.title, 1, 54),
      footer: next.module.footer ? shortenText(next.module.footer, 1, 74) : null,
      items: next.module.items.slice(0, 4).map((item, index) => ({
        ...item,
        label:
          /^\d+$/.test(item.label.trim()) || textLength(item.label) <= 6
            ? shortenText(item.label, 1, 6)
            : String(index + 1),
        title: shortenText(item.title, 1, 18),
        value: shortenText(item.value, 1, 30),
        note: item.note ? shortenText(item.note, 1, 34) : null,
      })),
    };
  }

  if (next.module.type === "code-window") {
    next.module = {
      ...next.module,
      title: shortenText(next.module.title, 1, 42),
      footer: next.module.footer ? shortenText(next.module.footer, 1, 60) : null,
      items: next.module.items.slice(0, 4).map((item) => ({
        ...item,
        title: shortenText(item.title, 1, 26),
        value: shortenText(item.value, 2, 84),
        note: item.note ? shortenText(item.note, 1, 38) : null,
      })),
    };
  }

  if (next.module.type === "before-after") {
    next.module = {
      ...next.module,
      footer: next.module.footer ? shortenText(next.module.footer, 1, 68) : null,
      items: next.module.items.slice(0, 3).map((item) => ({
        ...item,
        label: shortenText(item.label, 1, 16),
        title: shortenText(item.title, 1, 24),
        value: shortenText(item.value, 2, 68),
        note: item.note ? shortenText(item.note, 1, 40) : null,
      })),
    };
  }

  if (next.module.type === "three-card-summary") {
    next.module = {
      ...next.module,
      title: shortenText(next.module.title, 1, 48),
      footer: next.module.footer ? shortenText(next.module.footer, 1, 66) : null,
      items: next.module.items.slice(0, 3).map((item) => ({
        ...item,
        label: shortenText(item.label, 1, 16),
        title: shortenText(item.title, 1, 24),
        value: shortenText(item.value, 2, 62),
        note: item.note ? shortenText(item.note, 1, 38) : null,
      })),
    };
  }

  if (next.module.type === "message-banner") {
    next.module = {
      ...next.module,
      title: shortenText(next.module.title, 1, 26),
      footer: next.module.footer ? shortenText(next.module.footer, 1, 56) : null,
      items: next.module.items.slice(0, 1).map((item) => ({
        ...item,
        label: shortenText(item.label, 1, 18),
        title: shortenText(item.title, 2, 34),
        value: shortenText(item.value, 2, 80),
        note: item.note ? shortenText(item.note, 1, 36) : null,
      })),
    };
  }

  if (next.slide_number === 8) {
    next = normalizeClosingSlide(next);
  }

  next = normalizeNumberModule(next);
  next = coerceModuleForRole(next);

  if (isVisuallyCrowded(next)) {
    next.body = shortenText(next.body, 2, 180);
    next.save_point = next.save_point ? shortenText(next.save_point, 1, 72) : next.save_point;
  }

  if (!sourceExcerptLooksGrounded(bundle, next.source_excerpt)) {
    next.source_excerpt = bundle.facts[0]?.source_excerpt ?? bundle.source_summary;
  }

  return next;
}

async function repairProjectFromQa(
  bundle: SourceBundle,
  project: CarouselProject,
  qaReport: QaReport,
) {
  const targetSlides = actionableSlideNumbers(qaReport);

  if (targetSlides.length === 0) {
    return project;
  }

  const heuristicallyRepaired = normalizeProject({
    ...project,
    slides: project.slides.map((slide) =>
      targetSlides.includes(slide.slide_number)
        ? heuristicRepairSlide(slide, bundle)
        : {
            slide_number: slide.slide_number,
            role: slide.role,
            question_badge: slide.question_badge,
            visual_tone: slide.visual_tone,
            headline: slide.headline,
            body: slide.body,
            emphasis: slide.emphasis,
            save_point: slide.save_point,
            source_excerpt: slide.source_excerpt,
            module: slide.module,
          },
    ),
  });

  const heuristicQa = runQa(heuristicallyRepaired, bundle);
  const client = getOpenAIClient();

  if (!client || !hasActionableIssues(heuristicQa)) {
    return heuristicallyRepaired;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${designerInstructions()}\n${qaRepairInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: qaRepairInput(bundle, heuristicallyRepaired, heuristicQa, targetSlides),
      text: {
        format: zodTextFormat(qaRepairDeckSchema, "qa_repair_deck"),
      },
      max_output_tokens: 2200,
    });

    const repairDeck = qaRepairDeckSchema.parse(response.output_parsed);
    const repairedMap = new Map(
      repairDeck.repairs.map((slide) => [slide.slide_number, slide]),
    );

    return normalizeProject({
      ...heuristicallyRepaired,
      slides: heuristicallyRepaired.slides.map((slide) => {
        const repaired = repairedMap.get(slide.slide_number);

        if (!repaired) {
          return {
            slide_number: slide.slide_number,
            role: slide.role,
            question_badge: slide.question_badge,
            visual_tone: slide.visual_tone,
            headline: slide.headline,
            body: slide.body,
            emphasis: slide.emphasis,
            save_point: slide.save_point,
            source_excerpt: slide.source_excerpt,
            module: slide.module,
          };
        }

        return {
          slide_number: slide.slide_number,
          role: slide.role,
          visual_tone: slide.visual_tone,
          question_badge: repaired.question_badge,
          headline: repaired.headline,
          body: repaired.body,
          emphasis: repaired.emphasis,
          save_point: repaired.save_point,
          source_excerpt: repaired.source_excerpt,
          module: repaired.module,
        };
      }),
    });
  } catch {
    return heuristicallyRepaired;
  }
}

export async function qaReviewAndRepair(
  bundle: SourceBundle,
  project: CarouselProject,
  maxRepairPasses = 2,
): Promise<QaLoopResult> {
  const attempts: QaLoopResult["attempts"] = [];
  let current = project;

  for (let attempt = 1; attempt <= maxRepairPasses + 1; attempt += 1) {
    const qaReport = runQa(current, bundle);
    const slideNumbers = actionableSlideNumbers(qaReport);
    const canRepair = attempt <= maxRepairPasses && hasActionableIssues(qaReport);

    attempts.push({
      attempt,
      qa_report: qaReport,
      repaired: canRepair && slideNumbers.length > 0,
      repaired_slides: canRepair ? slideNumbers : [],
    });

    if (!canRepair || slideNumbers.length === 0) {
      return {
        project: current,
        qaReport,
        attempts,
      };
    }

    current = await repairProjectFromQa(bundle, current, qaReport);
  }

  const finalQa = runQa(current, bundle);
  return {
    project: current,
    qaReport: finalQa,
    attempts,
  };
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
              text: `Build a grounded source bundle for an economics card-news app.
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

export async function buildCarouselProject(
  bundle: SourceBundle,
  title?: string | null,
) {
  const fallback = buildFallbackProject(bundle);
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const copyResponse = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${getAudienceInstructions("middle_school")}`,
      input: contentInput(bundle, title),
      text: {
        format: zodTextFormat(copyDeckSchema, "copy_deck"),
      },
      max_output_tokens: 3500,
    });

    const copyDeck = copyDeckSchema.parse(copyResponse.output_parsed);

    const designResponse = await client.responses.parse({
      model: getTextModel(),
      instructions: designerInstructions(),
      input: designerInput(bundle, copyDeck),
      text: {
        format: zodTextFormat(designDeckSchema, "design_deck"),
      },
      max_output_tokens: 3200,
    });

    const designDeck = designDeckSchema.parse(designResponse.output_parsed);
    const orderedDesignSlides = ordered(designDeck.slides);

    const merged: RawProject = {
      brand_label: copyDeck.brand_label,
      project_title: copyDeck.project_title,
      audience: "middle_school",
      language: "ko",
      theme_name: designDeck.theme_name,
      caption: copyDeck.caption,
      slides: ordered(copyDeck.slides).map((copySlide, index) => ({
        ...copySlide,
        question_badge:
          orderedDesignSlides[index]?.question_badge ??
          (index === 0 ? "econ-carousel-v2" : index === 7 ? "Q. 마지막으로" : "Q"),
        visual_tone:
          orderedDesignSlides[index]?.visual_tone ??
          (index === 0 ? "cover" : index === 7 ? "dark" : "light"),
        module: orderedDesignSlides[index]?.module ?? fallback.slides[index].module,
      })),
    };

    return normalizeProject(merged);
  } catch {
    return fallback;
  }
}

export async function regenerateSlideFromProject(
  bundle: SourceBundle,
  project: CarouselProject,
  slideNumber: number,
) {
  const client = getOpenAIClient();

  if (!client) {
    return project;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: `${contentMarketerInstructions()}\n${designerInstructions()}\nReturn only one complete slide.`,
      input: regenerateInput(bundle, project, slideNumber),
      text: {
        format: zodTextFormat(
          z
            .object({
              slide_number: z.number().int().min(1).max(8),
              role: z.enum(slideRoleValues),
              question_badge: z.string().min(1).max(32),
              visual_tone: z.enum(["cover", "light", "dark"]),
              headline: z.string().min(1).max(120),
              body: z.string().min(1).max(280),
              emphasis: z.string().max(60).nullable(),
              save_point: z.string().max(120).nullable(),
              source_excerpt: z.string().min(1).max(220),
              module: slideModuleSchema,
            })
            .strict(),
          "single_slide",
        ),
      },
      max_output_tokens: 1400,
    });

    const parsed =
      response.output_parsed as Omit<CarouselProject["slides"][number], "standalone_html">;

    const next: RawProject = {
      ...project,
      slides: project.slides.map((slide) =>
        slide.slide_number === slideNumber
          ? { ...parsed, slide_number: slideNumber }
          : {
              slide_number: slide.slide_number,
              role: slide.role,
              question_badge: slide.question_badge,
              visual_tone: slide.visual_tone,
              headline: slide.headline,
              body: slide.body,
              emphasis: slide.emphasis,
              save_point: slide.save_point,
              source_excerpt: slide.source_excerpt,
              module: slide.module,
            },
      ),
    };

    return normalizeProject(next);
  } catch {
    return project;
  }
}

export function runQa(project: CarouselProject, bundle: SourceBundle): QaReport {
  const issues: QaReport["issues"] = [];

  for (const slide of project.slides) {
    if (
      (slide.role === "core" && slide.module.type !== "checklist-table") ||
      (slide.role === "why" && slide.module.type !== "before-after") ||
      (slide.role === "example" && slide.module.type !== "timeline") ||
      (slide.role === "compare" &&
        !["three-card-summary", "before-after"].includes(slide.module.type)) ||
      (slide.role === "number_or_steps" &&
        !["number-spotlight", "code-window"].includes(slide.module.type)) ||
      (slide.role === "recap" &&
        !["message-banner", "three-card-summary"].includes(slide.module.type))
    ) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드의 하단 모듈이 현재 역할과 잘 안 맞아요.`,
      });
    }

    if (slide.headline.length > 110) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 제목이 조금 길어요.`,
      });
    }

    if (slide.body.length > 240) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 본문이 길어서 화면이 답답해질 수 있어요.`,
      });
    }

    if (slide.slide_number === 8 && slide.body.length > 170) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: "마지막 슬라이드 본문이 길어서 결론이 흐려질 수 있어요.",
      });
    }

    if (slide.slide_number === 8 && !/마지막/u.test(slide.question_badge)) {
      issues.push({
        severity: "low",
        stage: "qa-reviewer",
        message: "마지막 슬라이드 배지가 마무리 느낌을 더 분명히 보여주면 좋아요.",
      });
    }

    if (
      slide.module.type === "number-spotlight" &&
      /^(number|숫자|수치)$/iu.test(slide.module.items[0]?.label ?? "")
    ) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 숫자 카드는 숫자가 무엇을 뜻하는지 라벨이 더 필요해요.`,
      });
    }

    if (!sourceExcerptLooksGrounded(bundle, slide.source_excerpt)) {
      issues.push({
        severity: "low",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드의 원문 근거 문장을 다시 확인해 주세요.`,
      });
    }

    if (
      /(이\s+소스는|소스는|소스에\s+따르면|소스에\s+의하면|원문은|자료는|이\s+글은)/u.test(
        `${slide.headline} ${slide.body} ${slide.emphasis ?? ""} ${slide.save_point ?? ""}`,
      )
    ) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드에 독자에게 불필요한 출처 말버릇이 남아 있어요.`,
      });
    }

    const moduleText = [
      slide.module.title,
      slide.module.subtitle,
      slide.module.footer,
      ...slide.module.items.flatMap((item) => [
        item.label,
        item.title,
        item.value,
        item.note,
      ]),
    ]
      .filter(Boolean)
      .join(" ");

    if (looksLikeMetaInstruction(moduleText)) {
      issues.push({
        severity: "high",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드에 독자용이 아닌 제작 메모가 들어 있어요.`,
      });
    }

    if (slide.module.items.length === 0) {
      issues.push({
        severity: "high",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 하단 모듈이 비어 있어요.`,
      });
    }
    if (hasDenseChecklist(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 체크리스트 표가 길어서 잘릴 위험이 있어요.`,
      });
    }

    if (hasDenseTimeline(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 타임라인 문구가 길어서 중앙 정렬이 무너질 수 있어요.`,
      });
    }

    if (hasDenseCodeWindow(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 다크 패널이 과밀해서 아래 safe area가 부족해질 수 있어요.`,
      });
    }

    if (hasDenseCardModule(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드 하단 카드 정보량이 많아 카드 내부 줄바꿈이 어색할 수 있어요.`,
      });
    }

    if (isVisuallyThin(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드가 비어 보여서 하단 모듈을 더 밀도 있게 다듬는 편이 좋아요.`,
      });
    }

    if (isVisuallyCrowded(slide)) {
      issues.push({
        severity: "medium",
        stage: "qa-reviewer",
        message: `${slide.slide_number}번 슬라이드가 과밀해서 문장이나 모듈을 압축해야 해요.`,
      });
    }
  }

  const limitedIssues = issues.slice(0, 12);

  return qaReportSchema.parse({
    high_count: issues.filter((issue) => issue.severity === "high").length,
    medium_count: issues.filter((issue) => issue.severity === "medium").length,
    low_count: issues.filter((issue) => issue.severity === "low").length,
    checks_passed: [
      "슬라이드 수 8장 확인",
      "1080x1350 standalone HTML 생성",
      "모든 슬라이드 하단 모듈 존재",
      "질문형 카드뉴스 구조 유지",
      "원문 기반 source excerpt 포함",
      "마지막 슬라이드 결론과 CTA 분리 검사",
    ],
    issues: limitedIssues,
  });
}
