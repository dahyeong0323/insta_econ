import {
  type CarouselProject,
  type Slide,
  type SlideModule,
  type SourceBundle,
} from "@/lib/agents/schema";
import { withStandaloneHtml } from "@/lib/agents/render";

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
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

function splitSentences(text: string) {
  return unique(
    text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+|\n+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 18),
  );
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`;
}

function cleanLeadIn(text: string) {
  return text
    .replace(/\b(이\s+소스는|소스는|소스에\s+따르면|소스에\s+의하면|원문은|자료는|이\s+글은)\s+/gu, "")
    .trim();
}

export function buildFallbackSourceBundle(
  rawText: string,
  extractedText: string,
  title?: string | null,
): SourceBundle {
  const lineItems = ensureMinLength(splitSentences(extractedText), 4, [
    "핵심 개념을 한 문장씩 다시 풀어 설명해요.",
    "왜 그런지 원인과 결과를 함께 봐야 이해가 쉬워져요.",
    "생활과 연결하면 개념이 훨씬 오래 남아요.",
    "숫자가 없더라도 구조를 보면 핵심을 잡을 수 있어요.",
  ]);
  const numbers =
    extractedText.match(/\d+(?:[.,]\d+)?%?|\d+\s?(?:개|명|번|배|년|원)/g) ?? [];
  const terms = ensureMinLength(
    unique(
      extractedText.match(/[A-Za-z가-힣]{3,20}/g)?.filter((term) => term.length >= 3) ?? [],
    ),
    3,
    ["가치 저장", "가격 신호", "선택"],
  );

  return {
    raw_text: rawText,
    extracted_text: extractedText,
    source_title:
      title?.trim() || truncate(lineItems[0] || "경제 개념 카드뉴스", 44),
    source_summary: truncate(
      cleanLeadIn(
        `${lineItems[0] ?? ""} ${lineItems[1] ?? ""}`.trim() || extractedText,
      ),
      220,
    ),
    key_terms: terms.slice(0, 6),
    facts: lineItems.slice(0, 8).map((fact) => ({
      fact: truncate(cleanLeadIn(fact), 160),
      source_excerpt: truncate(fact, 180),
    })),
    numbers: unique(numbers).slice(0, 8),
    quote_candidates: lineItems.slice(0, 4).map((item) => truncate(item, 120)),
    simplification_notes: [
      "어려운 용어는 한 번 쉬운 말로 풀어 설명합니다.",
      "한 슬라이드에는 개념 하나만 남기고 나머지는 압축합니다.",
      "숫자가 없으면 비교 구조나 단계 설명으로 바꿉니다.",
    ],
  };
}

function moduleCards(type: SlideModule["type"], values: string[]): SlideModule {
  const source = values.filter(Boolean).map(cleanLeadIn);

  if (type === "message-banner") {
    return {
      type,
      title: "관통 메시지",
      subtitle: null,
      items: [
        {
          label: "한 줄 핵심",
          title: "핵심을 한 번에",
          value: truncate(
            source[0] || "경제는 용어를 외우는 과목이 아니라 구조를 이해하는 과목이에요.",
            80,
          ),
          note: null,
          accent: "orange",
        },
      ],
      footer: null,
    };
  }

  if (type === "timeline") {
    return {
      type,
      title: "흐름으로 보기",
      subtitle: null,
      items: source.slice(0, 4).map((value, index) => ({
        label: String(index + 1),
        title: `단계 ${index + 1}`,
        value: truncate(value, 48),
        note: null,
        accent: ["orange", "yellow", "blue", "green"][index] as
          | "orange"
          | "yellow"
          | "blue"
          | "green",
      })),
      footer: "순서대로 읽으면 구조가 더 잘 보여요.",
    };
  }

  if (type === "code-window") {
    return {
      type,
      title: "핵심 정리",
      subtitle: null,
      items: source.slice(0, 4).map((value, index) => ({
        label: `#${index + 1}`,
        title: `포인트 ${index + 1}`,
        value: truncate(value, 64),
        note: null,
        accent: "dark",
      })),
      footer: null,
    };
  }

  const palette: SlideModule["items"][number]["accent"][] = [
    "orange",
    "blue",
    "green",
    "pink",
    "yellow",
  ];

  return {
    type,
    title:
      type === "before-after"
        ? "비교해서 보기"
        : type === "number-spotlight"
          ? "숫자로 보면"
          : type === "checklist-table"
            ? "핵심 체크"
            : "핵심 묶음",
    subtitle: null,
    items: source.slice(0, 4).map((value, index) => ({
      label:
        type === "before-after"
          ? index === 0
            ? "오해"
            : "실제"
          : `포인트 ${index + 1}`,
      title: truncate(value, 26),
      value: truncate(value, 62),
      note: null,
      accent: palette[index] ?? "orange",
    })),
    footer:
      type === "before-after"
        ? "겉으로 보이는 것과 실제 구조를 나눠서 봅니다."
        : null,
  };
}

export function buildFallbackProject(bundle: SourceBundle): CarouselProject {
  const facts = bundle.facts.map((item) => cleanLeadIn(item.fact));
  const title = truncate(bundle.source_title, 54);
  const numbers = bundle.numbers;
  const modules: SlideModule["type"][] = [
    "message-banner",
    "role-strip",
    "timeline",
    "three-card-summary",
    "before-after",
    numbers.length > 0 ? "number-spotlight" : "checklist-table",
    "three-card-summary",
    "message-banner",
  ];

  const slideData: Omit<Slide, "standalone_html">[] = [
    {
      slide_number: 1,
      role: "hook",
      visual_tone: "cover",
      question_badge: "보리의 10대를 위한 경제",
      headline: `${title}\n왜 중요할까?`,
      body: truncate(bundle.source_summary, 100),
      emphasis: "핵심은 구조예요",
      save_point: "용어보다 먼저, 무슨 원리인지부터 잡아볼게요.",
      source_excerpt: bundle.facts[0]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards("message-banner", [
        "경제 개념은 정의만 외우기보다 왜 그런지 이해하는 게 중요해요.",
      ]),
    },
    {
      slide_number: 2,
      role: "core",
      visual_tone: "light",
      question_badge: "Q1",
      headline: "이 글의 핵심은 뭐야?",
      body: truncate(bundle.source_summary, 170),
      emphasis: truncate(bundle.key_terms[0] || "핵심 개념", 16),
      save_point: "한 문장으로 줄이면 이해가 훨씬 쉬워져요.",
      source_excerpt: bundle.facts[0]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(modules[1], facts.slice(0, 3)),
    },
    {
      slide_number: 3,
      role: "why",
      visual_tone: "light",
      question_badge: "Q2",
      headline: "왜 이런 결과가 생길까?",
      body: truncate(facts[1] || facts[0] || bundle.source_summary, 170),
      emphasis: "원인과 결과",
      save_point: "중간 과정을 보면 개념이 더 또렷해져요.",
      source_excerpt: bundle.facts[1]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(modules[2], facts.slice(1, 5)),
    },
    {
      slide_number: 4,
      role: "example",
      visual_tone: "light",
      question_badge: "Q3",
      headline: "우리 생활에서는 어떻게 보일까?",
      body: truncate(facts[2] || bundle.source_summary, 170),
      emphasis: "생활 속 예시",
      save_point: "가깝게 연결하면 개념이 오래 남아요.",
      source_excerpt: bundle.facts[2]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(modules[3], facts.slice(2, 5)),
    },
    {
      slide_number: 5,
      role: "compare",
      visual_tone: "light",
      question_badge: "Q4",
      headline: "헷갈리는 포인트는 뭐야?",
      body: truncate(facts[3] || bundle.source_summary, 170),
      emphasis: "오해 vs 실제",
      save_point: "겉모습보다 구조를 보면 덜 헷갈려요.",
      source_excerpt: bundle.facts[3]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(modules[4], [
        "겉으로 보이는 현상",
        "경제적으로 다시 보면 보이는 구조",
      ]),
    },
    {
      slide_number: 6,
      role: "number_or_steps",
      visual_tone: "light",
      question_badge: "Q5",
      headline:
        numbers.length > 0 ? "숫자로 보면 뭐가 더 잘 보일까?" : "단계로 정리하면?",
      body: truncate(facts[4] || bundle.source_summary, 170),
      emphasis: numbers[0] ?? "단계 정리",
      save_point: "숫자가 없을 땐 흐름만 정리해도 충분히 이해돼요.",
      source_excerpt: bundle.facts[4]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(
        modules[5],
        numbers.length > 0 ? numbers : facts.slice(0, 4),
      ),
    },
    {
      slide_number: 7,
      role: "recap",
      visual_tone: "light",
      question_badge: "Q6",
      headline: "시험이나 실생활에선 뭘 기억하면 돼?",
      body: "마지막으로 세 가지만 남기면 충분해요.",
      emphasis: "핵심 3줄",
      save_point: "스크린샷처럼 저장해두고 다시 보기 좋은 정리예요.",
      source_excerpt: bundle.facts[0]?.source_excerpt ?? bundle.source_summary,
      module: moduleCards(modules[6], facts.slice(0, 3)),
    },
    {
      slide_number: 8,
      role: "closing",
      visual_tone: "dark",
      question_badge: "Q. 마지막으로",
      headline: "결국 경제는 구조를 읽는 힘이에요",
      body: "핵심 원리를 한 번 이해하면 다음 개념도 더 빨리 연결돼요.",
      emphasis: "개념은 연결될수록 쉬워져요",
      save_point: "저장해두고 다음 경제 개념과 이어서 보면 더 잘 잡혀요.",
      source_excerpt: bundle.quote_candidates[0] ?? bundle.source_summary,
      module: moduleCards(modules[7], [
        "핵심을 기억해두면 다음 경제 개념을 배울 때 연결이 훨씬 쉬워져요.",
      ]),
    },
  ];

  return withStandaloneHtml({
    brand_label: "보리의 10대를 위한 경제",
    project_title: title,
    audience: "middle_school",
    language: "ko",
    theme_name: "Interview Orange",
    caption: `${bundle.source_summary}

중학생도 바로 이해할 수 있게 다시 풀어낸 경제 카드뉴스입니다.
저장해두고 시험 전에 다시 꺼내 보기 좋아요.

#경제공부 #중학생경제 #경제개념 #사회공부`,
    slides: slideData,
  });
}
