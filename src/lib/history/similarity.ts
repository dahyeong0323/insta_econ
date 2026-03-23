import {
  findSimilarPublishedContent,
  listPublishedContent,
  type SimilarContentMatch,
} from "@/lib/history/storage";

export type SimilarityDecision = "clear" | "review" | "block";

export type SimilarityCheckResult = {
  decision: SimilarityDecision;
  reasons: string[];
  exactTopicMatch: {
    runId: string;
    title: string;
    publishedAt: string;
    permalink: string | null;
  } | null;
  matches: SimilarContentMatch[];
};

export const similarityThresholds = {
  blockScore: 0.78,
  reviewScore: 0.5,
  blockSharedTerms: 3,
  reviewSharedTerms: 2,
  historyLimit: 60,
} as const;

function normalizeTopic(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReason(match: SimilarContentMatch, severity: "block" | "review") {
  const overlapText =
    match.sharedTerms.length > 0
      ? `공통 키워드: ${match.sharedTerms.join(", ")}`
      : "공통 키워드는 적지만 전체 개념 유사도가 높음";

  return severity === "block"
    ? `${match.title}와 너무 가깝습니다. (${overlapText}, score ${match.score})`
    : `${match.title}와 각도가 겹칠 수 있습니다. (${overlapText}, score ${match.score})`;
}

export async function evaluateCandidateSimilarity(input: {
  title: string;
  keyTerms?: string[];
  summary?: string | null;
}): Promise<SimilarityCheckResult> {
  const normalizedTitle = normalizeTopic(input.title);
  const history = await listPublishedContent(similarityThresholds.historyLimit);
  const exactTopicMatch =
    normalizedTitle.length > 0
      ? history.find((item) => item.canonicalTopic === normalizedTitle) ?? null
      : null;
  const matches = (await findSimilarPublishedContent({
    title: input.title,
    keyTerms: input.keyTerms ?? [],
    summary: input.summary ?? "",
    limit: similarityThresholds.historyLimit,
    minScore: 0.18,
  })).slice(0, 5);
  const reasons: string[] = [];

  if (exactTopicMatch) {
    reasons.push(
      `${exactTopicMatch.title}와 주제명이 사실상 같습니다. 새로운 개념 또는 다른 설명 축으로 바꿔야 합니다.`,
    );

    return {
      decision: "block",
      reasons,
      exactTopicMatch: {
        runId: exactTopicMatch.runId,
        title: exactTopicMatch.title,
        publishedAt: exactTopicMatch.publishedAt,
        permalink: exactTopicMatch.permalink,
      },
      matches,
    };
  }

  const blockingMatches = matches.filter(
    (match) =>
      match.score >= similarityThresholds.blockScore ||
      match.sharedTerms.length >= similarityThresholds.blockSharedTerms,
  );

  if (blockingMatches.length > 0) {
    reasons.push(...blockingMatches.slice(0, 2).map((match) => buildReason(match, "block")));

    return {
      decision: "block",
      reasons,
      exactTopicMatch: null,
      matches,
    };
  }

  const reviewMatches = matches.filter(
    (match) =>
      match.score >= similarityThresholds.reviewScore ||
      match.sharedTerms.length >= similarityThresholds.reviewSharedTerms,
  );

  if (reviewMatches.length > 0) {
    reasons.push(...reviewMatches.slice(0, 3).map((match) => buildReason(match, "review")));

    return {
      decision: "review",
      reasons,
      exactTopicMatch: null,
      matches,
    };
  }

  return {
    decision: "clear",
    reasons: ["최근 게시 이력과 비교했을 때 뚜렷한 중복이나 과도한 유사성이 없습니다."],
    exactTopicMatch: null,
    matches,
  };
}
