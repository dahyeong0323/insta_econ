"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  type RunState,
  type StageName,
  type WorkflowStatus,
} from "@/lib/agents/schema";

const stageMeta: Record<
  StageName,
  { label: string; title: string; summary: string; color: string }
> = {
  "source-parser": {
    label: "source-parser",
    title: "자료 읽기",
    summary: "텍스트와 PDF에서 팩트, 숫자, 핵심 용어를 추출합니다.",
    color: "bg-[#ff6b35]",
  },
  "content-planner": {
    label: "content-planner",
    title: "디자인 플랜 설계",
    summary: "슬라이드 역할, 감정 곡선, 레이아웃 패턴을 먼저 결정합니다.",
    color: "bg-[#ff9d45]",
  },
  "contents-marketer": {
    label: "contents-marketer",
    title: "질문형 카피 설계",
    summary: "디자인 플랜에 맞춰 질문형 카피를 작성합니다.",
    color: "bg-[#5b8def]",
  },
  designer: {
    label: "designer",
    title: "비주얼 리듬 설계",
    summary: "슬라이드별 모듈과 구성 리듬을 배치합니다.",
    color: "bg-[#8b5cf6]",
  },
  developer: {
    label: "developer",
    title: "HTML 카드 출력",
    summary: "standalone HTML과 export-ready 결과물을 만듭니다.",
    color: "bg-[#49d39a]",
  },
  "qa-validator": {
    label: "qa-validator",
    title: "구조 validator",
    summary: "design-plan, renderer, token, layout 규칙을 deterministic하게 검사합니다.",
    color: "bg-[#f4b942]",
  },
  "qa-reviewer": {
    label: "qa-reviewer",
    title: "검수 리포트",
    summary: "내용, 길이, 패턴, 모듈 밀도를 읽기 전용으로 검수합니다.",
    color: "bg-[#f57aa6]",
  },
  "qa-repair": {
    label: "qa-repair",
    title: "자동 수정 루프",
    summary: "qa-reviewer가 찾은 문제 슬라이드만 다시 고칩니다.",
    color: "bg-[#ef476f]",
  },
};

const workflowMeta: Record<WorkflowStatus, { label: string }> = {
  draft: { label: "draft" },
  researched: { label: "researched" },
  script_pending_approval: { label: "script approval" },
  script_approved: { label: "script approved" },
  rendering: { label: "rendering" },
  image_pending_approval: { label: "image approval" },
  image_approved: { label: "image approved" },
  publishing: { label: "publishing" },
  published: { label: "published" },
  failed: { label: "failed" },
};

function getHeadline(run: RunState | null) {
  if (!run) {
    return "에이전트 실행 대기 중";
  }

  if (run.status === "failed") {
    return run.current_stage
      ? `${stageMeta[run.current_stage].title} 단계에서 멈췄어요`
      : "생성 또는 QA 단계에서 멈췄어요";
  }

  if (run.workflow_status === "script_pending_approval") {
    return "대본 승인 대기";
  }

  if (run.workflow_status === "image_pending_approval") {
    return "이미지 승인 대기";
  }

  if (run.workflow_status === "publishing") {
    return "인스타 업로드 중";
  }

  if (run.workflow_status === "published") {
    return "인스타 업로드 완료";
  }

  if (run.status === "completed") {
    return `${run.project?.slides.length ?? run.design_plan?.slides.length ?? "?"}장 카드뉴스 생성 완료`;
  }

  if (run.current_stage) {
    return `${stageMeta[run.current_stage].title} 진행 중`;
  }

  return "에이전트 준비 중";
}

export function AgentStageBar({ run }: { run: RunState | null }) {
  const completed = run
    ? run.logs.filter((log) => log.status === "completed").length
    : 0;
  const progress = (completed / Object.keys(stageMeta).length) * 100;

  return (
    <div className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Agent pipeline
          </div>
          <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-[#17171b]">
            {getHeadline(run)}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="secondary">{run ? run.status : "idle"}</Badge>
          {run ? (
            <Badge variant="secondary">{workflowMeta[run.workflow_status].label}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <Progress value={progress} className="h-3" />
      </div>

      <div className="mt-5 space-y-3">
        {(run?.logs ?? []).map((log) => (
          <div
            key={log.stage}
            className="flex items-center justify-between gap-4 rounded-[22px] border border-black/5 bg-[#faf8fb] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`${stageMeta[log.stage].color} h-4 w-4 rounded-full ${
                  log.status === "pending" ? "opacity-30" : ""
                }`}
              />
              <div>
                <div className="text-[15px] font-black tracking-[-0.03em] text-[#17171b]">
                  {stageMeta[log.stage].label}
                </div>
                <div className="max-w-[220px] text-sm font-bold leading-5 text-zinc-500">
                  {log.summary ?? stageMeta[log.stage].summary}
                </div>
              </div>
            </div>
            <div className="text-sm font-black text-zinc-400">{log.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
