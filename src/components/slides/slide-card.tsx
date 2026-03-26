"use client";

import type { CSSProperties } from "react";

import {
  accentTokenMap,
  brandText,
  formatPageCounter,
  getPatternDecoration,
  getSlideLayoutMetrics,
  getSlideVariant,
  isEditorialTheme,
  resolveEditorialSlide,
} from "@/lib/design/editorial-core";
import { type Slide, type SlideModule } from "@/lib/agents/schema";
import { cn } from "@/lib/utils";

type SlideCardProps = {
  slide: Slide;
  totalSlides?: number;
  themeName?: string | null;
  className?: string;
};

const shellStyle: CSSProperties = {
  aspectRatio: "4 / 5",
  borderRadius: 34,
  overflow: "hidden",
};

const previewStyles = {
  squareBubbleRing: {
    borderColor: "var(--cover-ring-soft)",
  },
  squareBubbleFill: {
    background: "var(--orange-tint-soft)",
  },
  cornerPillBlock: {
    background: "var(--blue-tint-soft)",
  },
  cornerPillOrb: {
    background: "var(--green-tint-soft)",
  },
  coverOrbStrong: {
    background: "var(--cover-orb-strong)",
  },
  coverOrbSoft: {
    background: "var(--cover-orb-soft)",
  },
  coverOrbTop: {
    background: "var(--cover-orb-top)",
  },
  panel: {
    background: "var(--white)",
    boxShadow: "var(--shadow-module)",
  },
  panelMutedText: {
    color: "var(--muted-deep)",
  },
  panelBodyText: {
    color: "var(--ink)",
  },
  panelSupportText: {
    color: "var(--ink-soft)",
  },
  accentBanner: {
    background: "var(--orange-banner)",
    color: "var(--white)",
    boxShadow: "var(--shadow-accent-soft)",
  },
  accentHero: {
    background: "var(--orange-banner)",
    color: "var(--white)",
    boxShadow: "var(--shadow-accent)",
  },
  codeWindow: {
    background: "var(--dark)",
    boxShadow: "var(--shadow-module)",
  },
  codeDotRed: {
    background: "var(--code-dot-red)",
  },
  codeDotYellow: {
    background: "var(--code-dot-yellow)",
  },
  codeDotGreen: {
    background: "var(--code-dot-green)",
  },
  codeTitle: {
    color: "var(--code-title-ink)",
  },
  codeAccent: {
    color: "var(--code-accent)",
  },
  codeBody: {
    color: "var(--code-body)",
  },
  timelineTrack: {
    background: "var(--timeline-track)",
  },
  checklistDivider: {
    borderColor: "var(--soft-divider)",
  },
  checklistNumber: {
    background: "var(--orange-strong)",
    color: "var(--white)",
  },
  coverShell: {
    background: "var(--orange)",
    boxShadow: "var(--shadow-cover)",
  },
  coverBadge: {
    background: "var(--badge-dark)",
    color: "var(--cover-badge-ink)",
  },
  coverHeadline: {
    color: "var(--ink)",
  },
  coverBody: {
    color: "var(--cover-body-ink)",
  },
  coverBrand: {
    color: "var(--cover-brand-ink)",
  },
  coverFrame: {
    borderColor: "var(--cover-outline-strong)",
    background: "var(--cover-card)",
  },
  coverPaper: {
    borderColor: "var(--cover-outline-strong)",
    background: "var(--cover-paper)",
  },
  coverChip: {
    borderColor: "var(--cover-outline-strong)",
    background: "var(--cover-chip)",
  },
  coverChipText: {
    color: "var(--cover-outline)",
  },
  closingShell: {
    background: "var(--dark-surface)",
    color: "var(--white)",
    boxShadow: "var(--shadow-dark)",
  },
  closingBadge: {
    background: "var(--orange)",
    color: "var(--white)",
  },
  closingCounter: {
    color: "var(--closing-counter-ink)",
  },
  closingBody: {
    color: "var(--closing-body-ink)",
  },
  closingAccentBar: {
    background: "var(--orange-strong)",
  },
  closingAccentText: {
    color: "var(--orange-strong)",
  },
  closingSubtleText: {
    color: "var(--closing-brand-ink)",
  },
  closingHeadline: {
    color: "var(--white)",
  },
  middleShell: {
    borderColor: "var(--paper-border)",
    background: "var(--paper)",
    boxShadow: "var(--shadow-card)",
  },
  middleBadge: {
    background: "var(--orange)",
    color: "var(--white)",
  },
  middleCounter: {
    color: "var(--muted)",
  },
  middleHeadline: {
    color: "var(--ink)",
  },
  middleBody: {
    color: "var(--ink-soft)",
  },
  middleAccent: {
    color: "var(--orange)",
  },
  middleBrand: {
    color: "var(--muted)",
  },
  accentHalo: {
    background: "var(--accent-halo)",
  },
  bannerKicker: {
    color: "var(--banner-kicker-ink)",
  },
  codeDivider: {
    borderColor: "var(--code-divider)",
  },
} satisfies Record<string, CSSProperties>;

function Decoration({ slide }: { slide: Slide }) {
  const decoration = getPatternDecoration(slide.layout_pattern);

  if (decoration === "none") {
    return null;
  }

  if (decoration === "square-bubble") {
    return (
      <div className="absolute right-12 top-32 z-[1] h-[220px] w-[200px]">
        <div
          className="absolute right-0 top-0 h-[92px] w-[92px] rounded-[28px] border-[10px]"
          style={previewStyles.squareBubbleRing}
        />
        <div
          className="absolute left-[-24px] top-[74px] h-[52px] w-[52px] rounded-full"
          style={previewStyles.squareBubbleFill}
        />
      </div>
    );
  }

  if (decoration === "corner-pills") {
    return (
      <div className="absolute right-12 top-32 z-[1] h-[180px] w-[220px]">
        <div
          className="absolute right-0 top-0 h-[68px] w-[160px] rounded-[24px]"
          style={previewStyles.cornerPillBlock}
        />
        <div
          className="absolute right-10 top-24 h-[42px] w-[92px] rounded-full"
          style={previewStyles.cornerPillOrb}
        />
      </div>
    );
  }

  if (decoration === "top-orb") {
    return (
      <div className="absolute right-10 top-28 z-[1] h-40 w-40 rounded-full" style={previewStyles.coverOrbTop} />
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 top-0 z-[1] pointer-events-none">
      <div className="absolute right-[-24px] top-24 h-52 w-52 rounded-full" style={previewStyles.coverOrbStrong} />
      <div className="absolute bottom-[-38px] left-[-24px] h-40 w-40 rounded-full" style={previewStyles.coverOrbSoft} />
    </div>
  );
}

function GenericGridModule({ module }: { module: SlideModule }) {
  const gridClass =
    module.items.length >= 4
      ? "grid-cols-2"
      : module.items.length === 3
        ? "grid-cols-3"
        : module.items.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  return (
    <div className="flex h-full flex-col rounded-[32px] px-7 py-6" style={previewStyles.panel}>
      <div className="text-[15px] font-black tracking-[-0.03em]" style={previewStyles.panelMutedText}>
        {module.title}
      </div>
      <div className={cn("mt-4 grid auto-rows-fr gap-4", gridClass)}>
        {module.items.map((item, index) => {
          const accent = accentTokenMap[item.accent];
          return (
            <div
              key={`${item.label}-${item.title}-${index}`}
              className="relative min-h-[180px] overflow-hidden rounded-[28px] px-6 py-5"
              style={{
                background: accent.background,
                color: accent.color,
              }}
            >
              <div className="absolute right-[-18px] top-[-18px] h-[86px] w-[86px] rounded-full" style={previewStyles.accentHalo} />
              <div className="text-[14px] font-extrabold opacity-90">{item.label}</div>
              <div className="mt-3 whitespace-pre-line text-[26px] font-black leading-[1.16] tracking-[-0.05em]">
                {item.title}
              </div>
              <div className="mt-2 whitespace-pre-line text-[17px] font-bold leading-[1.55]">
                {item.value}
              </div>
              {item.note ? (
                <div className="mt-2 whitespace-pre-line text-[13px] font-semibold leading-[1.5] opacity-90">
                  {item.note}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {module.footer ? (
        <div className="mt-4 text-center text-[14px] font-bold leading-[1.55]" style={previewStyles.panelMutedText}>
          {module.footer}
        </div>
      ) : null}
    </div>
  );
}

function BeforeAfterModule({ module }: { module: SlideModule }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {module.items.slice(0, 2).map((item, index) => {
          const accent = accentTokenMap[item.accent];
          return (
            <div
              key={`${item.label}-${item.title}-${index}`}
              className="relative min-h-[220px] overflow-hidden rounded-[30px] px-6 py-6"
              style={{
                boxShadow: "var(--shadow-module)",
                background: accent.background,
                color: accent.color,
              }}
            >
              <div className="absolute right-[-16px] top-[-16px] h-24 w-24 rounded-full" style={previewStyles.accentHalo} />
              <div className="text-[16px] font-black">{item.label}</div>
              <div className="mt-4 whitespace-pre-line text-[26px] font-black leading-[1.16] tracking-[-0.05em]">
                {item.title}
              </div>
              <div className="mt-3 whitespace-pre-line text-[17px] font-bold leading-[1.55]">
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
      {module.footer ? (
        <div className="relative overflow-hidden rounded-[30px] px-7 py-6" style={previewStyles.accentBanner}>
          <div className="absolute right-[-18px] top-[-20px] h-28 w-28 rounded-full" style={previewStyles.accentHalo} />
          <div className="relative whitespace-pre-line text-[20px] font-black leading-[1.5] tracking-[-0.04em]">
            {module.footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBannerModule({ module }: { module: SlideModule }) {
  const primary = module.items[0];

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[34px] px-8 py-10 text-center" style={previewStyles.accentHero}>
      <div className="absolute left-[-24px] bottom-[-28px] h-36 w-36 rounded-full" style={previewStyles.accentHalo} />
      <div className="absolute right-[-18px] top-[-24px] h-40 w-40 rounded-full" style={previewStyles.accentHalo} />
      {module.title ? (
        <div className="relative text-[18px] font-black" style={previewStyles.bannerKicker}>{module.title}</div>
      ) : null}
      <div className="relative mt-4 whitespace-pre-line text-[56px] font-black leading-[1.02] tracking-[-0.07em]">
        {primary?.title || primary?.value || module.title}
      </div>
      {primary?.value || module.footer ? (
        <div className="relative mx-auto mt-5 max-w-[80%] whitespace-pre-line text-[24px] font-bold leading-[1.48]">
          {primary?.value || module.footer}
        </div>
      ) : null}
    </div>
  );
}

function CodeWindowModule({ module }: { module: SlideModule }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[34px]" style={previewStyles.codeWindow}>
      <div className="flex items-center gap-3 border-b px-6 py-5" style={previewStyles.codeDivider}>
        <div className="h-[14px] w-[14px] rounded-full" style={previewStyles.codeDotRed} />
        <div className="h-[14px] w-[14px] rounded-full" style={previewStyles.codeDotYellow} />
        <div className="h-[14px] w-[14px] rounded-full" style={previewStyles.codeDotGreen} />
        <div className="ml-2 text-[20px] font-semibold" style={previewStyles.codeTitle}>{module.title}</div>
      </div>
      <div className="grid gap-[18px] px-6 py-6">
        {module.items.map((item, index) => (
          <div key={`${item.label}-${item.title}-${index}`} className="font-mono">
            <div className="whitespace-pre-line text-[22px] font-black leading-[1.4]" style={previewStyles.codeAccent}>
              {item.title}
            </div>
            <div className="mt-1 whitespace-pre-line text-[18px] font-semibold leading-[1.6]" style={previewStyles.codeBody}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleStripModule({ module }: { module: SlideModule }) {
  return (
    <div className="grid gap-3">
      {module.items.map((item, index) => {
        const accent = accentTokenMap[item.accent];
        return (
          <div
            key={`${item.label}-${item.title}-${index}`}
            className="grid min-h-[86px] grid-cols-[120px_minmax(0,1fr)_180px] items-center gap-4 rounded-[24px] px-6 py-4"
            style={{
              boxShadow: "var(--shadow-module)",
              background: accent.background,
              color: accent.color,
            }}
          >
            <div className="text-[18px] font-black">{item.label}</div>
            <div className="text-center text-[30px] font-black tracking-[-0.05em]">
              {item.title}
            </div>
            <div className="text-right text-[16px] font-bold">{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineModule({ module }: { module: SlideModule }) {
  const columnCount = Math.max(3, Math.min(4, module.items.length));

  return (
    <div className="flex h-full flex-col rounded-[32px] px-7 py-6" style={previewStyles.panel}>
      <div className="text-[15px] font-black tracking-[-0.03em]" style={previewStyles.panelMutedText}>
        {module.title}
      </div>
      <div className="relative mt-5">
        <div className="absolute left-[12%] right-[12%] top-[26px] h-[3px]" style={previewStyles.timelineTrack} />
        <div
          className="relative grid gap-5"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {module.items.slice(0, 4).map((item, index) => {
            const accent = accentTokenMap[item.accent];
            return (
              <div key={`${item.label}-${item.title}-${index}`} className="text-center">
                <div
                  className="mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-full text-[22px] font-black"
                  style={{
                    background: accent.background,
                    color: accent.color,
                  }}
                >
                  {item.label}
                </div>
                <div className="mt-4 whitespace-pre-line text-[18px] font-black leading-[1.4] tracking-[-0.04em]" style={previewStyles.panelBodyText}>
                  {item.title}
                </div>
                <div className="mt-2 whitespace-pre-line text-[16px] font-bold leading-[1.45]" style={previewStyles.panelSupportText}>
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {module.footer ? (
        <div className="mt-4 text-center text-[14px] font-bold leading-[1.55]" style={previewStyles.panelMutedText}>
          {module.footer}
        </div>
      ) : null}
    </div>
  );
}

function ChecklistTableModule({ module }: { module: SlideModule }) {
  return (
    <div className="flex h-full flex-col rounded-[32px] px-7 py-6" style={previewStyles.panel}>
      <div className="text-[16px] font-black" style={previewStyles.panelBodyText}>{module.title}</div>
      {module.items.map((item, index) => (
        <div
          key={`${item.label}-${item.title}-${index}`}
          className="grid min-h-[102px] grid-cols-[76px_minmax(0,1.1fr)_minmax(220px,0.9fr)] items-center gap-5 border-b py-[18px] last:border-b-0"
          style={previewStyles.checklistDivider}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full text-[20px] font-black" style={previewStyles.checklistNumber}>
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            {/^\d+$/u.test(item.label.trim()) ? null : (
              <div className="text-[13px] font-black uppercase tracking-[0.08em]" style={previewStyles.panelMutedText}>
                {item.label}
              </div>
            )}
            <div className="mt-1 whitespace-pre-line text-[20px] font-black tracking-[-0.03em]" style={previewStyles.panelBodyText}>
              {item.title}
            </div>
          </div>
          <div className="whitespace-pre-line text-right text-[20px] font-bold leading-[1.55]" style={previewStyles.panelSupportText}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModuleBlock({ slide }: { slide: Slide }) {
  if (slide.module.type === "before-after") {
    return <BeforeAfterModule module={slide.module} />;
  }

  if (slide.module.type === "message-banner" || slide.module.type === "number-spotlight") {
    return <MessageBannerModule module={slide.module} />;
  }

  if (slide.module.type === "code-window") {
    return <CodeWindowModule module={slide.module} />;
  }

  if (slide.module.type === "role-strip") {
    return <RoleStripModule module={slide.module} />;
  }

  if (slide.module.type === "timeline") {
    return <TimelineModule module={slide.module} />;
  }

  if (slide.module.type === "checklist-table") {
    return <ChecklistTableModule module={slide.module} />;
  }

  return <GenericGridModule module={slide.module} />;
}

export function SlideCard({
  slide,
  totalSlides = 8,
  themeName,
  className,
}: SlideCardProps) {
  const resolvedSlide = isEditorialTheme(themeName)
    ? resolveEditorialSlide(slide, totalSlides)
    : slide;
  const variant = getSlideVariant(resolvedSlide);
  const metrics = getSlideLayoutMetrics(resolvedSlide);

  if (variant === "cover") {
    return (
      <article
        className={cn(
          "relative overflow-hidden px-[58px] pb-[58px] pl-[68px] pt-[58px]",
          className,
        )}
        style={{ ...shellStyle, ...previewStyles.coverShell }}
      >
        <div className="flex h-full flex-col">
          <div className="inline-flex self-start rounded-[18px] px-6 py-3 text-[18px] font-black tracking-[-0.03em]" style={previewStyles.coverBadge}>
            {resolvedSlide.question_badge}
          </div>
          <h2
            className="relative z-[2] mt-10 whitespace-pre-line font-black tracking-[-0.09em]"
            style={{
              ...previewStyles.coverHeadline,
              maxWidth: metrics.titleWidth,
              fontSize: metrics.titleSize,
              lineHeight: 0.98,
            }}
          >
            {resolvedSlide.headline}
          </h2>
          <p
            className="relative z-[2] whitespace-pre-line font-bold tracking-[-0.03em]"
            style={{
              ...previewStyles.coverBody,
              maxWidth: metrics.bodyWidth,
              marginTop: metrics.bodyMarginTop,
              fontSize: metrics.bodySize,
              lineHeight: metrics.bodyLineHeight,
            }}
          >
            {resolvedSlide.body}
          </p>
          <div className="mt-auto flex items-end justify-between gap-6">
            <div className="max-w-[40%] whitespace-pre-line text-[18px] font-black tracking-[-0.03em]" style={previewStyles.coverBrand}>
              {resolvedSlide.emphasis || resolvedSlide.save_point}
            </div>
            <div className="relative h-[340px] w-[332px] shrink-0">
              <div className="absolute bottom-0 left-[58px] h-[208px] w-[188px] rounded-[34px] border-[10px]" style={previewStyles.coverFrame} />
              <div className="absolute left-[100px] top-[78px] h-[112px] w-[112px] rounded-[22px] border-[9px]" style={previewStyles.coverPaper} />
              <div className="absolute right-0 top-[18px] rounded-[18px] border-[8px] px-5 py-3 text-[34px] font-black" style={{ ...previewStyles.coverPaper, ...previewStyles.coverChipText }}>
                ...
              </div>
              <div className="absolute bottom-[64px] right-[40px] h-[92px] w-[92px] rounded-full border-[10px]" style={previewStyles.coverFrame} />
              <div className="absolute bottom-[38px] left-[18px] h-[62px] w-[62px] rounded-full border-[8px]" style={previewStyles.coverChip} />
            </div>
          </div>
        </div>
        <div className="absolute bottom-7 left-[68px] text-[18px] font-black tracking-[-0.03em]" style={previewStyles.coverBrand}>
          {brandText}
        </div>
      </article>
    );
  }

  if (variant === "closing") {
    return (
      <article
        className={cn(
          "relative overflow-hidden px-[58px] pb-[58px] pl-[68px] pt-[58px]",
          className,
        )}
        style={{ ...shellStyle, ...previewStyles.closingShell }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center rounded-[18px] px-5 py-3 text-[18px] font-black tracking-[-0.03em]" style={previewStyles.closingBadge}>
              {resolvedSlide.question_badge}
            </div>
            <div className="text-[22px] font-black tracking-[-0.04em]" style={previewStyles.closingCounter}>
              {formatPageCounter(resolvedSlide.slide_number, totalSlides)}
            </div>
          </div>
          <h2
            className="mt-10 whitespace-pre-line font-black tracking-[-0.08em]"
            style={{
              ...previewStyles.closingHeadline,
              maxWidth: metrics.titleWidth,
              fontSize: metrics.titleSize,
              lineHeight: 1.02,
            }}
          >
            {resolvedSlide.headline}
          </h2>
          <p
            className="whitespace-pre-line font-medium tracking-[-0.03em]"
            style={{
              ...previewStyles.closingBody,
              maxWidth: metrics.bodyWidth,
              marginTop: metrics.bodyMarginTop,
              fontSize: metrics.bodySize,
              lineHeight: metrics.bodyLineHeight,
            }}
          >
            {resolvedSlide.body}
          </p>
          <div className="mt-10 h-1 w-14 rounded-full" style={previewStyles.closingAccentBar} />
          <div className="mt-11 text-[28px] font-black tracking-[-0.04em]" style={previewStyles.closingSubtleText}>
            {resolvedSlide.emphasis || resolvedSlide.module.title}
          </div>
          <div className="mt-3 whitespace-pre-line text-[62px] font-black leading-[1.02] tracking-[-0.07em]" style={previewStyles.closingAccentText}>
            {resolvedSlide.save_point ||
              resolvedSlide.module.items[0]?.title ||
              resolvedSlide.module.items[0]?.value}
          </div>
        </div>
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[18px] font-black tracking-[-0.03em]" style={previewStyles.closingSubtleText}>
          {brandText}
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "relative overflow-hidden border px-[58px] pb-[58px] pl-[68px] pt-[58px]",
        className,
      )}
      style={{ ...shellStyle, ...previewStyles.middleShell }}
    >
      <Decoration slide={resolvedSlide} />
      <div className="flex h-full flex-col">
        <div className="relative z-[2] flex items-start justify-between gap-4">
          <div className="inline-flex items-center rounded-[18px] px-5 py-3 text-[18px] font-black tracking-[-0.03em]" style={previewStyles.middleBadge}>
            {resolvedSlide.question_badge}
          </div>
          <div className="text-[22px] font-black tracking-[-0.04em]" style={previewStyles.middleCounter}>
            {formatPageCounter(resolvedSlide.slide_number, totalSlides)}
          </div>
        </div>
        <h2
          className="relative z-[2] mt-10 whitespace-pre-line font-black tracking-[-0.08em]"
          style={{
            ...previewStyles.middleHeadline,
            maxWidth: metrics.titleWidth,
            fontSize: metrics.titleSize,
            lineHeight: 1.04,
          }}
        >
          {resolvedSlide.headline}
        </h2>
        <p
          className="relative z-[2] whitespace-pre-line font-medium tracking-[-0.03em]"
          style={{
            ...previewStyles.middleBody,
            maxWidth: metrics.bodyWidth,
            marginTop: metrics.bodyMarginTop,
            fontSize: metrics.bodySize,
            lineHeight: metrics.bodyLineHeight,
          }}
        >
          {resolvedSlide.body}
        </p>
        {resolvedSlide.emphasis ? (
          <div
            className="relative z-[2] mt-6 whitespace-pre-line font-black tracking-[-0.03em]"
            style={{
              ...previewStyles.middleAccent,
              fontSize: metrics.emphasisSize,
              lineHeight: 1.4,
            }}
          >
            {resolvedSlide.emphasis}
          </div>
        ) : null}
        {resolvedSlide.save_point ? (
          <div
            className="relative z-[2] mt-3 whitespace-pre-line font-black tracking-[-0.03em]"
            style={{
              ...previewStyles.middleHeadline,
              fontSize: metrics.saveSize,
              lineHeight: 1.5,
            }}
          >
            {resolvedSlide.save_point}
          </div>
        ) : null}
        <div
          className="relative z-[2] mt-auto flex items-end"
          style={{
            paddingTop: metrics.moduleZoneTop,
            paddingBottom: metrics.moduleZoneBottom,
          }}
        >
          <div
            className="mx-auto"
            style={{
              width: metrics.moduleWidth,
              minHeight: metrics.moduleMinHeight,
            }}
          >
            <ModuleBlock slide={resolvedSlide} />
          </div>
        </div>
        <div className="mt-[18px] text-center text-[17px] font-black tracking-[-0.03em]" style={previewStyles.middleBrand}>
          {brandText}
        </div>
      </div>
    </article>
  );
}
