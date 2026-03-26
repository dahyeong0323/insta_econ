import {
  findSimilarPublishedContentInHistory,
  listPublishedContent,
  type PublishedContentListItem,
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

export type SimilarityOperatorGuide = {
  badge: "CLEAR" | "REVIEW" | "BLOCK";
  headline: string;
  summary: string;
  recommendedAction: string;
  detailLines: string[];
};

export type SimilarityCheckInput = {
  title: string;
  keyTerms?: string[];
  summary?: string | null;
  conceptId?: string | null;
  topicId?: string | null;
  aliases?: string[];
};

export const similarityThresholds = {
  blockScore: 0.76,
  reviewScore: 0.48,
  blockSharedTerms: 3,
  reviewSharedTerms: 2,
  exactHistoryLimit: 240,
  similarityHistoryLimit: 120,
} as const;

function normalizeTopic(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormalizedTopicSet(input: SimilarityCheckInput) {
  return new Set(
    [input.title, ...(input.aliases ?? [])]
      .map((value) => normalizeTopic(value))
      .filter(Boolean),
  );
}

function exactTopicMatchByMetadata(
  history: PublishedContentListItem[],
  input: SimilarityCheckInput,
) {
  return (
    history.find((item) => {
      if (input.conceptId && item.researchContext?.conceptId === input.conceptId) {
        return true;
      }

      if (input.topicId && item.researchContext?.topicId === input.topicId) {
        return true;
      }

      return false;
    }) ?? null
  );
}

function exactTopicMatchByTitleOrAlias(
  history: PublishedContentListItem[],
  input: SimilarityCheckInput,
) {
  const normalizedCandidates = buildNormalizedTopicSet(input);

  if (normalizedCandidates.size === 0) {
    return null;
  }

  return (
    history.find((item) => {
      if (normalizedCandidates.has(item.canonicalTopic)) {
        return true;
      }

      const historyAliases = (item.researchContext?.topicAliases ?? []).map((alias) =>
        normalizeTopic(alias),
      );

      return historyAliases.some((alias) => normalizedCandidates.has(alias));
    }) ?? null
  );
}

function buildReason(match: SimilarContentMatch, severity: "block" | "review") {
  const overlapText =
    match.sharedTerms.length > 0
      ? `공통 키워드: ${match.sharedTerms.join(", ")}`
      : "공통 키워드는 적지만 설명 각도가 매우 가깝습니다";

  return severity === "block"
    ? `${match.title}와 지나치게 가깝습니다. (${overlapText}, score ${match.score})`
    : `${match.title}와 설명 각도가 일부 겹칩니다. (${overlapText}, score ${match.score})`;
}

function buildExactMatchReason(
  match: PublishedContentListItem,
  input: SimilarityCheckInput,
) {
  if (input.conceptId && match.researchContext?.conceptId === input.conceptId) {
    return `${match.title}와 같은 핵심 개념(conceptId)이 이미 게시되었습니다. 새 설명 각도나 다음 단계 개념으로 바꿔야 합니다.`;
  }

  if (input.topicId && match.researchContext?.topicId === input.topicId) {
    return `${match.title}와 같은 research topic이 이미 게시되었습니다. 같은 주제를 다시 올리지 않도록 다른 주제를 고르세요.`;
  }

  return `${match.title}와 제목 또는 alias가 사실상 같습니다. 같은 개념의 재탕이 아닌지 다시 확인해야 합니다.`;
}

export function evaluateCandidateSimilarityAgainstHistory(
  input: SimilarityCheckInput,
  history: PublishedContentListItem[],
): SimilarityCheckResult {
  const exactTopicMatch =
    exactTopicMatchByMetadata(history, input) ?? exactTopicMatchByTitleOrAlias(history, input);
  const matches = findSimilarPublishedContentInHistory({
    title: input.title,
    keyTerms: input.keyTerms ?? [],
    summary: input.summary ?? "",
    aliases: input.aliases ?? [],
    history,
    limit: similarityThresholds.similarityHistoryLimit,
    minScore: 0.18,
  }).slice(0, 5);
  const reasons: string[] = [];

  if (exactTopicMatch) {
    reasons.push(buildExactMatchReason(exactTopicMatch, input));

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
    reasons: ["최근 게시 이력과 비교했을 때 주제 중복이나 설명 각도 충돌이 뚜렷하지 않습니다."],
    exactTopicMatch: null,
    matches,
  };
}

export async function evaluateCandidateSimilarity(
  input: SimilarityCheckInput,
): Promise<SimilarityCheckResult> {
  const history = await listPublishedContent(similarityThresholds.exactHistoryLimit, {
    includeResearchContext: true,
  });

  return evaluateCandidateSimilarityAgainstHistory(input, history);
}

export function getSimilarityOperatorGuide(
  similarity: SimilarityCheckResult,
): SimilarityOperatorGuide {
  const detailLines = similarity.reasons.slice(0, 3);

  if (similarity.decision === "block") {
    if (similarity.exactTopicMatch) {
      return {
        badge: "BLOCK",
        headline: "이미 게시한 주제와 직접 겹칩니다.",
        summary: `${similarity.exactTopicMatch.title}와 같은 주제 축으로 판단돼 재게시 위험이 큽니다.`,
        recommendedAction: "이 주제는 멈추고 다른 topic 또는 다른 개념 축으로 다시 고르세요.",
        detailLines,
      };
    }

    return {
      badge: "BLOCK",
      headline: "최근 게시물과 너무 가깝습니다.",
      summary: "핵심 용어나 설명 각도가 겹쳐 그대로 진행하면 재탕처럼 보일 수 있습니다.",
      recommendedAction: "같은 개념을 유지하더라도 질문, 예시, 설명 각도를 크게 바꾸지 않으면 중단하세요.",
      detailLines,
    };
  }

  if (similarity.decision === "review") {
    return {
      badge: "REVIEW",
      headline: "유사 게시물이 있어 운영 검토가 필요합니다.",
      summary: "완전 중복은 아니지만 최근 게시물과 설명 각도가 가까울 수 있습니다.",
      recommendedAction: "같은 용어를 써도 질문 방식, 비유, 학생 상황 예시가 충분히 달라지는지 확인하세요.",
      detailLines,
    };
  }

  return {
    badge: "CLEAR",
    headline: "최근 게시 이력과 직접 충돌하지 않습니다.",
    summary: "지금 기준으로는 같은 주제 재게시나 과한 유사성 위험이 낮습니다.",
    recommendedAction: "다음 단계로 진행해도 됩니다.",
    detailLines,
  };
}
