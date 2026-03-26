"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  type ApprovalHistoryEntry,
  type PublishAttempt,
  type RunState,
} from "@/lib/agents/schema";
import {
  activeRunStaleAfterMs,
  getRunAgeMs,
  getRunOperatorHealth,
  isStaleActiveRun,
} from "@/lib/runs/operator-health";
import { getPublishOperatorGuide } from "@/lib/runs/publish-guide";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "시간 없음";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function approvalEventMeta(entry: ApprovalHistoryEntry) {
  if (entry.event_type === "requested") {
    return {
      label: entry.approval_type === "script" ? "초안 승인 요청" : "이미지 승인 요청",
      tone: "secondary" as const,
    };
  }

  if (entry.event_type === "approved") {
    return {
      label: entry.approval_type === "script" ? "초안 승인 완료" : "이미지 승인 완료",
      tone: "default" as const,
    };
  }

  if (entry.event_type === "held") {
    return {
      label: entry.approval_type === "script" ? "초안 보류" : "이미지 보류",
      tone: "secondary" as const,
    };
  }

  if (entry.event_type === "skipped") {
    return {
      label: entry.approval_type === "script" ? "초안 스킵" : "이미지 스킵",
      tone: "outline" as const,
    };
  }

  return {
    label: entry.approval_type === "script" ? "초안 수정 요청" : "이미지 수정 요청",
    tone: "outline" as const,
  };
}

function publishAttemptMeta(attempt: PublishAttempt) {
  if (attempt.status === "published") {
    return {
      label: "게시 완료",
      tone: "default" as const,
    };
  }

  if (attempt.status === "publishing") {
    return {
      label: "게시 중",
      tone: "secondary" as const,
    };
  }

  return {
    label: "게시 실패",
    tone: "outline" as const,
  };
}

function renderCompactText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatRelativeAge(ageMs: number) {
  const minutes = Math.max(1, Math.round(ageMs / (60 * 1000)));

  if (minutes < 60) {
    return `${minutes}분 전 업데이트`;
  }

  const hours = Math.round((minutes / 60) * 10) / 10;

  if (hours < 24) {
    return `${hours}시간 전 업데이트`;
  }

  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}일 전 업데이트`;
}

function healthBadgeVariant(state: ReturnType<typeof getRunOperatorHealth>["state"]) {
  switch (state) {
    case "failed":
    case "stale":
      return "destructive" as const;
    case "attention":
    case "waiting":
      return "secondary" as const;
    case "published":
      return "default" as const;
    default:
      return "outline" as const;
  }
}

function HealthIcon({ state }: { state: ReturnType<typeof getRunOperatorHealth>["state"] }) {
  switch (state) {
    case "failed":
    case "stale":
      return <AlertTriangle className="h-4 w-4" />;
    case "published":
      return <CheckCircle2 className="h-4 w-4" />;
    default:
      return <Clock3 className="h-4 w-4" />;
  }
}

function nextActionLabel(run: RunState) {
  switch (run.publish_result.next_action) {
    case "retrying":
      return "자동 재시도 중";
    case "manual_retry":
      return "수동 재시도 필요";
    case "manual_fix_required":
      return "수정 후 재시도 필요";
    default:
      return "추가 조치 없음";
  }
}

function triggerLabel(trigger: PublishAttempt["trigger"]) {
  return trigger === "auto_on_image_approval"
    ? "이미지 승인 후 자동 게시"
    : "수동 게시";
}

type RunOperationsLogProps = {
  run: RunState | null;
  hasOperatorSecret?: boolean;
  isDispatchBusy?: boolean;
  isProcessBusy?: boolean;
  isSendImagesBusy?: boolean;
  isFailRunBusy?: boolean;
  isRefreshBusy?: boolean;
  isPublishControlBusy?: boolean;
  onDispatchResearch?: () => void;
  onProcessRun?: () => void;
  onSendImages?: () => void;
  onFailRun?: () => void;
  onRefreshRun?: () => void;
  onStartPublish?: () => void;
  onRetryPublish?: () => void;
  onStopPublish?: () => void;
};

export function RunOperationsLog({
  run,
  hasOperatorSecret = false,
  isDispatchBusy = false,
  isProcessBusy = false,
  isSendImagesBusy = false,
  isFailRunBusy = false,
  isRefreshBusy = false,
  isPublishControlBusy = false,
  onDispatchResearch,
  onProcessRun,
  onSendImages,
  onFailRun,
  onRefreshRun,
  onStartPublish,
  onRetryPublish,
  onStopPublish,
}: RunOperationsLogProps) {
  const approvalHistory = [...(run?.approval_history ?? [])].reverse();
  const publishAttempts = [...(run?.publish_attempts ?? [])].reverse();
  const operatorHealth = getRunOperatorHealth(run);
  const publishGuide = run ? getPublishOperatorGuide(run.publish_result) : null;
  const staleWindowHours = Math.round(activeRunStaleAfterMs / (60 * 60 * 1000));
  const staleRun = run ? isStaleActiveRun(run) : false;
  const runAgeLabel = run ? formatRelativeAge(getRunAgeMs(run)) : null;
  const canUseOperatorActions = hasOperatorSecret;
  const canProcessApprovedRun =
    run?.workflow_status === "script_approved" &&
    !run.project &&
    run.status !== "running";
  const canSendImages =
    run?.workflow_status === "image_pending_approval" &&
    run.image_approval.status === "pending" &&
    !run.image_approval.telegram_message_id &&
    Boolean(run.project);
  const showManualPublishStart =
    run?.workflow_status === "image_approved" &&
    run.image_approval.status === "approved" &&
    run.publish_result.status === "not_requested";
  const showPublishControls =
    run?.publish_result.next_action === "manual_retry" ||
    run?.publish_result.next_action === "manual_fix_required";
  const hasPendingPublishControl =
    run?.publish_result.status === "failed" && showPublishControls;
  const hasTelegramPublishControlMessage = Boolean(run?.telegram.publish_control_message_id);

  return (
    <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
              Operations log
            </div>
            <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-[#17171b]">
              승인과 게시 흐름
            </div>
            <p className="mt-2 text-sm font-bold leading-6 text-zinc-500">
              운영자가 무엇을 승인했고 게시를 몇 번 시도했는지 run 기록으로 바로 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="secondary">{approvalHistory.length} approvals</Badge>
            <Badge variant="secondary">{publishAttempts.length} publish tries</Badge>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#faf8fb] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Run health
              </div>
              <div className="mt-2 flex items-center gap-2 text-lg font-black tracking-[-0.04em] text-[#17171b]">
                <HealthIcon state={operatorHealth.state} />
                <span>{operatorHealth.label}</span>
              </div>
            </div>
            <Badge variant={healthBadgeVariant(operatorHealth.state)}>
              {operatorHealth.state}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {run ? <Badge variant="secondary">last update {formatTimestamp(run.updated_at)}</Badge> : null}
            {runAgeLabel ? <Badge variant="secondary">{runAgeLabel}</Badge> : null}
            {staleRun ? <Badge variant="outline">stale threshold {staleWindowHours}h</Badge> : null}
          </div>
          <div className="mt-3 text-sm font-bold leading-6 text-zinc-600">
            {operatorHealth.summary}
          </div>
          <div className="mt-2 text-xs font-bold leading-5 text-zinc-500">
            {operatorHealth.recommendedAction}
          </div>
          {staleRun ? (
            <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold leading-5 text-amber-900">
              6시간 넘게 업데이트가 없는 non-terminal run은 다음 research dispatch 전에 자동 정리 대상이
              될 수 있습니다.
            </div>
          ) : null}
          {staleRun && run ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onRefreshRun}
                disabled={isRefreshBusy || !onRefreshRun}
              >
                {isRefreshBusy ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                stale 상태 새로고침
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onFailRun}
                disabled={isFailRunBusy || !onFailRun || !canUseOperatorActions}
              >
                {isFailRunBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                stale run 종료
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-[22px] bg-[#faf8fb] px-4 py-4">
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Publish status
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{run?.publish_result.status ?? "not_requested"}</Badge>
            {run?.publish_result.retryable ? (
              <Badge variant="secondary">retryable</Badge>
            ) : null}
            {run ? <Badge variant="secondary">{nextActionLabel(run)}</Badge> : null}
            {publishGuide ? <Badge variant="secondary">{publishGuide.badge}</Badge> : null}
          </div>
          {publishGuide ? (
            <div className="mt-3 rounded-[18px] border border-black/5 bg-white px-4 py-4">
              <div className="text-sm font-black text-[#17171b]">{publishGuide.headline}</div>
              <div className="mt-2 text-sm font-bold leading-6 text-zinc-600">
                {publishGuide.summary}
              </div>
              <div className="mt-2 text-xs font-bold leading-5 text-zinc-500">
                {publishGuide.recommendedAction}
              </div>
            </div>
          ) : null}
          {hasPendingPublishControl ? (
            <div className="mt-3 rounded-[18px] border border-black/5 bg-white px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={hasTelegramPublishControlMessage ? "secondary" : "outline"}>
                  {hasTelegramPublishControlMessage
                    ? "telegram control sent"
                    : run?.telegram.last_chat_id
                      ? "telegram control not confirmed"
                      : "telegram chat missing"}
                </Badge>
                {run?.telegram.publish_control_message_id ? (
                  <Badge variant="outline">
                    message {run.telegram.publish_control_message_id}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-xs font-bold leading-5 text-zinc-500">
                {hasTelegramPublishControlMessage
                  ? "운영자가 Telegram 제어 메시지에서 retry 또는 stop을 바로 선택할 수 있습니다."
                  : run?.telegram.last_chat_id
                    ? "이 run은 publish control 대기 중이지만 Telegram 전송이 확인되지 않았습니다. 필요하면 UI 버튼으로 바로 처리하세요."
                    : "이 run에는 연결된 Telegram chat이 없어 publish control이 UI 중심으로만 진행됩니다."}
              </div>
            </div>
          ) : null}
          <div className="mt-3 text-sm font-bold leading-6 text-zinc-600">
            {run
              ? renderCompactText(
                  run.publish_result.hold_reason ?? run.publish_result.error,
                  "아직 게시 시도 기록이 없어요.",
                )
              : "run을 열면 게시 상태 요약이 여기에 보입니다."}
          </div>
          {showManualPublishStart ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={onStartPublish}
                disabled={isPublishControlBusy || !onStartPublish || !canUseOperatorActions}
              >
                인스타 게시 시작
              </Button>
            </div>
          ) : null}
          {showPublishControls ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={onRetryPublish}
                disabled={isPublishControlBusy || !onRetryPublish || !canUseOperatorActions}
              >
                게시 다시 시도
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onStopPublish}
                disabled={isPublishControlBusy || !onStopPublish || !canUseOperatorActions}
              >
                이번 게시 중단
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-[22px] border border-black/5 bg-[#faf8fb] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Operator controls
              </div>
              <div className="mt-2 text-lg font-black tracking-[-0.04em] text-[#17171b]">
                워크플로우 바로가기
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-zinc-500">
                secret이 있으면 research 시작, 승인 후 카드뉴스 생성, 이미지 전송, run 종료,
                상태 새로고침을 바로 실행할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant={canUseOperatorActions ? "secondary" : "outline"}>
                {canUseOperatorActions ? "secret ready" : "secret missing"}
              </Badge>
              <Badge variant="secondary">{run?.workflow_status ?? "no run"}</Badge>
              <Badge variant="secondary">{run?.status ?? "idle"}</Badge>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              size="sm"
              onClick={onDispatchResearch}
              disabled={isDispatchBusy || !onDispatchResearch || !canUseOperatorActions}
              className="justify-start"
            >
              {isDispatchBusy ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              research 시작
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onProcessRun}
              disabled={
                isProcessBusy ||
                !onProcessRun ||
                !canUseOperatorActions ||
                !canProcessApprovedRun
              }
              className="justify-start"
            >
              {isProcessBusy ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              카드뉴스 생성 진행
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onSendImages}
              disabled={
                isSendImagesBusy ||
                !onSendImages ||
                !canUseOperatorActions ||
                !canSendImages
              }
              className="justify-start"
            >
              {isSendImagesBusy ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              이미지 Telegram 전송
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onFailRun}
              disabled={isFailRunBusy || !onFailRun || !canUseOperatorActions || !run}
              className="justify-start"
            >
              {isFailRunBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              run 종료
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRefreshRun}
              disabled={isRefreshBusy || !onRefreshRun || !run}
              className="justify-start sm:col-span-2"
            >
              {isRefreshBusy ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              상태 새로고침
            </Button>
          </div>

          <p className="mt-3 text-xs font-bold leading-5 text-zinc-500">
            {canUseOperatorActions
              ? canProcessApprovedRun
                ? "대본 승인 후 생성이 멈춰 있으면 카드뉴스 생성 진행 버튼으로 이어갈 수 있어요."
                : canSendImages
                  ? "현재 run은 이미지 승인 요청을 보낼 수 있는 상태예요."
                  : "현재 상태에 맞는 버튼만 활성화됩니다. 승인 전이와 중복 전송을 막기 위한 안전장치예요."
              : "운영자 secret을 입력하면 모든 운영 버튼이 활성화됩니다."}
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Approval history
          </div>
          <ScrollArea className="h-[240px] pr-4">
            <div className="space-y-3">
              {approvalHistory.length > 0 ? (
                approvalHistory.map((entry) => {
                  const meta = approvalEventMeta(entry);

                  return (
                    <div
                      key={entry.id}
                      className="rounded-[22px] border border-black/5 bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={meta.tone}>{meta.label}</Badge>
                          <Badge variant="secondary">{entry.workflow_status}</Badge>
                        </div>
                        <div className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">
                          {formatTimestamp(entry.occurred_at)}
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-bold leading-6 text-zinc-600">
                        {renderCompactText(entry.note, "응답 메모 없음")}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-black text-zinc-400">
                        <span>channel: {entry.channel ?? "unknown"}</span>
                        <span>approver: {entry.approver ?? "unknown"}</span>
                        {entry.telegram_message_id ? (
                          <span>message: {entry.telegram_message_id}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[20px] bg-[#faf8fb] px-4 py-3 text-sm font-bold leading-6 text-zinc-500">
                  승인 요청이나 응답이 생기면 이력이 여기에 쌓입니다.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Publish attempts
          </div>
          <ScrollArea className="h-[240px] pr-4">
            <div className="space-y-3">
              {publishAttempts.length > 0 ? (
                publishAttempts.map((attempt) => {
                  const meta = publishAttemptMeta(attempt);

                  return (
                    <div
                      key={attempt.id}
                      className="rounded-[22px] border border-black/5 bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={meta.tone}>{meta.label}</Badge>
                          <Badge variant="secondary">{triggerLabel(attempt.trigger)}</Badge>
                        </div>
                        <div className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">
                          {formatTimestamp(attempt.started_at)}
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-bold leading-6 text-zinc-600">
                        {renderCompactText(attempt.error, "에러 없이 진행된 게시 시도입니다.")}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-black text-zinc-400">
                        <span>provider: {attempt.provider ?? "instagram"}</span>
                        <span>requested by: {attempt.requested_by ?? "system"}</span>
                        {attempt.completed_at ? (
                          <span>completed: {formatTimestamp(attempt.completed_at)}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[20px] bg-[#faf8fb] px-4 py-3 text-sm font-bold leading-6 text-zinc-500">
                  인스타 게시를 시도하면 성공과 실패 기록이 여기에 보입니다.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
