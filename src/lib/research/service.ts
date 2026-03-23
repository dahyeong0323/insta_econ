import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { type RunState } from "@/lib/agents/schema";
import { getAudienceInstructions } from "@/lib/agents/prompts";
import { evaluateCandidateSimilarity } from "@/lib/history/similarity";
import { listPublishedContent } from "@/lib/history/storage";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram/client";
import {
  buildApprovalInlineKeyboard,
  buildScriptApprovalMessage,
} from "@/lib/integrations/telegram/messages";
import { getOpenAIClient, getTextModel } from "@/lib/openai/client";
import {
  ResearchDispatchBusyError,
  withResearchDispatchLock,
} from "@/lib/research/scheduler";
import {
  requestRunApproval,
  createRunRecord,
  failRun,
} from "@/lib/runs/processor";
import {
  listRunIds,
  readRunState,
  writeArtifact,
} from "@/lib/runs/storage";
import { middleSchoolEconomicsTopics, type ResearchTopic } from "@/lib/research/topics";

const researchDraftSchema = z
  .object({
    title: z.string().min(1).max(120),
    source_text: z.string().min(120).max(4000),
    summary: z.string().min(1).max(320),
    key_terms: z.array(z.string().min(1).max(40)).min(3).max(8),
    approval_note: z.string().min(1).max(300),
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

type ResearchSelection = {
  topic: ResearchTopic;
  similarity: Awaited<ReturnType<typeof evaluateCandidateSimilarity>>;
};

type ResearchHistoryContext = {
  recentPublished: Array<{
    runId: string;
    title: string;
    publishedAt: string;
    keyTerms: string[];
    conceptSummary: string;
  }>;
  similarMatches: Array<{
    runId: string;
    title: string;
    publishedAt: string;
    score: number;
    sharedTerms: string[];
  }>;
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

function buildFallbackDraft(topic: ResearchTopic) {
  return {
    title: topic.title,
    source_text: `${topic.sourceTextSeed}\n\n이 개념을 설명할 때는 중학생이 실제로 겪는 소비 선택, 용돈, 학교생활, 가정 경제 예시를 함께 쓰면 이해가 쉬워진다. 핵심은 어려운 용어를 줄이고, "왜 이런 일이 생기는지"를 한 단계씩 보여 주는 것이다.`,
    summary: topic.summary,
    key_terms: topic.keyTerms.slice(0, 6),
    approval_note: `${topic.title} 주제로 대본 초안을 만들었습니다. 과거 게시 이력과 비교해 검토 후 승인해 주세요.`,
  };
}

async function buildResearchHistoryContext(
  selection: ResearchSelection,
): Promise<ResearchHistoryContext> {
  const recentPublished = (await listPublishedContent(6)).map((item) => ({
    runId: item.runId,
    title: item.title,
    publishedAt: item.publishedAt,
    keyTerms: item.keyTerms.slice(0, 6),
    conceptSummary: item.conceptSummary.slice(0, 240),
  }));

  return {
    recentPublished,
    similarMatches: selection.similarity.matches.slice(0, 3).map((match) => ({
      runId: match.runId,
      title: match.title,
      publishedAt: match.publishedAt,
      score: match.score,
      sharedTerms: match.sharedTerms,
    })),
  };
}

function serializeResearchHistoryContext(history: ResearchHistoryContext) {
  const recentLines =
    history.recentPublished.length > 0
      ? history.recentPublished.map((item, index) =>
          [
            `${index + 1}. ${item.title}`,
            `published_at: ${item.publishedAt}`,
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
    "Recent published content to avoid repeating:",
    ...recentLines,
    "",
    "Closest overlapping posts:",
    ...overlapLines,
  ].join("\n");
}

async function chooseTopic(input: DispatchResearchInput): Promise<ResearchSelection> {
  const parsed = dispatchResearchSchema.parse(input);

  if (parsed.topicId) {
    const forcedTopic = middleSchoolEconomicsTopics.find((topic) => topic.id === parsed.topicId);

    if (!forcedTopic) {
      throw new Error("요청한 research topic을 찾지 못했습니다.");
    }

    return {
      topic: forcedTopic,
      similarity: await evaluateCandidateSimilarity({
        title: forcedTopic.title,
        keyTerms: forcedTopic.keyTerms,
        summary: forcedTopic.summary,
      }),
    };
  }

  const evaluated = await Promise.all(
    middleSchoolEconomicsTopics.map(async (topic) => ({
      topic,
      similarity: await evaluateCandidateSimilarity({
        title: topic.title,
        keyTerms: topic.keyTerms,
        summary: topic.summary,
      }),
    })),
  );
  const clear = evaluated.filter((candidate) => candidate.similarity.decision === "clear");

  if (clear.length > 0) {
    return clear[0];
  }

  if (parsed.allowReviewMatch) {
    const review = evaluated
      .filter((candidate) => candidate.similarity.decision === "review")
      .sort((left, right) => {
        const leftScore = left.similarity.matches[0]?.score ?? 0;
        const rightScore = right.similarity.matches[0]?.score ?? 0;
        return leftScore - rightScore;
      });

    if (review.length > 0) {
      return review[0];
    }
  }

  const topBlocked = evaluated
    .filter((candidate) => candidate.similarity.decision === "block")
    .sort((left, right) => {
      const leftScore = left.similarity.matches[0]?.score ?? 1;
      const rightScore = right.similarity.matches[0]?.score ?? 1;
      return leftScore - rightScore;
    })[0];

  throw new Error(
    topBlocked
      ? `현재 후보 주제가 모두 과거 게시물과 겹칩니다. 가장 가까운 후보: ${topBlocked.topic.title}`
      : "사용 가능한 research topic 후보가 없습니다.",
  );
}

async function generateResearchDraft(
  topic: ResearchTopic,
  historyContext: ResearchHistoryContext,
) {
  const fallback = buildFallbackDraft(topic);
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
        "Write a concise but grounded script draft in Korean that can later feed a card-news generator.",
        "The source_text should read like a clean teacher note or briefing memo, not like slide copy.",
        "Keep the tone clear, practical, and easy for a middle-school student.",
        "Use the published history context to avoid repeating the same framing, examples, or explanation angle.",
        "If a nearby past post exists, deliberately change the teaching angle and daily-life example.",
        "Do not use markdown.",
        "Do not mention outside research or fabricated statistics.",
      ].join("\n"),
      input: [
        "Concept topic:",
        JSON.stringify(topic, null, 2),
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

      const selection = await chooseTopic(parsed);
      const historyContext = await buildResearchHistoryContext(selection);
      const draft = await generateResearchDraft(selection.topic, historyContext);
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
