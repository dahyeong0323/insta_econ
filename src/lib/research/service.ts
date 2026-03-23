import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { type RunState } from "@/lib/agents/schema";
import { getAudienceInstructions } from "@/lib/agents/prompts";
import {
  evaluateCandidateSimilarity,
  evaluateCandidateSimilarityAgainstHistory,
  type SimilarityCheckResult,
} from "@/lib/history/similarity";
import { listPublishedContent, type PublishedContentListItem } from "@/lib/history/storage";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram/client";
import {
  buildApprovalInlineKeyboard,
  buildScriptApprovalMessage,
} from "@/lib/integrations/telegram/messages";
import { getOpenAIClient, getTextModel } from "@/lib/openai/client";
import {
  type ResearchPreviousTopicLink,
  type ResearchSelectionMetadata,
  researchSelectionMetadataSchema,
} from "@/lib/research/metadata";
import {
  ResearchDispatchBusyError,
  withResearchDispatchLock,
} from "@/lib/research/scheduler";
import {
  createRunRecord,
  failRun,
  requestRunApproval,
} from "@/lib/runs/processor";
import {
  listRunIds,
  readRunState,
  writeArtifact,
} from "@/lib/runs/storage";
import { middleSchoolEconomicsTopics, researchTopicById, type ResearchTopic } from "@/lib/research/topics";

const researchDraftSchema = z
  .object({
    title: z.string().min(1).max(120),
    source_text: z.string().min(120).max(4000),
    summary: z.string().min(1).max(320),
    key_terms: z.array(z.string().min(1).max(40)).min(3).max(8),
    approval_note: z.string().min(1).max(300),
  })
  .strict();

const researchTopicChooserSchema = z
  .object({
    topicId: z.string().min(1).max(120),
    selection_reason: z.string().min(1).max(400),
    operator_focus: z.string().min(1).max(220),
  })
  .strict();

const dispatchResearchSchema = z
  .object({
    topicId: z.string().max(120).optional(),
    allowReviewMatch: z.boolean().optional().default(true),
    sendToTelegram: z.boolean().optional().default(true),
    chatId: z.string().max(120).optional(),
    force: z.boolean().optional().default(false),
  })
  .strict();

export type DispatchResearchInput = z.input<typeof dispatchResearchSchema>;
type ResearchDraft = z.infer<typeof researchDraftSchema>;

type ResearchSelectionCandidate = {
  topic: ResearchTopic;
  similarity: SimilarityCheckResult;
  heuristicScore: number;
  heuristicReasons: string[];
  previousTopicLink: ResearchPreviousTopicLink | null;
};

type ResearchSelectionDiagnostic = {
  topicId: string;
  title: string;
  decision: SimilarityCheckResult["decision"];
  heuristicScore: number;
  topSimilarityScore: number;
  seriesId: string;
  seriesOrder: number;
  reasons: string[];
};

type ResearchSelection = {
  topic: ResearchTopic;
  similarity: SimilarityCheckResult;
  metadata: ResearchSelectionMetadata;
  diagnostics: ResearchSelectionDiagnostic[];
};

type ResearchHistoryContext = {
  recentPublished: Array<{
    runId: string;
    title: string;
    publishedAt: string;
    keyTerms: string[];
    conceptSummary: string;
    seriesTitle: string | null;
    curriculumPosition: string | null;
  }>;
  similarMatches: Array<{
    runId: string;
    title: string;
    publishedAt: string;
    score: number;
    sharedTerms: string[];
  }>;
  selectionPlan: {
    seriesTitle: string;
    seriesOrder: number;
    curriculumPosition: string;
    narrativeArc: string;
    teachingAngle: string;
    previousTopicLink: ResearchPreviousTopicLink | null;
    selectionReason: string;
    operatorFocus: string;
  };
};

type ActiveRunSummary = Pick<
  RunState,
  "id" | "workflow_status" | "status" | "updated_at" | "title"
>;

const activeRunStaleAfterMs = 6 * 60 * 60 * 1000;

export type DispatchResearchResult =
  | {
      status: "dispatched";
      run: RunState;
      selection: ResearchSelection;
      historyContext: ResearchHistoryContext;
      draft: ResearchDraft;
    }
  | {
      status: "skipped";
      reason: "active_run" | "dispatch_locked";
      message: string;
      activeRun: ActiveRunSummary | null;
    };

function isTerminalWorkflowStatus(run: RunState) {
  return run.workflow_status === "published" || run.workflow_status === "failed";
}

function getRunAgeMs(run: Pick<RunState, "updated_at">) {
  return Date.now() - new Date(run.updated_at).getTime();
}

function isStaleActiveRun(run: RunState) {
  return getRunAgeMs(run) > activeRunStaleAfterMs;
}

function summarizeActiveRun(run: RunState): ActiveRunSummary {
  return {
    id: run.id,
    workflow_status: run.workflow_status,
    status: run.status,
    updated_at: run.updated_at,
    title: run.title,
  };
}

async function findLatestActiveRun() {
  const runIds = await listRunIds();
  const activeRuns: RunState[] = [];

  for (const runId of runIds) {
    const run = await readRunState(runId).catch(() => null);

    if (!run || isTerminalWorkflowStatus(run)) {
      continue;
    }

    activeRuns.push(run);
  }

  activeRuns.sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );

  let latestActiveRun: RunState | null = null;

  for (const run of activeRuns) {
    if (isStaleActiveRun(run)) {
      await failRun(
        run.id,
        `Run auto-failed because it had been inactive for more than ${Math.round(
          activeRunStaleAfterMs / (60 * 60 * 1000),
        )} hours.`,
      ).catch(() => undefined);
      continue;
    }

    if (!latestActiveRun) {
      latestActiveRun = run;
    }
  }

  return latestActiveRun;
}

function findPreviousTopicLink(
  topic: ResearchTopic,
  history: PublishedContentListItem[],
): ResearchPreviousTopicLink | null {
  const seriesNext = history.find(
    (item) =>
      item.researchContext?.seriesId === topic.series.id &&
      item.researchContext.seriesOrder === topic.seriesOrder - 1,
  );

  if (seriesNext) {
    return {
      runId: seriesNext.runId,
      topicId: seriesNext.researchContext?.topicId ?? null,
      title: seriesNext.title,
      publishedAt: seriesNext.publishedAt,
      relationship: "series_next",
    };
  }

  const sameSeries = history.find((item) => item.researchContext?.seriesId === topic.series.id);

  if (sameSeries) {
    return {
      runId: sameSeries.runId,
      topicId: sameSeries.researchContext?.topicId ?? null,
      title: sameSeries.title,
      publishedAt: sameSeries.publishedAt,
      relationship: "series_context",
    };
  }

  const conceptBridge = history.find((item) => {
    const historyTopicId = item.researchContext?.topicId;

    return Boolean(
      historyTopicId &&
        (topic.prerequisiteTopicIds.includes(historyTopicId) ||
          topic.followUpTopicIds.includes(historyTopicId)),
    );
  });

  if (conceptBridge) {
    return {
      runId: conceptBridge.runId,
      topicId: conceptBridge.researchContext?.topicId ?? null,
      title: conceptBridge.title,
      publishedAt: conceptBridge.publishedAt,
      relationship: "concept_bridge",
    };
  }

  return null;
}

function buildCandidateHeuristics(
  topic: ResearchTopic,
  similarity: SimilarityCheckResult,
  history: PublishedContentListItem[],
): ResearchSelectionCandidate {
  const previousTopicLink = findPreviousTopicLink(topic, history);
  const topSimilarityScore = similarity.matches[0]?.score ?? 0;
  const recentSeriesCount = history
    .slice(0, 6)
    .filter((item) => item.researchContext?.seriesId === topic.series.id).length;
  const sameSeriesTailCount = history
    .slice(0, 2)
    .filter((item) => item.researchContext?.seriesId === topic.series.id).length;
  const prerequisiteSeen = topic.prerequisiteTopicIds.some((topicId) =>
    history.some((item) => item.researchContext?.topicId === topicId),
  );
  const heuristicReasons: string[] = [];

  let heuristicScore = similarity.decision === "clear" ? 100 : 58;
  heuristicScore += (1 - topSimilarityScore) * 28;

  if (topic.seriesOrder === 1) {
    heuristicScore += 4;
    heuristicReasons.push("새 시리즈의 시작점으로 쓰기 좋습니다.");
  }

  if (previousTopicLink?.relationship === "series_next") {
    heuristicScore += 18;
    heuristicReasons.push(
      `${previousTopicLink.title} 다음 단계로 자연스럽게 이어지는 시리즈 주제입니다.`,
    );
  } else if (previousTopicLink?.relationship === "concept_bridge") {
    heuristicScore += 11;
    heuristicReasons.push(`${previousTopicLink.title}와 개념 다리 역할을 할 수 있습니다.`);
  } else if (previousTopicLink?.relationship === "series_context") {
    heuristicScore += 6;
    heuristicReasons.push(`${previousTopicLink.title}와 같은 시리즈 안에서 흐름을 이어갈 수 있습니다.`);
  }

  if (recentSeriesCount > 0 && !previousTopicLink) {
    heuristicScore -= recentSeriesCount * 4;
    heuristicReasons.push("최근 같은 시리즈 비중이 있어 다른 흐름과의 균형이 필요합니다.");
  }

  if (sameSeriesTailCount >= 2 && previousTopicLink?.relationship !== "series_next") {
    heuristicScore -= 8;
    heuristicReasons.push("최근 게시가 이미 같은 시리즈에 몰려 있어 반복감이 생길 수 있습니다.");
  }

  if (topic.seriesOrder > 1 && !prerequisiteSeen && !previousTopicLink) {
    heuristicScore -= 6;
    heuristicReasons.push("선행 개념 없이 단독으로 올리면 흐름이 끊겨 보일 수 있습니다.");
  }

  if (similarity.decision === "review") {
    heuristicScore -= 14;
    heuristicReasons.push("기존 게시와 일부 설명 각도가 겹쳐 운영자 검토가 필요합니다.");
  } else {
    heuristicReasons.push("기존 게시와의 겹침 위험이 비교적 낮습니다.");
  }

  if (similarity.matches.length === 0) {
    heuristicScore += 3;
    heuristicReasons.push("가까운 유사 게시가 없어 계정 신선도를 확보하기 좋습니다.");
  }

  return {
    topic,
    similarity,
    heuristicScore: Number(heuristicScore.toFixed(3)),
    heuristicReasons: heuristicReasons.slice(0, 5),
    previousTopicLink,
  };
}

function buildHeuristicSelectionReason(candidate: ResearchSelectionCandidate) {
  return candidate.heuristicReasons.slice(0, 2).join(" ");
}

function buildHeuristicOperatorFocus(candidate: ResearchSelectionCandidate) {
  if (candidate.previousTopicLink?.relationship === "series_next") {
    return "바로 전 개념의 다음 단계라는 점이 보이도록 연결하되, 설명은 독립적으로 이해되게 유지합니다.";
  }

  if (candidate.previousTopicLink?.relationship === "concept_bridge") {
    return "이전 게시와 이어지는 이유를 짧게 보여 주되, 새 개념의 차이를 분명하게 드러냅니다.";
  }

  return "중학생이 처음 봐도 이해되도록 쉬운 생활 예시와 짧은 문장으로 운영 가능한 초안을 만듭니다.";
}

async function maybeChooseWithLlm(
  candidates: ResearchSelectionCandidate[],
  history: PublishedContentListItem[],
) {
  const client = getOpenAIClient();

  if (!client || candidates.length <= 1) {
    return null;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: [
        "You are acting like the human operator of a Korean middle-school economics Instagram account.",
        "Pick exactly one topicId from the provided shortlist.",
        "Prioritize topics that are safe to approve, clearly distinct from past posts, and help the account feel like a guided learning series.",
        "Prefer direct series continuation or strong concept bridges when overlap risk stays low.",
        "Avoid isolated picks that feel random, repetitive, or too advanced for a middle-school audience.",
        "Return concise Korean.",
      ].join("\n"),
      input: JSON.stringify(
        {
          recent_history: history.slice(0, 8).map((item) => ({
            runId: item.runId,
            title: item.title,
            publishedAt: item.publishedAt,
            seriesTitle: item.researchContext?.seriesTitle ?? null,
            topicId: item.researchContext?.topicId ?? null,
            curriculumPosition: item.researchContext?.curriculumPosition ?? null,
          })),
          shortlist: candidates.map((candidate) => ({
            topicId: candidate.topic.id,
            title: candidate.topic.title,
            summary: candidate.topic.summary,
            seriesTitle: candidate.topic.series.title,
            seriesOrder: candidate.topic.seriesOrder,
            curriculumPosition: candidate.topic.curriculumPosition,
            teachingAngle: candidate.topic.teachingAngle,
            similarityDecision: candidate.similarity.decision,
            topSimilarityScore: candidate.similarity.matches[0]?.score ?? 0,
            previousTopicLink: candidate.previousTopicLink,
            heuristicScore: candidate.heuristicScore,
            heuristicReasons: candidate.heuristicReasons,
          })),
        },
        null,
        2,
      ),
      text: {
        format: zodTextFormat(researchTopicChooserSchema, "research_topic_choice"),
      },
      max_output_tokens: 700,
    });

    return researchTopicChooserSchema.parse(response.output_parsed);
  } catch {
    return null;
  }
}

function buildSelectionMetadata(input: {
  candidate: ResearchSelectionCandidate;
  selectionMode: "heuristic" | "llm";
  selectionReason: string;
  operatorFocus: string;
  shortlistTopicIds: string[];
}) {
  const topSimilarityScore = input.candidate.similarity.matches[0]?.score ?? 0;

  return researchSelectionMetadataSchema.parse({
    topicId: input.candidate.topic.id,
    conceptId: input.candidate.topic.conceptId,
    seriesId: input.candidate.topic.series.id,
    seriesTitle: input.candidate.topic.series.title,
    seriesOrder: input.candidate.topic.seriesOrder,
    curriculumPosition: input.candidate.topic.curriculumPosition,
    narrativeArc: input.candidate.topic.series.narrativeArc,
    teachingAngle: input.candidate.topic.teachingAngle,
    topicAliases: input.candidate.topic.aliases.slice(0, 12),
    previousTopicLink: input.candidate.previousTopicLink,
    selectionMode: input.selectionMode,
    selectionReason: input.selectionReason,
    selectionScore: input.candidate.heuristicScore,
    topSimilarityScore,
    operatorFocus: input.operatorFocus,
    shortlistTopicIds: input.shortlistTopicIds.slice(0, 8),
  });
}

function buildDiagnostics(candidates: ResearchSelectionCandidate[]) {
  return candidates
    .slice()
    .sort((left, right) => right.heuristicScore - left.heuristicScore)
    .slice(0, 8)
    .map<ResearchSelectionDiagnostic>((candidate) => ({
      topicId: candidate.topic.id,
      title: candidate.topic.title,
      decision: candidate.similarity.decision,
      heuristicScore: candidate.heuristicScore,
      topSimilarityScore: candidate.similarity.matches[0]?.score ?? 0,
      seriesId: candidate.topic.series.id,
      seriesOrder: candidate.topic.seriesOrder,
      reasons: candidate.heuristicReasons,
    }));
}

function buildFallbackDraft(topic: ResearchTopic, selectionMetadata: ResearchSelectionMetadata) {
  const previousLinkText = selectionMetadata.previousTopicLink
    ? `이번 주제는 직전 흐름인 "${selectionMetadata.previousTopicLink.title}" 다음에 이어 붙이기 좋다. 같은 개념을 반복하기보다 ${topic.teachingAngle}라는 새 각도로 설명해야 한다.`
    : `이번 주제는 ${selectionMetadata.seriesTitle} 시리즈 안에서 ${selectionMetadata.curriculumPosition} 위치를 맡는다. 처음 보는 학생도 따라올 수 있게 정의를 먼저 주고 생활 예시로 바로 연결해야 한다.`;

  return {
    title: topic.title,
    source_text: `${topic.sourceTextSeed}\n\n${previousLinkText}\n\n어려운 용어는 바로 쉬운 말로 바꾸고, 한 카드 안에서는 하나의 이해 포인트만 남긴다. 숫자보다 구조를 먼저 설명하고, 학생이 "그래서 내 생활에서는 어떻게 보이지?"라고 느낄 수 있게 용돈, 간식, 학교생활, 집안 소비 예시를 붙인다.`,
    summary: topic.summary,
    key_terms: topic.keyTerms.slice(0, 6),
    approval_note: `${selectionMetadata.seriesTitle} ${selectionMetadata.seriesOrder}번째 흐름으로 제안합니다. ${selectionMetadata.selectionReason}`,
  };
}

async function buildResearchHistoryContext(
  selection: ResearchSelection,
  history: PublishedContentListItem[],
): Promise<ResearchHistoryContext> {
  return {
    recentPublished: history.slice(0, 8).map((item) => ({
      runId: item.runId,
      title: item.title,
      publishedAt: item.publishedAt,
      keyTerms: item.keyTerms.slice(0, 6),
      conceptSummary: item.conceptSummary.slice(0, 240),
      seriesTitle: item.researchContext?.seriesTitle ?? null,
      curriculumPosition: item.researchContext?.curriculumPosition ?? null,
    })),
    similarMatches: selection.similarity.matches.slice(0, 3).map((match) => ({
      runId: match.runId,
      title: match.title,
      publishedAt: match.publishedAt,
      score: match.score,
      sharedTerms: match.sharedTerms,
    })),
    selectionPlan: {
      seriesTitle: selection.metadata.seriesTitle,
      seriesOrder: selection.metadata.seriesOrder,
      curriculumPosition: selection.metadata.curriculumPosition,
      narrativeArc: selection.metadata.narrativeArc,
      teachingAngle: selection.metadata.teachingAngle,
      previousTopicLink: selection.metadata.previousTopicLink,
      selectionReason: selection.metadata.selectionReason,
      operatorFocus: selection.metadata.operatorFocus,
    },
  };
}

function serializeResearchHistoryContext(history: ResearchHistoryContext) {
  const recentLines =
    history.recentPublished.length > 0
      ? history.recentPublished.map((item, index) =>
          [
            `${index + 1}. ${item.title}`,
            `published_at: ${item.publishedAt}`,
            `series: ${item.seriesTitle ?? "unknown"}`,
            `curriculum_position: ${item.curriculumPosition ?? "unknown"}`,
            `key_terms: ${item.keyTerms.join(", ") || "none"}`,
            `concept_summary: ${item.conceptSummary}`,
          ].join("\n"),
        )
      : ["recent published content: none"];

  const overlapLines =
    history.similarMatches.length > 0
      ? history.similarMatches.map((item, index) =>
          [
            `${index + 1}. ${item.title}`,
            `published_at: ${item.publishedAt}`,
            `score: ${item.score}`,
            `shared_terms: ${item.sharedTerms.join(", ") || "none"}`,
          ].join("\n"),
        )
      : ["similar matches: none"];

  return [
    "Selection plan:",
    `series: ${history.selectionPlan.seriesTitle} #${history.selectionPlan.seriesOrder}`,
    `curriculum_position: ${history.selectionPlan.curriculumPosition}`,
    `narrative_arc: ${history.selectionPlan.narrativeArc}`,
    `teaching_angle: ${history.selectionPlan.teachingAngle}`,
    `operator_focus: ${history.selectionPlan.operatorFocus}`,
    history.selectionPlan.previousTopicLink
      ? `previous_topic_link: ${history.selectionPlan.previousTopicLink.title} (${history.selectionPlan.previousTopicLink.relationship})`
      : "previous_topic_link: none",
    `selection_reason: ${history.selectionPlan.selectionReason}`,
    "",
    "Recent published content to avoid repeating:",
    ...recentLines,
    "",
    "Closest overlapping posts:",
    ...overlapLines,
  ].join("\n");
}

async function chooseTopic(
  input: DispatchResearchInput,
  history: PublishedContentListItem[],
): Promise<ResearchSelection> {
  const parsed = dispatchResearchSchema.parse(input);

  if (parsed.topicId) {
    const forcedTopic = researchTopicById.get(parsed.topicId);

    if (!forcedTopic) {
      throw new Error("요청한 research topic을 찾지 못했습니다.");
    }

    const similarity = evaluateCandidateSimilarityAgainstHistory(
      {
        title: forcedTopic.title,
        keyTerms: forcedTopic.keyTerms,
        summary: forcedTopic.summary,
        conceptId: forcedTopic.conceptId,
        topicId: forcedTopic.id,
        aliases: forcedTopic.aliases,
      },
      history,
    );
    const candidate = buildCandidateHeuristics(forcedTopic, similarity, history);
    const metadata = buildSelectionMetadata({
      candidate,
      selectionMode: "heuristic",
      selectionReason: "운영자가 topicId를 직접 지정했습니다.",
      operatorFocus: buildHeuristicOperatorFocus(candidate),
      shortlistTopicIds: [forcedTopic.id],
    });

    return {
      topic: forcedTopic,
      similarity,
      metadata,
      diagnostics: buildDiagnostics([candidate]),
    };
  }

  const evaluated = middleSchoolEconomicsTopics.map((topic) =>
    buildCandidateHeuristics(
      topic,
      evaluateCandidateSimilarityAgainstHistory(
        {
          title: topic.title,
          keyTerms: topic.keyTerms,
          summary: topic.summary,
          conceptId: topic.conceptId,
          topicId: topic.id,
          aliases: topic.aliases,
        },
        history,
      ),
      history,
    ),
  );

  const clearCandidates = evaluated
    .filter((candidate) => candidate.similarity.decision === "clear")
    .sort((left, right) => right.heuristicScore - left.heuristicScore);
  const reviewCandidates = evaluated
    .filter((candidate) => candidate.similarity.decision === "review")
    .sort((left, right) => right.heuristicScore - left.heuristicScore);
  const shortlist = (clearCandidates.length > 0
    ? clearCandidates
    : parsed.allowReviewMatch
      ? reviewCandidates
      : []
  ).slice(0, 5);

  if (shortlist.length === 0) {
    const topBlocked = evaluated
      .filter((candidate) => candidate.similarity.decision === "block")
      .sort(
        (left, right) =>
          (left.similarity.matches[0]?.score ?? 1) - (right.similarity.matches[0]?.score ?? 1),
      )[0];

    throw new Error(
      topBlocked
        ? `지금 후보 주제가 모두 과거 게시물과 너무 가깝습니다. 가장 가까운 후보: ${topBlocked.topic.title}`
        : "사용 가능한 research topic 후보가 없습니다.",
    );
  }

  const llmChoice = await maybeChooseWithLlm(shortlist, history);
  const selectedCandidate =
    (llmChoice ? shortlist.find((candidate) => candidate.topic.id === llmChoice.topicId) : null) ??
    shortlist[0];
  const selectionMetadata = buildSelectionMetadata({
    candidate: selectedCandidate,
    selectionMode: llmChoice ? "llm" : "heuristic",
    selectionReason: llmChoice?.selection_reason ?? buildHeuristicSelectionReason(selectedCandidate),
    operatorFocus: llmChoice?.operator_focus ?? buildHeuristicOperatorFocus(selectedCandidate),
    shortlistTopicIds: shortlist.map((candidate) => candidate.topic.id),
  });

  return {
    topic: selectedCandidate.topic,
    similarity: selectedCandidate.similarity,
    metadata: selectionMetadata,
    diagnostics: buildDiagnostics(evaluated),
  };
}

async function generateResearchDraft(
  topic: ResearchTopic,
  historyContext: ResearchHistoryContext,
  selectionMetadata: ResearchSelectionMetadata,
) {
  const fallback = buildFallbackDraft(topic, selectionMetadata);
  const client = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.parse({
      model: getTextModel(),
      instructions: [
        "You are a research agent for a Korean middle-school economics Instagram workflow.",
        getAudienceInstructions("middle_school"),
        "Pick no new topic; use only the provided concept.",
        "This account should feel like a guided economics learning feed, not a random pile of isolated posts.",
        "Write a concise but grounded script draft in Korean that can later feed a card-news generator.",
        "The source_text should read like a clean teacher note or briefing memo, not like slide copy.",
        "Keep the tone clear, practical, and easy for a middle-school student.",
        "Use the selection plan and published history context to avoid repeating the same framing, examples, or explanation angle.",
        "If a previous topic link exists, connect naturally but keep this draft fully understandable on its own.",
        "Do not use markdown.",
        "Do not mention outside research or fabricated statistics.",
      ].join("\n"),
      input: [
        "Concept topic:",
        JSON.stringify(topic, null, 2),
        "",
        "Selection metadata:",
        JSON.stringify(selectionMetadata, null, 2),
        "",
        "Published history context:",
        serializeResearchHistoryContext(historyContext),
      ].join("\n"),
      text: {
        format: zodTextFormat(researchDraftSchema, "research_draft"),
      },
      max_output_tokens: 1800,
    });

    return researchDraftSchema.parse(response.output_parsed);
  } catch {
    return fallback;
  }
}

export async function dispatchResearchDraft(
  input: DispatchResearchInput = {},
): Promise<DispatchResearchResult> {
  const parsed = dispatchResearchSchema.parse(input);

  try {
    return await withResearchDispatchLock(async () => {
      if (!parsed.force) {
        const activeRun = await findLatestActiveRun();

        if (activeRun) {
          return {
            status: "skipped" as const,
            reason: "active_run" as const,
            message: `진행 중인 run ${activeRun.id} (${activeRun.workflow_status}) 이 있어 새 research 초안을 만들지 않았습니다.`,
            activeRun: summarizeActiveRun(activeRun),
          };
        }
      }

      const publishedHistory = await listPublishedContent(120, {
        includeResearchContext: true,
      });
      const selection = await chooseTopic(parsed, publishedHistory);
      const historyContext = await buildResearchHistoryContext(selection, publishedHistory);
      const draft = await generateResearchDraft(
        selection.topic,
        historyContext,
        selection.metadata,
      );
      const run = await createRunRecord({
        title: draft.title,
        audience: "middle_school",
        entrypoint: "research",
        sourceText: draft.source_text,
        deferProcessing: true,
      });

      await writeArtifact(run.id, "source.txt", draft.source_text);
      await writeArtifact(
        run.id,
        "research-dispatch.json",
        JSON.stringify(
          {
            selected_topic: selection.topic,
            selection_metadata: selection.metadata,
            selection_diagnostics: selection.diagnostics,
            similarity: selection.similarity,
            history_context: historyContext,
            draft,
          },
          null,
          2,
        ),
      );

      try {
        if (parsed.sendToTelegram) {
          const approvalMessage = buildScriptApprovalMessage({
            run,
            summary: draft.summary,
            keyTerms: draft.key_terms,
            approvalNote: draft.approval_note,
            similarity: selection.similarity,
            research: selection.metadata,
          });
          const sent = await sendTelegramTextMessage({
            chatId: parsed.chatId,
            text: approvalMessage,
            replyMarkup: buildApprovalInlineKeyboard({
              runId: run.id,
              approvalType: "script",
            }),
          });

          await requestRunApproval(run.id, {
            approvalType: "script",
            channel: "telegram",
            chatId: sent.chatId,
            telegramMessageId: sent.messageId ?? undefined,
            note: draft.approval_note,
            deliverySummary: approvalMessage,
          });
        } else {
          await requestRunApproval(run.id, {
            approvalType: "script",
            channel: "local_preview",
            note: draft.approval_note,
            deliverySummary: draft.summary,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to deliver the research draft for script approval.";

        await failRun(run.id, `초안 승인 요청 전달 실패: ${message}`).catch(() => undefined);
        throw error;
      }

      const nextRun = await readRunState(run.id);

      return {
        status: "dispatched" as const,
        run: nextRun,
        selection,
        historyContext,
        draft,
      };
    });
  } catch (error) {
    if (error instanceof ResearchDispatchBusyError) {
      return {
        status: "skipped",
        reason: "dispatch_locked",
        message: error.message,
        activeRun: null,
      };
    }

    throw error;
  }
}

export async function debugEvaluateResearchTopic(topicId: string) {
  const topic = researchTopicById.get(topicId);

  if (!topic) {
    throw new Error(`Unknown topicId: ${topicId}`);
  }

  const history = await listPublishedContent(120, {
    includeResearchContext: true,
  });

  return {
    topic,
    similarity: await evaluateCandidateSimilarity({
      title: topic.title,
      keyTerms: topic.keyTerms,
      summary: topic.summary,
      conceptId: topic.conceptId,
      topicId: topic.id,
      aliases: topic.aliases,
    }),
    historyCount: history.length,
  };
}

export async function debugSelectResearchTopic(
  input: DispatchResearchInput = {},
  historyOverride?: PublishedContentListItem[],
) {
  const history =
    historyOverride ??
    (await listPublishedContent(120, {
      includeResearchContext: true,
    }));

  return chooseTopic(input, history);
}
