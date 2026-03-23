"use client";

import { toBlob } from "html-to-image";
import JSZip from "jszip";
import {
  Download,
  Expand,
  FileArchive,
  FileJson2,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SlideCard } from "@/components/slides/slide-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AgentStageBar } from "@/components/workspace/agent-stage-bar";
import { RunOperationsLog } from "@/components/workspace/run-operations-log";
import {
  buildFallbackProject,
  buildFallbackSourceBundle,
} from "@/lib/agents/fallback";
import {
  moduleTypeValues,
  type CarouselProject,
  type ModuleType,
  type RunState,
  type Slide,
  type SlideModule,
} from "@/lib/agents/schema";
import {
  type InstagramPreflightCheck,
  type InstagramPublishReadiness,
} from "@/lib/integrations/instagram/client";
import { sampleEconomyText } from "@/lib/samples/content";

const sampleProject = buildFallbackProject(
  buildFallbackSourceBundle(
    sampleEconomyText,
    sampleEconomyText,
    "물가가 오르면 왜 체감이 다를까?",
  ),
);

const operatorSecretStorageKey = "econ-carousel-operator-secret";

const moduleLabels: Record<ModuleType, string> = {
  "role-strip": "역할 스트립",
  "before-after": "비포·애프터",
  "code-window": "노트/코드창",
  "checklist-table": "체크리스트 표",
  timeline: "타임라인",
  "three-card-summary": "3칸 요약",
  "number-spotlight": "숫자 스포트라이트",
  "message-banner": "한 줄 메시지",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function instagramCheckBadgeVariant(status: InstagramPreflightCheck["status"]) {
  if (status === "error") {
    return "destructive" as const;
  }

  return "secondary" as const;
}

function instagramCheckStatusLabel(status: InstagramPreflightCheck["status"]) {
  switch (status) {
    case "ok":
      return "ok";
    case "warning":
      return "warning";
    default:
      return "error";
  }
}

function remixModule(type: ModuleType, slide: Slide): SlideModule {
  const baseItems = slide.module.items.length > 0 ? slide.module.items : [];
  const seed = [
    slide.emphasis,
    slide.save_point,
    slide.source_excerpt,
    slide.body,
  ].filter(Boolean) as string[];

  if (type === "message-banner") {
    return {
      type,
      title: "관통 메시지",
      subtitle: null,
      items: [
        {
          label: "한 줄 핵심",
          title: slide.emphasis || "핵심",
          value: seed[0] || slide.body,
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
      items: seed.slice(0, 4).map((value, index) => ({
        label: String(index + 1),
        title: `단계 ${index + 1}`,
        value,
        note: null,
        accent: ["orange", "yellow", "blue", "green"][index] as
          | "orange"
          | "yellow"
          | "blue"
          | "green",
      })),
      footer: "순서대로 읽으면 이해가 더 쉬워져요.",
    };
  }

  if (type === "code-window") {
    return {
      type,
      title: "핵심 정리",
      subtitle: null,
      items: seed.slice(0, 4).map((value, index) => ({
        label: `#${index + 1}`,
        title: `포인트 ${index + 1}`,
        value,
        note: null,
        accent: "dark",
      })),
      footer: null,
    };
  }

  return {
    type,
    title: moduleLabels[type],
    subtitle: null,
    items:
      baseItems.length > 0
        ? baseItems.slice(0, type === "before-after" ? 2 : 4).map((item, index) => ({
            ...item,
            label:
              type === "before-after"
                ? index === 0
                  ? "오해"
                  : "실제"
                : item.label || `포인트 ${index + 1}`,
          }))
        : seed.slice(0, type === "before-after" ? 2 : 4).map((value, index) => ({
            label:
              type === "before-after"
                ? index === 0
                  ? "오해"
                  : "실제"
                : `포인트 ${index + 1}`,
            title: `핵심 ${index + 1}`,
            value,
            note: null,
            accent: ["orange", "blue", "green", "pink"][index] as
              | "orange"
              | "blue"
              | "green"
              | "pink",
          })),
    footer: type === "before-after" ? "겉으로 보이는 것과 실제 구조를 나눠서 봅니다." : null,
  };
}

export function EconCarouselApp() {
  const [title, setTitle] = useState("물가가 오르면 왜 체감이 다를까?");
  const [sourceText, setSourceText] = useState(sampleEconomyText);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [project, setProject] = useState<CarouselProject | null>(null);
  const [selectedSlideNumber, setSelectedSlideNumber] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishControlBusy, setIsPublishControlBusy] = useState(false);
  const [isDispatchBusy, setIsDispatchBusy] = useState(false);
  const [isProcessBusy, setIsProcessBusy] = useState(false);
  const [isSendImagesBusy, setIsSendImagesBusy] = useState(false);
  const [isFailRunBusy, setIsFailRunBusy] = useState(false);
  const [isRefreshBusy, setIsRefreshBusy] = useState(false);
  const [isInstagramPreflightBusy, setIsInstagramPreflightBusy] = useState(false);
  const [operatorSecret, setOperatorSecret] = useState("");
  const [instagramPreflight, setInstagramPreflight] =
    useState<InstagramPublishReadiness | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const exportRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const savedSecret = window.localStorage.getItem(operatorSecretStorageKey);

    if (savedSecret) {
      setOperatorSecret(savedSecret);
    }
  }, []);

  useEffect(() => {
    const normalized = operatorSecret.trim();

    if (normalized) {
      window.localStorage.setItem(operatorSecretStorageKey, normalized);
      return;
    }

    window.localStorage.removeItem(operatorSecretStorageKey);
  }, [operatorSecret]);

  const buildOperatorAuthHeaders = useCallback(() => {
    const normalizedSecret = operatorSecret.trim();

    return {
      ...(normalizedSecret
        ? {
            Authorization: `Bearer ${normalizedSecret}`,
            "x-operator-secret": normalizedSecret,
            "x-research-dispatch-secret": normalizedSecret,
          }
        : {}),
    };
  }, [operatorSecret]);

  const refreshRunState = useCallback(async (targetRunId: string) => {
    const response = await fetch(`/api/runs/${targetRunId}`, {
      cache: "no-store",
      headers: buildOperatorAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "run 상태를 불러오지 못했습니다.");
    }

    setRun(data);
    if (data.project) {
      setProject(data.project);
    }

    return data as RunState;
  }, [buildOperatorAuthHeaders]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const load = async () => {
      const data = await refreshRunState(runId).catch(() => null);

      if (!data || cancelled) {
        return;
      }

      if (data.status === "queued" || data.status === "running") {
        timeoutId = window.setTimeout(load, 1200);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [refreshRunState, runId]);

  const displayProject = project ?? sampleProject;
  const selectedSlide =
    displayProject.slides.find((slide) => slide.slide_number === selectedSlideNumber) ??
    displayProject.slides[0];

  const factSummary = useMemo(
    () => run?.source_bundle?.facts.slice(0, 6) ?? [],
    [run?.source_bundle],
  );
  const keyTerms = useMemo(
    () => run?.source_bundle?.key_terms.slice(0, 6) ?? [],
    [run?.source_bundle],
  );
  const numbers = useMemo(
    () => run?.source_bundle?.numbers.slice(0, 6) ?? [],
    [run?.source_bundle],
  );

  function buildOperatorJsonHeaders() {
    return {
      "Content-Type": "application/json",
      ...buildOperatorAuthHeaders(),
    };
  }

  function getCurrentRunId() {
    return run?.id ?? runId;
  }

  async function handleSubmit() {
    if (!sourceText.trim() && !pdfFile) {
      toast.error("텍스트를 붙여넣거나 PDF를 업로드해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setRun(null);
    setProject(null);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("sourceText", sourceText);
      formData.append("audience", "middle_school");

      if (pdfFile) {
        formData.append("sourcePdf", pdfFile);
      }

      const response = await fetch("/api/runs", {
        method: "POST",
        headers: buildOperatorAuthHeaders(),
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "생성을 시작하지 못했습니다.");
      }

      setRunId(data.runId);
      setSelectedSlideNumber(1);
      toast.success("에이전트 파이프라인을 시작했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "생성 시작에 실패했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegenerateSlide() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId || !project) {
      return;
    }

    try {
      const response = await fetch(`/api/runs/${targetRunId}/regenerate-slide`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({ slideNumber: selectedSlide.slide_number }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "슬라이드 재생성에 실패했습니다.");
      }

      setRun(data);
      setProject(data.project);
      toast.success(`${selectedSlide.slide_number}번 슬라이드를 다시 만들었어요.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "슬라이드 재생성에 실패했어요.",
      );
    }
  }

  function updateSlide(patch: Partial<Slide>) {
    if (!project) {
      return;
    }

    setProject({
      ...project,
      slides: project.slides.map((slide) =>
        slide.slide_number === selectedSlide.slide_number ? { ...slide, ...patch } : slide,
      ),
    });
  }

  function updateModuleType(type: ModuleType) {
    if (!project) {
      return;
    }

    updateSlide({ module: remixModule(type, selectedSlide) });
  }

  async function captureSlide(slideNumber: number) {
    const node = exportRefs.current[slideNumber];

    if (!node) {
      throw new Error("슬라이드 렌더가 아직 준비되지 않았습니다.");
    }

    await document.fonts.ready;
    const blob = await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: "transparent",
      canvasWidth: 1080,
      canvasHeight: 1350,
      cacheBust: true,
    });

    if (!blob) {
      throw new Error("PNG 추출에 실패했습니다.");
    }

    return blob;
  }

  async function exportSelectedPng() {
    if (!project) {
      return;
    }

    try {
      const blob = await captureSlide(selectedSlide.slide_number);
      downloadBlob(
        blob,
        `${slugify(project.project_title)}-${selectedSlide.slide_number}.png`,
      );
      toast.success("현재 슬라이드를 PNG로 저장했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PNG 저장에 실패했어요.");
    }
  }

  async function exportAllPngs() {
    if (!project) {
      return;
    }

    setIsExporting(true);

    try {
      const zip = new JSZip();
      const base = slugify(project.project_title || "econ-carousel");

      for (const slide of project.slides) {
        const blob = await captureSlide(slide.slide_number);
        zip.file(`${base}-${slide.slide_number}.png`, blob);
      }

      zip.file("caption.txt", project.caption);
      zip.file("slide-plan.json", JSON.stringify(project, null, 2));
      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(archive, `${base}-slides.zip`);
      toast.success("PNG ZIP을 만들었어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PNG export에 실패했어요.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportArtifactsZip() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      return;
    }

    try {
      const response = await fetch(`/api/runs/${targetRunId}/export`, {
        method: "POST",
        headers: buildOperatorAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "run artifact export에 실패했습니다.");
      }

      const blob = await response.blob();
      downloadBlob(blob, `${targetRunId}-artifacts.zip`);
      toast.success("run artifact ZIP을 내려받았어요.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "run artifact export에 실패했어요.",
      );
    }
  }

  function exportCaption() {
    if (!project) {
      return;
    }

    downloadBlob(
      new Blob([project.caption], { type: "text/plain;charset=utf-8" }),
      `${slugify(project.project_title)}-caption.txt`,
    );
  }

  function exportJson() {
    if (!project) {
      return;
    }

    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      `${slugify(project.project_title)}-slide-plan.json`,
    );
  }

  function loadSample() {
    setTitle("물가가 오르면 왜 체감이 다를까?");
    setSourceText(sampleEconomyText);
    setPdfFile(null);
    toast.success("샘플 경제 텍스트를 불러왔어요.");
  }

  async function handleRetryPublish() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      return;
    }

    setIsPublishControlBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/publish/control`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({ action: "retry" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "게시 재시도에 실패했습니다.");
      }

      setRun(data.run);
      if (data.run?.project) {
        setProject(data.run.project);
      }
      toast.success("인스타 게시를 다시 시도했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "게시 재시도에 실패했어요.");
    } finally {
      setIsPublishControlBusy(false);
    }
  }

  async function handleDispatchResearch() {
    setIsDispatchBusy(true);

    try {
      const response = await fetch("/api/research/dispatch", {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "research dispatch에 실패했습니다.");
      }

      if (data.status === "dispatched" && data.run) {
        setRunId(data.run.id);
        setRun(data.run);
        setProject(data.run.project ?? null);
        setSelectedSlideNumber(1);
        toast.success(`${data.run.title ?? "새 research"}를 시작했어요.`);
        return;
      }

      if (data.status === "skipped") {
        if (data.activeRun?.id) {
          setRunId(data.activeRun.id);
          await refreshRunState(data.activeRun.id);
        }

        toast(data.message ?? "진행 중인 run이 있어 새 research를 건너뛰었어요.");
        return;
      }

      toast.success("research dispatch 요청을 보냈어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "research dispatch에 실패했어요.");
    } finally {
      setIsDispatchBusy(false);
    }
  }

  async function handleSendImages() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      toast.error("이미지 전송할 run이 없어요.");
      return;
    }

    setIsSendImagesBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/telegram/send-images`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "이미지 Telegram 전송에 실패했습니다.");
      }

      if (data.run) {
        setRun(data.run);
        if (data.run.project) {
          setProject(data.run.project);
        }
      }

      toast.success("렌더된 이미지를 Telegram으로 보냈어요.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "이미지 Telegram 전송에 실패했어요.",
      );
    } finally {
      setIsSendImagesBusy(false);
    }
  }

  async function handleFailRun() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      toast.error("종료할 run이 없어요.");
      return;
    }

    setIsFailRunBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/fail`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({
          reason: "운영자 UI에서 run을 종료했어요.",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "run 종료에 실패했습니다.");
      }

      setRun(data);
      if (data.project) {
        setProject(data.project);
      }

      toast.success("현재 run을 실패 처리했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "run 종료에 실패했어요.");
    } finally {
      setIsFailRunBusy(false);
    }
  }

  async function handleRefreshRun() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      toast.error("새로고침할 run이 없어요.");
      return;
    }

    setIsRefreshBusy(true);

    try {
      await refreshRunState(targetRunId);
      toast.success("현재 run 상태를 다시 불러왔어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "run 새로고침에 실패했어요.");
    } finally {
      setIsRefreshBusy(false);
    }
  }

  async function handleInstagramPreflight() {
    setIsInstagramPreflightBusy(true);

    try {
      const response = await fetch("/api/instagram/preflight", {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({
          runId: getCurrentRunId(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Instagram publish 점검에 실패했습니다.");
      }

      setInstagramPreflight(data as InstagramPublishReadiness);
      toast.success(
        data.status === "ready"
          ? "Instagram publish 직전 점검이 모두 통과했어요."
          : "Instagram publish 전에 확인할 항목을 정리했어요.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Instagram publish 점검에 실패했어요.",
      );
    } finally {
      setIsInstagramPreflightBusy(false);
    }
  }

  async function handleProcessRun() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      toast.error("진행할 run이 없어요.");
      return;
    }

    setIsProcessBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/process`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: "{}",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "카드뉴스 생성 진행에 실패했습니다.");
      }

      if (data.run) {
        setRun(data.run);
        if (data.run.project) {
          setProject(data.run.project);
        }
      }

      toast.success("승인된 run의 카드뉴스 생성을 진행했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "카드뉴스 생성 진행에 실패했어요.");
    } finally {
      setIsProcessBusy(false);
    }
  }

  async function handleStartPublish() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      return;
    }

    setIsPublishControlBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/publish`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "인스타 게시 시작에 실패했습니다.");
      }

      setRun(data.run);
      if (data.run?.project) {
        setProject(data.run.project);
      }
      toast.success("인스타 게시를 시작했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "인스타 게시 시작에 실패했어요.");
    } finally {
      setIsPublishControlBusy(false);
    }
  }

  async function handleStopPublish() {
    const targetRunId = getCurrentRunId();

    if (!targetRunId) {
      return;
    }

    setIsPublishControlBusy(true);

    try {
      const response = await fetch(`/api/runs/${targetRunId}/publish/control`, {
        method: "POST",
        headers: buildOperatorJsonHeaders(),
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "게시 중단 처리에 실패했습니다.");
      }

      setRun(data.run);
      if (data.run?.project) {
        setProject(data.run.project);
      }
      toast.success("이번 게시 재시도를 중단으로 기록했어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "게시 중단 처리에 실패했어요.");
    } finally {
      setIsPublishControlBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f0ea] text-[#17171b]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,107,53,0.16),transparent_30%),radial-gradient(circle_at_90%_12%,rgba(91,141,239,0.10),transparent_24%),linear-gradient(180deg,#fff8f3_0%,#efe9f0_100%)]" />
      <div className="relative mx-auto max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between rounded-full border border-black/5 bg-white/80 px-5 py-3 backdrop-blur">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">
              보리의 10대를 위한 경제
            </div>
            <div className="text-sm font-bold text-zinc-600">
              한국 중학생용 경제 카드뉴스 자동화 스튜디오
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant="secondary">Q&A 카드 문법</Badge>
            <Badge variant="secondary">PDF 입력 지원</Badge>
            <Badge variant="secondary">에이전트 파이프라인</Badge>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <div className="rounded-[38px] bg-[#ff6b35] px-7 py-8 text-[#17171b] shadow-[0_28px_80px_rgba(255,107,53,0.18)]">
              <div className="inline-flex rounded-[18px] bg-black/10 px-5 py-3 text-[15px] font-black">
                보리의 10대를 위한 경제
              </div>
              <h1 className="mt-7 max-w-[9ch] text-[66px] font-black leading-[0.94] tracking-[-0.08em] sm:text-[82px]">
                경제 카드뉴스
                <br />
                이렇게 뽑아줘
              </h1>
              <p className="mt-6 max-w-[56ch] text-[22px] font-bold leading-9 text-[#6d412f]">
                경제학 텍스트를 붙여넣거나 PDF를 올리면, source-parser부터 qa-reviewer까지
                역할을 나눠 8장 카드뉴스를 만듭니다. 결과물은 인터뷰형 카드뉴스 문법으로
                정리되고 PNG로 바로 저장할 수 있어요.
              </p>
            </div>

            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                      Input
                    </div>
                    <h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">
                      자료 넣고 카드뉴스 만들기
                    </h2>
                  </div>
                  <Button variant="secondary" onClick={loadSample}>
                    샘플 불러오기
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>제목</Label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 물가가 오르면 왜 체감이 다를까?"
                  />
                </div>

                <div className="space-y-2">
                  <Label>경제학 텍스트</Label>
                  <Textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    rows={14}
                    className="resize-none text-base leading-7"
                    placeholder="경제학 책, 기사, 강의노트 요약을 붙여넣어 주세요."
                  />
                </div>

                <div className="space-y-3">
                  <Label>PDF 업로드</Label>
                  <label className="flex cursor-pointer items-center justify-between rounded-[22px] border border-dashed border-black/10 bg-[#faf8fb] px-5 py-4">
                    <div>
                      <div className="text-sm font-black text-[#17171b]">
                        {pdfFile ? pdfFile.name : "텍스트 PDF 또는 스캔 PDF를 올릴 수 있어요."}
                      </div>
                      <div className="mt-1 text-sm font-bold text-zinc-500">
                        파일이 있으면 source-parser가 텍스트와 함께 읽습니다.
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#17171b]">
                      <Upload className="h-4 w-4" />
                      업로드
                    </div>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                <Button
                  className="h-12 w-full text-base font-black"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      에이전트 준비 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      카드뉴스 만들기
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                "역할을 분리해 자료 해석과 카피, 디자인, QA를 나눠 처리합니다.",
                "각 슬라이드마다 다른 하단 모듈을 붙여 인터뷰형 리듬을 만듭니다.",
                "standalone HTML과 PNG export-ready 결과물을 함께 만듭니다.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[28px] border border-black/5 bg-white/75 p-4 text-sm font-bold leading-6 text-zinc-600 shadow-[0_14px_34px_rgba(44,34,24,0.06)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {displayProject.slides.slice(0, 3).map((slide) => (
              <SlideCard key={slide.slide_number} slide={slide} />
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
            <AgentStageBar run={run} />

              <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
                <CardContent className="space-y-3 p-5">
                <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Operator auth
                </div>
                <div className="text-sm font-bold leading-6 text-zinc-600">
                  운영용 API는 secret이 있으면 헤더 검증을 합니다. `OPERATOR_API_SECRET` 또는
                  fallback으로 `RESEARCH_DISPATCH_SECRET` 값을 한 번 입력해 두면 됩니다.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operator-secret">운영자 secret</Label>
                  <Input
                    id="operator-secret"
                    type="password"
                    value={operatorSecret}
                    onChange={(event) => setOperatorSecret(event.target.value)}
                    placeholder="운영용 secret"
                  />
                </div>
                </CardContent>
              </Card>

              <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                        Instagram preflight
                      </div>
                      <div className="mt-2 text-xl font-black tracking-[-0.04em] text-[#17171b]">
                        게시 직전 점검
                      </div>
                      <p className="mt-2 text-sm font-bold leading-6 text-zinc-600">
                        토큰, IG 계정 접근, 공개 base URL, 현재 run의 첫 슬라이드 PNG URL까지
                        한 번에 점검합니다. Graph API Explorer 임시 토큰을 넣었는지도 같이 확인할 수 있습니다.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleInstagramPreflight}
                      disabled={!operatorSecret.trim() || isInstagramPreflightBusy}
                    >
                      {isInstagramPreflightBusy ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="mr-2 h-4 w-4" />
                      )}
                      Instagram 점검
                    </Button>
                  </div>

                  {instagramPreflight ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            instagramPreflight.status === "ready"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {instagramPreflight.status === "ready" ? "ready" : "needs attention"}
                        </Badge>
                        <Badge variant="secondary">
                          {instagramPreflight.account.username
                            ? `@${instagramPreflight.account.username}`
                            : instagramPreflight.account.igUserId ?? "IG user pending"}
                        </Badge>
                        <Badge variant="secondary">
                          {instagramPreflight.account.tokenKind === "page"
                            ? "page token"
                            : instagramPreflight.account.tokenKind === "user_or_unknown"
                              ? "token check"
                              : "token missing"}
                        </Badge>
                      </div>

                      <div className="rounded-[20px] bg-[#faf8fb] px-4 py-4 text-sm font-bold leading-6 text-zinc-600">
                        {instagramPreflight.summary}
                      </div>

                      <div className="space-y-3">
                        {instagramPreflight.checks.map((check) => (
                          <div
                            key={check.id}
                            className="rounded-[20px] border border-black/5 bg-white px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-black text-[#17171b]">{check.label}</div>
                              <Badge variant={instagramCheckBadgeVariant(check.status)}>
                                {instagramCheckStatusLabel(check.status)}
                              </Badge>
                            </div>
                            <div className="mt-2 text-sm font-bold leading-6 text-zinc-600">
                              {check.message}
                            </div>
                            {check.details ? (
                              <div className="mt-2 break-all text-xs font-bold leading-5 text-zinc-400">
                                {check.details}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[20px] bg-[#faf8fb] px-4 py-4 text-sm font-bold leading-6 text-zinc-500">
                      실전 publish 전에 한 번 눌러 두면 production 토큰, IG 계정 접근, 공개
                      슬라이드 URL 상태를 미리 확인할 수 있습니다.
                    </div>
                  )}
                </CardContent>
              </Card>

              <RunOperationsLog
                run={run}
              hasOperatorSecret={Boolean(operatorSecret.trim())}
              isDispatchBusy={isDispatchBusy}
              isProcessBusy={isProcessBusy}
              isSendImagesBusy={isSendImagesBusy}
              isFailRunBusy={isFailRunBusy}
              isRefreshBusy={isRefreshBusy}
              isPublishControlBusy={isPublishControlBusy}
              onDispatchResearch={handleDispatchResearch}
              onProcessRun={handleProcessRun}
              onSendImages={handleSendImages}
              onFailRun={handleFailRun}
              onRefreshRun={handleRefreshRun}
              onStartPublish={handleStartPublish}
              onRetryPublish={handleRetryPublish}
              onStopPublish={handleStopPublish}
            />

            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-5 p-5">
                <div>
                  <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Source bundle
                  </div>
                  <div className="mt-2 text-xl font-black tracking-[-0.04em] text-[#17171b]">
                    {run?.source_bundle?.source_title ?? "아직 분석 전"}
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-zinc-500">
                    {run?.source_bundle?.source_summary ??
                      "생성이 끝나면 source-parser가 잡아낸 핵심 요약이 여기에 보입니다."}
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Fact lines
                  </div>
                  <ScrollArea className="h-[220px] pr-4">
                    <div className="space-y-3">
                      {factSummary.length > 0 ? (
                        factSummary.map((fact) => (
                          <div
                            key={fact.fact}
                            className="rounded-[20px] bg-[#faf8fb] px-4 py-3 text-sm font-bold leading-6 text-zinc-600"
                          >
                            {fact.fact}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[20px] bg-[#faf8fb] px-4 py-3 text-sm font-bold leading-6 text-zinc-500">
                          생성이 끝나면 source-parser가 고른 핵심 문장이 보입니다.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="space-y-3">
                  <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Terms
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {keyTerms.length > 0 ? (
                      keyTerms.map((term) => (
                        <Badge key={term} variant="secondary">
                          {term}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm font-bold text-zinc-500">
                        핵심 용어가 아직 없습니다.
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Numbers
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {numbers.length > 0 ? (
                      numbers.map((number) => (
                        <Badge key={number} variant="secondary">
                          {number}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm font-bold text-zinc-500">
                        자료에 뚜렷한 숫자가 없어서 개념형 카드로 처리됩니다.
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-black/5 bg-white/80 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                      Result
                    </div>
                    <div className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#17171b]">
                      {displayProject.project_title}
                    </div>
                    <div className="mt-2 text-sm font-bold text-zinc-500">
                      {displayProject.theme_name} · {displayProject.slides.length} slides
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleRegenerateSlide}
                      disabled={!runId || !project}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      현재 슬라이드 재생성
                    </Button>
                    <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                      <Expand className="mr-2 h-4 w-4" />
                      확대 보기
                    </Button>
                    <Button onClick={exportSelectedPng} disabled={!project}>
                      <Download className="mr-2 h-4 w-4" />
                      현재 PNG
                    </Button>
                    <Button onClick={exportAllPngs} disabled={!project || isExporting}>
                      {isExporting ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      PNG ZIP
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-[34px] border border-black/5 bg-white/70 p-5 shadow-[0_22px_54px_rgba(44,34,24,0.08)]">
              <div className="mx-auto w-full max-w-[540px]">
                <SlideCard slide={selectedSlide} />
              </div>
            </div>

            <ScrollArea className="w-full whitespace-nowrap pb-3">
              <div className="flex gap-3">
                {displayProject.slides.map((slide) => (
                  <button
                    key={slide.slide_number}
                    type="button"
                    onClick={() => setSelectedSlideNumber(slide.slide_number)}
                    className={`w-[170px] shrink-0 rounded-[24px] border p-3 text-left transition ${
                      slide.slide_number === selectedSlideNumber
                        ? "border-[#17171b] bg-[#17171b] text-white"
                        : "border-black/5 bg-white/85 text-[#17171b]"
                    }`}
                  >
                    <div className="mx-auto w-full max-w-[110px]">
                      <SlideCard slide={slide} />
                    </div>
                    <div className="mt-3 text-[12px] font-black uppercase tracking-[0.2em] opacity-70">
                      {String(slide.slide_number).padStart(2, "0")} / 08
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-black leading-5 tracking-[-0.03em]">
                      {slide.headline}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-3 p-5">
                <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Caption
                </div>
                <div className="rounded-[22px] bg-[#faf8fb] px-4 py-4 text-sm font-bold leading-7 text-zinc-600 whitespace-pre-line">
                  {displayProject.caption}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-4 p-5">
                <div>
                  <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Slide editor
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-[#17171b]">
                    현재 카드 수정
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>질문 배지</Label>
                  <Input
                    value={selectedSlide.question_badge}
                    onChange={(event) => updateSlide({ question_badge: event.target.value })}
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>질문 헤드라인</Label>
                  <Textarea
                    value={selectedSlide.headline}
                    onChange={(event) => updateSlide({ headline: event.target.value })}
                    rows={4}
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>본문</Label>
                  <Textarea
                    value={selectedSlide.body}
                    onChange={(event) => updateSlide({ body: event.target.value })}
                    rows={5}
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>강조 문구</Label>
                  <Input
                    value={selectedSlide.emphasis ?? ""}
                    onChange={(event) =>
                      updateSlide({
                        emphasis: event.target.value.trim() || null,
                      })
                    }
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>저장 포인트</Label>
                  <Input
                    value={selectedSlide.save_point ?? ""}
                    onChange={(event) =>
                      updateSlide({
                        save_point: event.target.value.trim() || null,
                      })
                    }
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>하단 모듈 패턴</Label>
                  <Select
                    value={selectedSlide.module.type}
                    onValueChange={(value) => updateModuleType(value as ModuleType)}
                    disabled={!project}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moduleTypeValues.map((type) => (
                        <SelectItem key={type} value={type}>
                          {moduleLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>모듈 제목</Label>
                  <Input
                    value={selectedSlide.module.title}
                    onChange={(event) =>
                      updateSlide({
                        module: { ...selectedSlide.module, title: event.target.value },
                      })
                    }
                    disabled={!project}
                  />
                </div>

                <div className="space-y-2">
                  <Label>원문 근거</Label>
                  <Textarea value={selectedSlide.source_excerpt} rows={4} disabled />
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-4 p-5">
                <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Export
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={exportArtifactsZip}
                  disabled={!runId}
                >
                  <FileArchive className="mr-2 h-4 w-4" />
                  run ZIP 내려받기
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={exportCaption}
                  disabled={!project}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  캡션 저장
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={exportJson}
                  disabled={!project}
                >
                  <FileJson2 className="mr-2 h-4 w-4" />
                  슬라이드 플랜 JSON
                </Button>
              </CardContent>
            </Card>

            <Card className="border-black/5 bg-white/85 shadow-[0_18px_40px_rgba(44,34,24,0.08)]">
              <CardContent className="space-y-4 p-5">
                <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  QA report
                </div>
                {run?.qa_report ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ["high", run.qa_report.high_count],
                        ["medium", run.qa_report.medium_count],
                        ["low", run.qa_report.low_count],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-[20px] bg-[#faf8fb] px-4 py-4 text-center"
                        >
                          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400">
                            {label}
                          </div>
                          <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#17171b]">
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      {run.qa_report.checks_passed.map((check) => (
                        <div
                          key={check}
                          className="rounded-[18px] bg-[#faf8fb] px-4 py-3 text-sm font-bold text-zinc-600"
                        >
                          {check}
                        </div>
                      ))}
                    </div>
                    {run.qa_report.issues.length > 0 ? (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          {run.qa_report.issues.map((issue, index) => (
                            <div
                              key={`${issue.message}-${index}`}
                              className="rounded-[18px] border border-black/5 bg-white px-4 py-3 text-sm font-bold text-zinc-600"
                            >
                              [{issue.severity}] {issue.message}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-[20px] bg-[#faf8fb] px-4 py-3 text-sm font-bold text-zinc-500">
                    qa-reviewer가 끝나면 검수 결과가 여기에 보입니다.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-[min(92vw,720px)] border border-black/5 bg-[#f4f0f4] p-5">
            <DialogTitle className="sr-only">슬라이드 확대 보기</DialogTitle>
            <div className="mx-auto w-full max-w-[560px]">
              <SlideCard slide={selectedSlide} />
            </div>
          </DialogContent>
        </Dialog>

        {project ? (
          <div className="pointer-events-none fixed left-[-20000px] top-0 opacity-0">
            {project.slides.map((slide) => (
              <div
                key={slide.slide_number}
                ref={(node) => {
                  exportRefs.current[slide.slide_number] = node;
                }}
                style={{ width: 1080 }}
              >
                <SlideCard slide={slide} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
