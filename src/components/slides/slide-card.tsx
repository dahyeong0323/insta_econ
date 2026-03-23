"use client";

import { type Slide, type SlideModule } from "@/lib/agents/schema";
import { cn } from "@/lib/utils";

type SlideCardProps = {
  slide: Slide;
  className?: string;
};

const BRAND_TEXT =
  "ECON CAROUSEL \u00b7 \uc911\ud559\uc0dd \uacbd\uc81c \uce74\ub4dc\ub274\uc2a4";
const COVER_FOCUS_FALLBACK =
  "\uc2dc\uac04\uc774 \uc9c0\ub098\ub3c4 \uac00\uce58\uac00 \ubc84\ud2f0\ub294\uac00\uac00 \ud575\uc2ec";

const lightSlideThemes = {
  2: { background: "#f2f1f5", borderColor: "#e7e5eb" },
  3: { background: "#f2f1f5", borderColor: "#e7e5eb" },
  4: { background: "#f3f2f6", borderColor: "#e8e6ed" },
  5: { background: "#f3f2f6", borderColor: "#e8e6ed" },
  6: { background: "#f2f1f5", borderColor: "#e7e5eb" },
  7: { background: "#f2f1f5", borderColor: "#e7e5eb" },
} as const;

const accentMap = {
  orange: "bg-[#ff7847] text-white",
  blue: "bg-[#5d8ff5] text-white",
  green: "bg-[#51d8a1] text-[#0f3929]",
  pink: "bg-[#f57aaa] text-white",
  yellow: "bg-[#ffc74b] text-[#3f2b00]",
  dark: "bg-[#1f1f22] text-[#f7f6f9]",
} as const;

function getLightTheme(slideNumber: number) {
  return (
    lightSlideThemes[slideNumber as keyof typeof lightSlideThemes] ?? {
      background: "#f2f1f5",
      borderColor: "#e7e5eb",
    }
  );
}

function getModuleWidth(slideNumber: number) {
  if (slideNumber === 3 || slideNumber === 6) {
    return "w-[94%] mx-auto";
  }

  return "w-full";
}

function getLightLayout(slide: Slide) {
  switch (slide.role) {
    case "core":
      return {
        titleClass: "max-w-[86%] text-[66px]",
        bodyClass: "mt-[54px] max-w-[84%] text-[30px] leading-[1.62]",
        emphasisClass: "mt-7 text-[26px]",
        saveClass: "mt-4 text-[21px]",
        moduleShellClass: "min-h-[408px]",
        moduleZoneClass: "pt-8 pb-9",
      };
    case "why":
      return {
        titleClass: "max-w-[92%] text-[68px]",
        bodyClass: "mt-[50px] max-w-[82%] text-[30px] leading-[1.62]",
        emphasisClass: "mt-7 text-[26px]",
        saveClass: "mt-4 text-[21px]",
        moduleShellClass: "min-h-[430px]",
        moduleZoneClass: "pt-7 pb-9",
      };
    case "example":
      return {
        titleClass: "max-w-[92%] text-[64px]",
        bodyClass: "mt-[48px] max-w-[84%] text-[28px] leading-[1.64]",
        emphasisClass: "mt-7 text-[25px]",
        saveClass: "mt-4 text-[20px]",
        moduleShellClass: "min-h-[484px]",
        moduleZoneClass: "pt-7 pb-10",
      };
    case "compare":
      return {
        titleClass: "max-w-[90%] text-[64px]",
        bodyClass: "mt-[50px] max-w-[82%] text-[29px] leading-[1.62]",
        emphasisClass: "mt-7 text-[25px]",
        saveClass: "mt-4 text-[20px]",
        moduleShellClass: "min-h-[432px]",
        moduleZoneClass: "pt-8 pb-9",
      };
    case "number_or_steps":
      return {
        titleClass: "max-w-[92%] text-[64px]",
        bodyClass: "mt-[50px] max-w-[82%] text-[29px] leading-[1.64]",
        emphasisClass: "mt-7 text-[25px]",
        saveClass: "mt-4 text-[20px]",
        moduleShellClass: "min-h-[404px]",
        moduleZoneClass: "pt-8 pb-12",
      };
    case "recap":
      return {
        titleClass: "max-w-[92%] text-[68px]",
        bodyClass: "mt-[54px] max-w-[82%] text-[30px] leading-[1.64]",
        emphasisClass: "mt-7 text-[26px]",
        saveClass: "mt-4 text-[21px]",
        moduleShellClass: "min-h-[396px]",
        moduleZoneClass: "pt-8 pb-10",
      };
    default:
      return {
        titleClass: "max-w-[86%] text-[66px]",
        bodyClass: "mt-[68px] max-w-[88%] text-[28px] leading-[1.7]",
        emphasisClass: "mt-6 text-[24px]",
        saveClass: "mt-4 text-[20px]",
        moduleShellClass: "min-h-[396px]",
        moduleZoneClass: "pt-10 pb-9",
      };
  }
}

function formatPageCounter(page: number) {
  return `${String(page).padStart(2, "0")} / 08`;
}

function QuestionBadge({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[18px] px-5 py-3 text-[18px] font-black tracking-[-0.03em]",
        dark ? "bg-white/8 text-zinc-100" : "bg-[#ff6b35] text-white",
      )}
    >
      {label}
    </div>
  );
}

function PageCounter({ page, dark = false }: { page: number; dark?: boolean }) {
  return (
    <div
      className={cn(
        "text-[22px] font-black tracking-[-0.04em]",
        dark ? "text-zinc-500" : "text-[#b4b0b8]",
      )}
    >
      {formatPageCounter(page)}
    </div>
  );
}

function LightDecoration({ slideNumber }: { slideNumber: number }) {
  if (slideNumber === 2) {
    return (
      <div className="absolute right-10 top-36">
        <div className="relative h-24 w-24 rounded-[28px] border-[10px] border-[#ffb99b]" />
        <div className="absolute -bottom-2 -left-6 h-12 w-12 rounded-full bg-[#ffd6c6]" />
      </div>
    );
  }

  if (slideNumber === 3) {
    return (
      <div className="absolute right-10 top-[136px]">
        <div className="h-64 w-20 rounded-full bg-[#d9e3ff]" />
        <div className="absolute -left-10 top-0 h-[72px] w-[72px] rounded-[22px] border-[9px] border-[#90acf6]" />
      </div>
    );
  }

  if (slideNumber === 4) {
    return null;
  }

  if (slideNumber === 5) {
    return (
      <div className="absolute right-10 top-[136px]">
        <div className="h-[70px] w-44 rounded-[22px] bg-[#f7ccdb]" />
        <div className="absolute left-8 top-24 h-11 w-24 rounded-full bg-[#ffdfea]" />
      </div>
    );
  }

  if (slideNumber === 6) {
    return (
      <div className="absolute right-10 top-[136px]">
        <div className="h-24 w-24 rounded-[24px] bg-[#ffe09d]" />
        <div className="absolute -left-6 top-24 h-14 w-14 rounded-full border-[8px] border-[#ffd05e]" />
      </div>
    );
  }

  if (slideNumber === 7) {
    return null;
  }

  return null;
}

function showLightDecoration(slide: Slide) {
  if (slide.module.type === "timeline" || slide.module.type === "checklist-table") {
    return false;
  }

  if (slide.slide_number >= 5 && slide.module.items.length >= 4) {
    return false;
  }

  return true;
}

function CardGrid({
  module,
  colsClass,
  minHeight = "min-h-[220px]",
}: {
  module: SlideModule;
  colsClass: string;
  minHeight?: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-[32px] bg-white p-6 shadow-[0_24px_50px_rgba(34,29,27,0.10)]">
      {module.title ? (
        <div className="mb-4 text-[15px] font-black tracking-[-0.03em] text-zinc-400">
          {module.title}
        </div>
      ) : null}
      <div className={cn("grid auto-rows-fr gap-4", colsClass)}>
        {module.items.map((item, index) => (
          <div
            key={`${item.label}-${item.title}-${index}`}
            className={cn(
              minHeight,
              "relative h-full overflow-hidden rounded-[28px] px-6 py-6",
              accentMap[item.accent],
            )}
          >
            <div className="absolute right-[-18px] top-[-18px] h-20 w-20 rounded-full bg-white/12" />
            <div className="text-[14px] font-bold opacity-85">{item.label}</div>
            <div className="mt-4 whitespace-pre-line text-[26px] font-black leading-[1.18] tracking-[-0.05em]">
              {item.title}
            </div>
            <div className="mt-3 whitespace-pre-line text-[17px] font-bold leading-7">
              {item.value}
            </div>
            {item.note ? (
              <div className="mt-3 whitespace-pre-line text-[14px] font-semibold leading-6 opacity-85">
                {item.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {module.footer ? (
        <div className="mt-4 whitespace-pre-line text-center text-[14px] font-bold text-zinc-400">
          {module.footer}
        </div>
      ) : null}
    </div>
  );
}

function CodeWindowModule({ module }: { module: SlideModule }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] bg-[#232326] shadow-[0_24px_54px_rgba(18,18,22,0.18)]">
      <div className="flex items-center gap-3 border-b border-white/8 px-7 py-5">
        <div className="h-4 w-4 rounded-full bg-[#ff5f57]" />
        <div className="h-4 w-4 rounded-full bg-[#febc2e]" />
        <div className="h-4 w-4 rounded-full bg-[#28c840]" />
        <div className="ml-3 text-[20px] font-semibold tracking-[-0.03em] text-zinc-400">
          {module.title}
        </div>
      </div>
      <div className="flex-1 space-y-5 px-7 py-7">
        {module.items.map((item, index) => (
          <div
            key={`${item.label}-${item.title}-${index}`}
            className="font-mono text-[22px] leading-[1.7] tracking-[-0.02em]"
          >
            <div className="text-[#83c26b]">{item.title}</div>
            <div className="mt-1 text-[#d7b09d]">{item.value}</div>
          </div>
        ))}
      </div>
      {module.footer ? (
        <div className="px-7 pb-7">
          <div className="inline-flex rounded-[18px] border border-[#7a3531] bg-[#432320] px-5 py-3 text-[18px] font-black text-[#ff6159]">
            {module.footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoleStripModule({ module }: { module: SlideModule }) {
  return (
    <div className="flex h-full flex-col justify-end space-y-3">
      {module.items.map((item, index) => (
        <div
          key={`${item.label}-${item.title}-${index}`}
          className={cn(
            "flex min-h-[88px] items-center justify-between gap-4 rounded-[22px] px-6 py-4 shadow-[0_16px_36px_rgba(44,34,24,0.10)]",
            accentMap[item.accent],
          )}
        >
          <div className="text-[18px] font-black">{item.label}</div>
          <div className="flex-1 text-center text-[30px] font-black tracking-[-0.05em]">
            {item.title}
          </div>
          <div className="text-right text-[16px] font-bold opacity-85">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function BeforeAfterModule({ module }: { module: SlideModule }) {
  const topItems = module.items.slice(0, 2);
  const bannerText = module.footer || module.items[2]?.title || module.items[2]?.value;

  return (
    <div className="flex h-full flex-col justify-end space-y-4">
      <div className="grid flex-1 grid-cols-2 gap-4">
        {topItems.map((item, index) => (
          <div
            key={`${item.label}-${item.title}-${index}`}
            className={cn(
              "relative min-h-[240px] overflow-hidden rounded-[30px] px-6 py-6 shadow-[0_20px_42px_rgba(34,29,27,0.10)]",
              accentMap[item.accent],
            )}
          >
            <div className="absolute right-[-16px] top-[-18px] h-24 w-24 rounded-full bg-white/10" />
            <div className="text-[16px] font-black">{item.label}</div>
            <div className="mt-4 whitespace-pre-line text-[26px] font-black leading-[1.16] tracking-[-0.05em]">
              {item.title}
            </div>
            <div className="mt-3 whitespace-pre-line text-[17px] font-bold leading-7">
              {item.value}
            </div>
          </div>
        ))}
      </div>
      {bannerText ? (
        <div className="relative overflow-hidden rounded-[28px] bg-[#ff965f] px-7 py-6 text-white shadow-[0_20px_42px_rgba(255,107,53,0.12)]">
          <div className="absolute right-[-12px] top-[-18px] h-24 w-24 rounded-full bg-white/12" />
          <div className="whitespace-pre-line text-[20px] font-black leading-8 tracking-[-0.04em]">
            {bannerText}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChecklistTableModule({ module }: { module: SlideModule }) {
  return (
    <div className="flex h-full flex-col rounded-[32px] bg-white px-7 py-6 shadow-[0_24px_50px_rgba(34,29,27,0.10)]">
      <div className="text-[16px] font-black text-[#202024]">{module.title}</div>
      <div className="mt-4 flex-1 space-y-1">
        {module.items.map((item, index) => (
          <div
            key={`${item.label}-${item.title}-${index}`}
            className="grid min-h-[94px] grid-cols-[64px_minmax(0,1fr)_minmax(220px,auto)] items-center gap-5 border-b border-zinc-100 py-5 last:border-b-0"
          >
            <div className="flex h-12 w-12 items-center justify-center self-start rounded-full bg-[#ff8a57] text-[16px] font-black text-white">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-black uppercase tracking-[0.08em] text-[#b0acb5]">
                {item.label}
              </div>
              <div className="mt-1 whitespace-pre-line text-[18px] font-black tracking-[-0.03em] text-[#202024]">
                {item.title}
              </div>
            </div>
            <div className="whitespace-pre-line text-right text-[18px] font-medium leading-7 text-zinc-400">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineModule({ module }: { module: SlideModule }) {
  const topItems = module.items.slice(0, 4);

  return (
    <div className="flex h-full flex-col justify-end space-y-4">
      <div className="rounded-[32px] bg-white px-7 py-5 shadow-[0_24px_50px_rgba(34,29,27,0.10)]">
        <div className="relative grid grid-cols-4 gap-5">
          <div className="absolute left-[12%] right-[12%] top-7 h-[3px] bg-[#dfdde3]" />
          {topItems.map((item, index) => (
            <div key={`${item.label}-${item.title}-${index}`} className="relative text-center">
              <div
                className={cn(
                  "mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-full text-[22px] font-black",
                  accentMap[item.accent],
                )}
              >
                {item.label}
              </div>
              <div className="mt-4 whitespace-pre-line text-[18px] font-black leading-7 tracking-[-0.04em] text-[#202024]">
                {item.title}
              </div>
              <div className="mt-2 whitespace-pre-line text-[16px] font-bold leading-6 text-zinc-500">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

        <CardGrid
          module={module}
          colsClass={module.items.length > 3 ? "grid-cols-2" : "grid-cols-3"}
          minHeight={module.items.length > 3 ? "min-h-[164px]" : "min-h-[204px]"}
        />
      </div>
  );
}

function NumberSpotlightModule({ module }: { module: SlideModule }) {
  const item = module.items[0];
  const helper =
    item?.value && item.value !== item.title
      ? item.value
      : module.footer || module.subtitle || module.title;

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[34px] bg-[#ff8757] px-8 py-8 text-white shadow-[0_24px_50px_rgba(255,107,53,0.16)]">
      <div className="absolute -left-10 bottom-[-28px] h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute right-[-8px] top-[-20px] h-32 w-32 rounded-full bg-white/12" />
      <div className="text-[18px] font-black tracking-[-0.03em] text-white/80">
        {item?.label || module.title}
      </div>
      <div className="mt-7 whitespace-pre-line text-center text-[66px] font-black leading-[0.95] tracking-[-0.08em]">
        {item?.title || item?.value || module.title}
      </div>
      <div className="mt-6 whitespace-pre-line text-center text-[24px] font-bold leading-9 text-white/92">
        {helper}
      </div>
    </div>
  );
}

function MessageBannerModule({ module }: { module: SlideModule }) {
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[34px] bg-[#ff8a58] px-8 py-10 text-center text-white shadow-[0_24px_50px_rgba(255,107,53,0.16)]">
      <div className="absolute -left-8 bottom-[-26px] h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute right-[-8px] top-[-22px] h-36 w-36 rounded-full bg-white/10" />
      {module.title ? (
        <div className="text-[18px] font-black tracking-[-0.03em] text-white/80">{module.title}</div>
      ) : null}
      <div className="mt-4 whitespace-pre-line text-[58px] font-black leading-[1.02] tracking-[-0.07em]">
        {module.items[0]?.title || module.items[0]?.value || module.title}
      </div>
      {(module.items[0]?.value || module.footer) && (
        <div className="mx-auto mt-6 max-w-[80%] whitespace-pre-line text-[24px] font-bold leading-9 text-white/90">
          {module.items[0]?.value || module.footer}
        </div>
      )}
    </div>
  );
}

function ModuleBlock({ slide }: { slide: Slide }) {
  const slideModule = slide.module;
  const moduleShellClass =
    slide.role === "example"
      ? "min-h-[484px]"
      : slide.role === "number_or_steps"
        ? "min-h-[404px]"
        : slide.role === "why" || slide.role === "compare"
          ? "min-h-[432px]"
          : slide.role === "recap"
            ? "min-h-[396px]"
            : "min-h-[408px]";

  if (slideModule.type === "code-window") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <CodeWindowModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "role-strip") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <RoleStripModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "before-after") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <BeforeAfterModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "checklist-table") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <ChecklistTableModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "timeline") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <TimelineModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "number-spotlight") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <NumberSpotlightModule module={slideModule} />
      </div>
    );
  }

  if (slideModule.type === "message-banner") {
    return (
      <div className={cn("w-full", moduleShellClass)}>
        <MessageBannerModule module={slideModule} />
      </div>
    );
  }

  const colsClass =
    slideModule.items.length >= 4
      ? "grid-cols-2"
      : slideModule.items.length === 3
        ? "grid-cols-3"
        : slideModule.items.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  return (
    <div className={cn("w-full", moduleShellClass)}>
      <CardGrid module={slideModule} colsClass={colsClass} />
    </div>
  );
}

export function SlideCard({ slide, className }: SlideCardProps) {
  if (slide.slide_number === 1) {
    return (
      <article
        className={cn(
          "relative aspect-[4/5] overflow-hidden rounded-[34px] bg-[#ff6b35] p-[58px] shadow-[0_28px_70px_rgba(255,107,53,0.22)]",
          className,
        )}
      >
        <div className="flex h-full flex-col">
          <div className="inline-flex self-start rounded-[18px] bg-black/10 px-7 py-4 text-[17px] font-black tracking-[-0.03em] text-[#211d1f]">
            {slide.question_badge}
          </div>

          <h2 className="mt-10 max-w-[72%] whitespace-pre-line text-[84px] font-black leading-[0.98] tracking-[-0.09em] text-[#151518]">
            {slide.headline}
          </h2>

          <p className="mt-10 max-w-[78%] whitespace-pre-line text-[30px] font-bold leading-[1.5] tracking-[-0.03em] text-[#94533f]">
            {slide.body}
          </p>

          <div className="mt-auto flex items-end justify-between">
            <div className="max-w-[40%] text-[18px] font-black tracking-[-0.03em] text-[#8b4f3a]">
              {slide.emphasis || COVER_FOCUS_FALLBACK}
            </div>

            <div className="relative h-[330px] w-[340px] shrink-0">
              <div className="absolute bottom-0 left-[56px] h-[210px] w-[190px] rounded-[34px] border-[10px] border-[#342721]/85 bg-[#d97c59]" />
              <div className="absolute left-[96px] top-[72px] h-[112px] w-[112px] rounded-[22px] border-[9px] border-[#342721]/85 bg-[#ffe4d2]" />
              <div className="absolute right-[6px] top-[16px] rounded-[18px] border-[8px] border-[#342721]/85 bg-[#ffe4d2] px-5 py-3 text-[34px] font-black text-[#342721]">
                …
              </div>
              <div className="absolute right-[42px] bottom-[60px] h-[92px] w-[92px] rounded-full border-[10px] border-[#342721]/85 bg-[#d97c59]" />
              <div className="absolute left-[16px] bottom-[34px] h-[62px] w-[62px] rounded-full border-[8px] border-[#342721]/85 bg-[#ffd368]" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-7 left-[58px] text-[18px] font-black tracking-[-0.03em] text-[#8b4f3a]">
          {BRAND_TEXT}
        </div>
      </article>
    );
  }

  if (slide.slide_number === 8) {
    return (
      <article
        className={cn(
          "relative aspect-[4/5] overflow-hidden rounded-[34px] bg-[#111113] p-[58px] shadow-[0_28px_70px_rgba(17,17,19,0.28)]",
          className,
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between">
            <QuestionBadge label={slide.question_badge} dark />
            <PageCounter page={8} dark />
          </div>

          <h2 className="mt-10 max-w-[82%] whitespace-pre-line text-[70px] font-black leading-[1.02] tracking-[-0.08em] text-white">
            {slide.headline}
          </h2>

          <div className="mt-[180px] max-w-[72%] whitespace-pre-line text-[33px] font-medium leading-[1.72] tracking-[-0.03em] text-[#d2d0d6]">
            {slide.body}
          </div>

          <div className="mt-10 h-[4px] w-14 rounded-full bg-[#ff7b49]" />

          <div className="mt-12 text-[28px] font-black tracking-[-0.04em] text-zinc-500">
            {slide.emphasis || slide.module.title}
          </div>

          <div className="mt-4 whitespace-pre-line text-[62px] font-black leading-[1.02] tracking-[-0.07em] text-[#ff7648]">
            {slide.save_point || slide.module.items[0]?.title || slide.module.items[0]?.value}
          </div>
        </div>

        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[18px] font-black tracking-[-0.03em] text-zinc-600">
          {BRAND_TEXT}
        </div>
      </article>
    );
  }

  const theme = getLightTheme(slide.slide_number);
  const moduleWidth = getModuleWidth(slide.slide_number);
  const layout = getLightLayout(slide);

  return (
    <article
      className={cn(
        "relative aspect-[4/5] overflow-hidden rounded-[34px] border p-[58px] shadow-[0_24px_56px_rgba(44,34,24,0.08)]",
        className,
      )}
      style={{
        background: theme.background,
        borderColor: theme.borderColor,
      }}
    >
      {showLightDecoration(slide) ? <LightDecoration slideNumber={slide.slide_number} /> : null}

      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <QuestionBadge label={slide.question_badge} />
          <PageCounter page={slide.slide_number} />
        </div>

        <h2
          className={cn(
            "mt-10 whitespace-pre-line font-black leading-[1.05] tracking-[-0.08em] text-[#16161a]",
            layout.titleClass,
          )}
        >
          {slide.headline}
        </h2>

        <p
          className={cn(
            "whitespace-pre-line font-medium tracking-[-0.03em] text-[#76717a]",
            layout.bodyClass,
          )}
        >
          {slide.body}
        </p>

        {slide.emphasis ? (
          <div
            className={cn(
              "whitespace-pre-line font-black leading-8 tracking-[-0.03em] text-[#ff6b35]",
              layout.emphasisClass,
            )}
          >
            {slide.emphasis}
          </div>
        ) : null}

        {slide.save_point ? (
          <div
            className={cn(
              "whitespace-pre-line font-black leading-8 tracking-[-0.03em] text-[#1c1c20]",
              layout.saveClass,
            )}
          >
            {slide.save_point}
          </div>
        ) : null}

        <div
          className={cn("mt-auto flex items-end", moduleWidth, layout.moduleZoneClass)}
        >
          <ModuleBlock slide={slide} />
        </div>
        <div className="mt-5 shrink-0 text-center text-[17px] font-black tracking-[-0.03em] text-[#bab6be]">
          {BRAND_TEXT}
        </div>
      </div>
    </article>
  );
}
