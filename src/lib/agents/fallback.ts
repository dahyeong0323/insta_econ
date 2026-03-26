import {
  buildDefaultEditorialPlan,
  brandText,
  chooseEditorialSlideCount,
  editorialThemeLabel,
  getQuestionBadge,
} from "@/lib/design/editorial-core";
import {
  type CarouselProject,
  type DesignPlan,
  type DesignPlanSlide,
  type LayoutPattern,
  type ModuleType,
  type Slide,
  type SlideModule,
  type SourceBundle,
} from "@/lib/agents/schema";
import { withStandaloneHtml } from "@/lib/agents/render";

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function splitSentences(text: string) {
  return unique(
    text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+|\n+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 12),
  );
}

function truncate(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trim()}…`;
}

function cleanLeadIn(text: string) {
  return text
    .replace(/\b(텍스트를 읽으면|자료에 따르면|본문에서|자료에서는)\s+/gu, "")
    .trim();
}

function ensureMinLength(items: string[], min: number, filler: string[]) {
  const next = [...items];

  for (const value of filler) {
    if (next.length >= min) {
      break;
    }

    if (!next.includes(value)) {
      next.push(value);
    }
  }

  return next;
}

export function buildFallbackSourceBundle(
  rawText: string,
  extractedText: string,
  title?: string | null,
): SourceBundle {
  const facts = ensureMinLength(splitSentences(extractedText), 4, [
    "경제 개념은 정의 하나만 외우기보다 왜 그런지 연결해서 봐야 이해가 됩니다.",
    "눈에 보이는 현상과 실제 구조가 다를 수 있다는 점을 함께 설명해야 합니다.",
    "학생이 겪는 용돈, 소비, 가격, 저축 예시로 바꾸면 개념이 더 오래 남습니다.",
    "숫자가 없어도 비교와 흐름으로 설명하면 핵심을 충분히 전달할 수 있습니다.",
  ]);
  const numbers =
    extractedText.match(/\d+(?:[.,]\d+)?%?|\d+\s?(?:개|명|번|원|배|배율)/gu) ?? [];
  const keyTerms = ensureMinLength(
    unique(
      extractedText.match(/[A-Za-z가-힣]{3,20}/gu)?.filter((term) => term.length >= 3) ?? [],
    ),
    3,
    ["물가", "가격", "저축"],
  );

  return {
    raw_text: rawText || extractedText,
    extracted_text: extractedText || rawText,
    source_title: truncate(title?.trim() || "경제 개념 카드뉴스", 80),
    source_summary: truncate(cleanLeadIn(facts.slice(0, 2).join(" ")), 240),
    key_terms: keyTerms.slice(0, 6),
    facts: facts.slice(0, 8).map((fact) => ({
      fact: truncate(cleanLeadIn(fact), 180),
      source_excerpt: truncate(fact, 220),
    })),
    numbers: unique(numbers).slice(0, 8),
    quote_candidates: facts.slice(0, 4).map((fact) => truncate(fact, 140)),
    simplification_notes: [
      "어려운 용어는 바로 풀어서 설명합니다.",
      "한 슬라이드에는 한 메시지만 남깁니다.",
      "생활 예시와 경제 구조를 함께 연결합니다.",
    ],
  };
}

function getFallbackSlideCount(bundle: SourceBundle) {
  return chooseEditorialSlideCount(bundle.facts.length, bundle.numbers.length);
}

function patternModuleType(pattern: LayoutPattern): ModuleType {
  switch (pattern) {
    case "qa-checklist":
      return "checklist-table";
    case "qa-before-after":
      return "before-after";
    case "qa-role-strip":
      return "role-strip";
    case "qa-code-window":
      return "code-window";
    case "qa-timeline":
      return "timeline";
    case "qa-three-card":
      return "three-card-summary";
    case "qa-message-banner":
    case "cover-hero":
    case "closing-statement":
    default:
      return "message-banner";
  }
}


export function buildFallbackDesignPlan(bundle: SourceBundle): DesignPlan {
  return buildDefaultEditorialPlan(getFallbackSlideCount(bundle));
}

function buildModuleFromFacts(
  type: ModuleType,
  title: string,
  values: string[],
): SlideModule {
  const safeValues = values.length > 0 ? values : [title, title];
  const ensureValueCount = (min: number) => {
    const padded = [...safeValues];

    while (padded.length < min) {
      padded.push(safeValues[padded.length % safeValues.length] || title);
    }

    return padded;
  };

  if (type === "checklist-table") {
    const moduleValues = ensureValueCount(3);

    return {
      type,
      title,
      subtitle: null,
      items: moduleValues.slice(0, 4).map((value, index) => ({
        label: `체크 ${index + 1}`,
        title: truncate(value, 28),
        value: truncate(value, 40),
        note: null,
        accent: "orange",
      })),
      footer: null,
    };
  }

  if (type === "before-after") {
    const moduleValues = ensureValueCount(2);

    return {
      type,
      title: "Before / After",
      subtitle: null,
      items: moduleValues.slice(0, 2).map((value, index) => ({
        label: index === 0 ? "Before" : "After",
        title: truncate(value, 24),
        value: truncate(value, 52),
        note: null,
        accent: index === 0 ? "pink" : "green",
      })),
      footer: "겉으로 보이는 설명과 실제 구조를 나눠서 보면 더 잘 이해됩니다.",
    };
  }

  if (type === "role-strip") {
    const moduleValues = ensureValueCount(3);

    return {
      type,
      title,
      subtitle: null,
      items: moduleValues.slice(0, 4).map((value, index) => ({
        label: ["핵심", "원인", "차이", "기억"][index] || `포인트 ${index + 1}`,
        title: truncate(value, 18),
        value: truncate(value, 20),
        note: null,
        accent: (["orange", "blue", "green", "pink"] as const)[index] ?? "orange",
      })),
      footer: null,
    };
  }

  if (type === "code-window") {
    const moduleValues = ensureValueCount(3);

    return {
      type,
      title: "핵심 노트",
      subtitle: null,
      items: moduleValues.slice(0, 4).map((value, index) => ({
        label: `#${index + 1}`,
        title: `포인트 ${index + 1}`,
        value: truncate(value, 80),
        note: null,
        accent: "dark",
      })),
      footer: null,
    };
  }

  if (type === "timeline") {
    const moduleValues = ensureValueCount(3);

    return {
      type,
      title: "흐름으로 보기",
      subtitle: null,
      items: moduleValues.slice(0, 4).map((value, index) => ({
        label: String(index + 1),
        title: truncate(value, 18),
        value: truncate(value, 34),
        note: null,
        accent: (["orange", "yellow", "blue", "green"] as const)[index] ?? "orange",
      })),
      footer: "순서를 잡으면 개념이 더 쉽게 연결됩니다.",
    };
  }

  if (type === "three-card-summary") {
    const moduleValues = ensureValueCount(3);

    return {
      type,
      title,
      subtitle: null,
      items: moduleValues.slice(0, 3).map((value, index) => ({
        label: ["핵심", "오해", "기억"][index] || `포인트 ${index + 1}`,
        title: truncate(value, 22),
        value: truncate(value, 48),
        note: null,
        accent: (["orange", "blue", "green"] as const)[index] ?? "orange",
      })),
      footer: null,
    };
  }

  return {
    type: "message-banner",
    title: "관통 메시지",
    subtitle: null,
    items: [
      {
        label: "핵심",
        title: truncate(safeValues[0] || title, 28),
        value: truncate(safeValues[1] || safeValues[0] || "한 문장으로 기억할 수 있게 정리했습니다.", 72),
        note: null,
        accent: "orange",
      },
    ],
    footer: null,
  };
}

function buildSlideCopy(
  bundle: SourceBundle,
  planSlide: DesignPlanSlide,
  totalSlides: number,
  facts: string[],
): Omit<Slide, "standalone_html" | "module"> {
  const term = bundle.key_terms[0] || "이 개념";
  const primary = facts[planSlide.slide_number - 1] || facts[0] || bundle.source_summary;
  const secondary = facts[planSlide.slide_number] || facts[1] || bundle.source_summary;

  if (planSlide.role === "hook") {
    return {
      slide_number: planSlide.slide_number,
      role: planSlide.role,
      visual_tone: planSlide.visual_tone,
      layout_pattern: planSlide.layout_pattern,
      narrative_phase: planSlide.narrative_phase,
      module_weight: planSlide.module_weight,
      text_density: planSlide.text_density,
      question_badge: getQuestionBadge(planSlide.slide_number, totalSlides),
      headline: `${term}\n왜 헷갈릴까요?`,
      body: truncate(`${cleanLeadIn(bundle.source_summary)} 핵심부터 빠르게 잡아볼게요.`, 110),
      emphasis: "정의보다 구조가 먼저 보여야 해요",
      save_point: truncate(primary, 72),
      source_excerpt: bundle.facts[0]?.source_excerpt ?? bundle.source_summary,
    };
  }

  if (planSlide.role === "closing") {
    return {
      slide_number: planSlide.slide_number,
      role: planSlide.role,
      visual_tone: planSlide.visual_tone,
      layout_pattern: planSlide.layout_pattern,
      narrative_phase: planSlide.narrative_phase,
      module_weight: planSlide.module_weight,
      text_density: planSlide.text_density,
      question_badge: getQuestionBadge(planSlide.slide_number, totalSlides),
      headline: `${term}, 이제\n한 문장으로 남겨볼까요?`,
      body: truncate("경제 개념은 외우는 것보다 연결해서 볼 때 오래 남습니다.", 140),
      emphasis: "정의보다 연결",
      save_point: truncate(`${term}는 생활 속 선택과 연결해서 기억하면 더 오래 남습니다.`, 72),
      source_excerpt: bundle.quote_candidates[0] ?? bundle.source_summary,
    };
  }

  return {
    slide_number: planSlide.slide_number,
    role: planSlide.role,
    visual_tone: planSlide.visual_tone,
    layout_pattern: planSlide.layout_pattern,
    narrative_phase: planSlide.narrative_phase,
    module_weight: planSlide.module_weight,
    text_density: planSlide.text_density,
    question_badge: getQuestionBadge(planSlide.slide_number, totalSlides),
    headline: truncate(planSlide.question_angle, 60),
    body: truncate(`${cleanLeadIn(primary)} ${cleanLeadIn(secondary)}`.trim(), 220),
    emphasis: truncate(bundle.key_terms[planSlide.slide_number % bundle.key_terms.length] || term, 42),
    save_point: truncate(cleanLeadIn(primary), 96),
    source_excerpt:
      bundle.facts[Math.min(planSlide.slide_number - 1, bundle.facts.length - 1)]?.source_excerpt ??
      bundle.source_summary,
  };
}

export function buildFallbackProject(
  bundle: SourceBundle,
  plan = buildFallbackDesignPlan(bundle),
): CarouselProject {
  const facts = bundle.facts.map((item) => cleanLeadIn(item.fact));
  const totalSlides = plan.slides.length;

  const slides: Omit<Slide, "standalone_html">[] = plan.slides.map((planSlide) => ({
    ...buildSlideCopy(bundle, planSlide, totalSlides, facts),
    module: buildModuleFromFacts(
      patternModuleType(planSlide.layout_pattern),
      planSlide.question_angle,
      facts.slice(Math.max(0, planSlide.slide_number - 1)),
    ),
  }));

  return withStandaloneHtml({
    brand_label: brandText,
    project_title: truncate(bundle.source_title || editorialThemeLabel, 80),
    audience: "middle_school",
    language: "ko",
    theme_name: plan.theme_name,
    caption: `${bundle.source_summary}\n\n중학생도 바로 이해할 수 있게 핵심만 다시 정리한 경제 카드뉴스입니다.`,
    slides,
  });
}
