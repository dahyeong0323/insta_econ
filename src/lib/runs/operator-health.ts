import type { RunState } from "@/lib/agents/schema";

type RunHealthInput = Pick<
  RunState,
  "status" | "workflow_status" | "updated_at" | "publish_result" | "project" | "error"
>;

export type RunOperatorHealthState =
  | "idle"
  | "active"
  | "waiting"
  | "attention"
  | "stale"
  | "failed"
  | "published";

export type RunOperatorHealth = {
  state: RunOperatorHealthState;
  label: string;
  summary: string;
  recommendedAction: string;
};

export const activeRunStaleAfterMs = 6 * 60 * 60 * 1000;

export function isTerminalWorkflowStatus(
  run: Pick<RunState, "workflow_status"> | Pick<RunHealthInput, "workflow_status">,
) {
  return run.workflow_status === "published" || run.workflow_status === "failed";
}

export function getRunAgeMs(
  run: Pick<RunState, "updated_at"> | Pick<RunHealthInput, "updated_at">,
) {
  const updatedAt = new Date(run.updated_at).getTime();

  if (Number.isNaN(updatedAt)) {
    return 0;
  }

  return Math.max(0, Date.now() - updatedAt);
}

export function isStaleActiveRun(
  run:
    | Pick<RunState, "workflow_status" | "updated_at">
    | Pick<RunHealthInput, "workflow_status" | "updated_at">,
) {
  return !isTerminalWorkflowStatus(run) && getRunAgeMs(run) > activeRunStaleAfterMs;
}

export function getRunOperatorHealth(run: RunHealthInput | null): RunOperatorHealth {
  if (!run) {
    return {
      state: "idle",
      label: "run 없음",
      summary: "아직 선택된 run이 없습니다.",
      recommendedAction: "research를 시작하거나 기존 run을 불러오면 운영 상태가 여기에 표시됩니다.",
    };
  }

  if (run.status === "failed" || run.workflow_status === "failed") {
    return {
      state: "failed",
      label: "실패",
      summary:
        run.error?.trim() ||
        run.publish_result.hold_reason?.trim() ||
        run.publish_result.error?.trim() ||
        "run이 실패 상태로 멈춰 있습니다.",
      recommendedAction: "원인을 확인한 뒤 수정 재요청 또는 run 종료 기준으로 정리하세요.",
    };
  }

  if (run.workflow_status === "published" || run.publish_result.status === "published") {
    return {
      state: "published",
      label: "게시 완료",
      summary: "Instagram publish가 끝난 run입니다.",
      recommendedAction: "기록 확인만 하면 되고, 다음 research run을 진행해도 됩니다.",
    };
  }

  if (isStaleActiveRun(run)) {
    if (run.workflow_status === "script_pending_approval") {
      return {
        state: "stale",
        label: "초안 승인 stale",
        summary: "초안 승인 대기 상태가 오래 유지되고 있습니다.",
        recommendedAction: "응답이 없다면 상태를 새로고침하고, 필요하면 메모를 남긴 뒤 run을 종료하세요.",
      };
    }

    if (run.workflow_status === "image_pending_approval") {
      return {
        state: "stale",
        label: "이미지 승인 stale",
        summary: "이미지 승인 대기 상태가 오래 유지되고 있습니다.",
        recommendedAction: "Telegram 응답 여부를 확인하고, 오래된 요청이면 run 정리 여부를 판단하세요.",
      };
    }

    if (run.workflow_status === "publishing" || run.publish_result.status === "publishing") {
      return {
        state: "stale",
        label: "게시 stale",
        summary: "publish가 오래 멈춰 있어 운영자 확인이 필요합니다.",
        recommendedAction: "상태를 새로고침한 뒤 hold reason을 확인하고, 필요하면 게시 중단으로 정리하세요.",
      };
    }

    return {
      state: "stale",
      label: "오래 멈춘 run",
      summary: "활성 run인데 최근 업데이트가 없어 stale 후보로 보입니다.",
      recommendedAction: "상태를 새로고침하고, 복구 가능성이 낮으면 run 종료로 정리하세요.",
    };
  }

  if (run.publish_result.next_action === "manual_fix_required") {
    return {
      state: "attention",
      label: "수동 수정 필요",
      summary:
        run.publish_result.hold_reason?.trim() ||
        run.publish_result.error?.trim() ||
        "publish 전에 운영자 수정이 필요한 상태입니다.",
      recommendedAction: "hold reason을 기준으로 수정한 뒤 게시를 다시 시도하세요.",
    };
  }

  if (run.publish_result.next_action === "manual_retry") {
    return {
      state: "attention",
      label: "수동 재시도 필요",
      summary:
        run.publish_result.hold_reason?.trim() ||
        run.publish_result.error?.trim() ||
        "publish 재시도를 기다리는 상태입니다.",
      recommendedAction: "원인이 일시적이면 retry publish를 실행하고, 반복되면 hold reason을 점검하세요.",
    };
  }

  if (run.workflow_status === "script_pending_approval") {
    return {
      state: "waiting",
      label: "초안 승인 대기",
      summary: "운영자 응답을 기다리고 있습니다.",
      recommendedAction: "Telegram에서 승인 또는 수정 요청을 보내면 다음 단계로 넘어갑니다.",
    };
  }

  if (run.workflow_status === "image_pending_approval") {
    return {
      state: "waiting",
      label: "이미지 승인 대기",
      summary: "이미지 승인 응답을 기다리고 있습니다.",
      recommendedAction: "Telegram 승인 후 자동 publish 또는 수동 publish를 진행할 수 있습니다.",
    };
  }

  if (run.workflow_status === "script_approved" && !run.project && run.status !== "running") {
    return {
      state: "attention",
      label: "렌더 시작 가능",
      summary: "대본은 승인됐지만 카드뉴스 생성이 아직 시작되지 않았습니다.",
      recommendedAction: "operator controls에서 카드뉴스 생성 진행을 눌러 다음 단계로 넘기세요.",
    };
  }

  if (run.workflow_status === "image_approved" && run.publish_result.status === "not_requested") {
    return {
      state: "attention",
      label: "게시 시작 가능",
      summary: "이미지 승인은 끝났고 publish만 남아 있습니다.",
      recommendedAction: "publish를 시작하거나, 자동 게시 정책이면 전송 기록을 다시 확인하세요.",
    };
  }

  if (run.status === "running" || run.workflow_status === "rendering") {
    return {
      state: "active",
      label: "진행 중",
      summary: "현재 파이프라인이 실행 중입니다.",
      recommendedAction: "중간 개입보다 새로고침으로 상태를 확인하는 편이 안전합니다.",
    };
  }

  if (run.workflow_status === "researched") {
    return {
      state: "attention",
      label: "승인 요청 전",
      summary: "research는 끝났지만 아직 초안 승인 요청 전 상태입니다.",
      recommendedAction: "승인 요청 메시지 전달 상태를 확인하세요.",
    };
  }

  return {
    state: "active",
    label: "확인 중",
    summary: "run은 살아 있고 다음 상태 전환을 기다리고 있습니다.",
    recommendedAction: "운영 로그와 승인 이력을 함께 보면서 다음 액션을 판단하세요.",
  };
}
