import { NextResponse } from "next/server";

import {
  listRunApprovalEvents,
  listRunOperationalEvents,
  listRunPublishAttempts,
} from "@/lib/runs/db-mirror";
import { readRunState } from "@/lib/runs/storage";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const run = await readRunState(id);
    const mirroredApprovalHistory = listRunApprovalEvents(id);
    const mirroredPublishAttempts = listRunPublishAttempts(id);
    const mirroredEvents = listRunOperationalEvents(id);

    const approvalHistory =
      mirroredApprovalHistory.length > 0
        ? mirroredApprovalHistory
        : run.approval_history.map((entry) => ({
            id: entry.id,
            runId: run.id,
            approvalType: entry.approval_type,
            eventType: entry.event_type,
            occurredAt: entry.occurred_at,
            approvalStatus: entry.approval_status,
            workflowStatus: entry.workflow_status,
            channel: entry.channel,
            approver: entry.approver,
            note: entry.note,
            chatId: entry.chat_id,
            telegramMessageId: entry.telegram_message_id,
            deliverySummary: entry.delivery_summary,
          }));
    const publishAttempts =
      mirroredPublishAttempts.length > 0
        ? mirroredPublishAttempts
        : run.publish_attempts.map((attempt) => ({
            id: attempt.id,
            runId: run.id,
            trigger: attempt.trigger,
            requestedBy: attempt.requested_by,
            status: attempt.status,
            requestedAt: attempt.requested_at,
            startedAt: attempt.started_at,
            completedAt: attempt.completed_at,
            caption: attempt.caption,
            provider: attempt.provider,
            instagramCreationId: attempt.instagram_creation_id,
            instagramMediaId: attempt.instagram_media_id,
            permalink: attempt.permalink,
            error: attempt.error,
          }));
    const events =
      mirroredEvents.length > 0
        ? mirroredEvents
        : [
            ...approvalHistory.map((record) => ({
              kind: "approval" as const,
              sortAt: record.occurredAt,
              record,
            })),
            ...publishAttempts.map((record) => ({
              kind: "publish_attempt" as const,
              sortAt: record.completedAt ?? record.startedAt ?? record.requestedAt,
              record,
            })),
          ].sort((left, right) => right.sortAt.localeCompare(left.sortAt));

    return NextResponse.json({
      runId: id,
      approvalHistory,
      publishAttempts,
      events,
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read run operational events.",
      },
      { status },
    );
  }
}
