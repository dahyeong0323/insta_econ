import {
  accentTokenMap,
  brandText,
  editorialTokenCss,
  formatPageCounter,
  getPatternDecoration,
  getSlideLayoutMetrics,
  getSlideVariant,
  resolveEditorialSlide,
} from "@/lib/design/editorial-core";
import { type CarouselProject, type Slide, type SlideModule } from "@/lib/agents/schema";

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value: string | null | undefined) {
  return escapeHtml(value).replaceAll("\n", "<br/>");
}

const baseCss = `
${editorialTokenCss}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:var(--font-base);background:transparent;color:var(--ink)}
.canvas{position:relative;width:var(--canvas-width);height:var(--canvas-height);overflow:hidden;border-radius:var(--radius-canvas)}
.cover{background:var(--orange);box-shadow:var(--shadow-cover)}
.middle{background:var(--paper);box-shadow:var(--shadow-card);border:1px solid var(--paper-border)}
.closing{background:var(--dark-surface);box-shadow:var(--shadow-dark);color:var(--white)}
.inner{position:absolute;inset:0;padding:var(--safe-y-top) var(--safe-x-right) var(--safe-y-bottom) var(--safe-x-left)}
.stack{display:flex;height:100%;flex-direction:column}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;position:relative;z-index:2}
.badge{display:inline-flex;align-items:center;border-radius:var(--radius-chip);padding:12px 20px;background:var(--orange);color:var(--white);font-size:18px;font-weight:900;letter-spacing:-0.03em}
.cover-badge{display:inline-flex;align-items:center;border-radius:var(--radius-chip);padding:14px 24px;background:var(--badge-dark);color:var(--cover-badge-ink);font-size:18px;font-weight:900;letter-spacing:-0.03em}
.page-counter{font-size:22px;font-weight:900;letter-spacing:-0.04em;color:var(--muted)}
.page-counter.closing{color:var(--closing-counter-ink)}
.title{position:relative;z-index:2;margin:40px 0 0;font-weight:900;letter-spacing:-0.08em;white-space:pre-line}
.title.cover-title{color:var(--ink);line-height:0.98}
.title.middle-title{color:var(--ink);line-height:1.04}
.title.closing-title{color:var(--white);line-height:1.02}
.body{position:relative;z-index:2;font-weight:500;letter-spacing:-0.03em;white-space:pre-line;color:var(--ink-soft)}
.body.cover-body{color:var(--cover-body-ink)}
.body.closing-body{color:var(--closing-body-ink)}
.emphasis{position:relative;z-index:2;margin-top:24px;color:var(--orange);font-weight:900;letter-spacing:-0.03em;white-space:pre-line}
.save-point{position:relative;z-index:2;margin-top:14px;color:var(--ink);font-weight:900;letter-spacing:-0.03em;white-space:pre-line}
.module-zone{position:relative;z-index:2;margin-top:auto;display:flex;align-items:flex-end}
.brand{margin-top:18px;text-align:center;font-size:17px;font-weight:900;letter-spacing:-0.03em;color:var(--muted)}
.cover-brand{position:absolute;left:var(--safe-x-left);bottom:28px;color:var(--orange-quiet);font-size:18px;font-weight:900;letter-spacing:-0.03em}
.closing-brand{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);color:var(--closing-brand-ink);font-size:18px;font-weight:900;letter-spacing:-0.03em}
.shape{position:absolute;z-index:1;opacity:0.9}
.shape.soft-orbs::before,.shape.soft-orbs::after,.shape.square-bubble::before,.shape.square-bubble::after,.shape.corner-pills::before,.shape.corner-pills::after,.shape.top-orb::before{content:"";position:absolute}
.shape.soft-orbs::before{right:-34px;top:-12px;width:220px;height:220px;border-radius:999px;background:var(--cover-orb-strong)}
.shape.soft-orbs::after{left:-42px;bottom:-54px;width:180px;height:180px;border-radius:999px;background:var(--cover-orb-soft)}
.shape.square-bubble::before{right:0;top:0;width:92px;height:92px;border-radius:28px;border:10px solid var(--cover-ring-soft)}
.shape.square-bubble::after{left:-24px;top:74px;width:52px;height:52px;border-radius:999px;background:var(--orange-tint-soft)}
.shape.corner-pills::before{right:4px;top:0;width:160px;height:68px;border-radius:24px;background:var(--blue-tint-soft)}
.shape.corner-pills::after{right:44px;top:92px;width:92px;height:42px;border-radius:999px;background:var(--green-tint-soft)}
.shape.top-orb::before{right:-24px;top:-24px;width:156px;height:156px;border-radius:999px;background:var(--cover-orb-top)}
.module-card{display:flex;height:100%;flex-direction:column;border-radius:var(--radius-panel);background:var(--white);box-shadow:var(--shadow-module);padding:26px 28px}
.module-kicker{font-size:15px;font-weight:900;letter-spacing:-0.03em;color:var(--muted-deep)}
.module-grid{display:grid;grid-auto-rows:1fr;gap:16px;margin-top:18px}
.grid-1{grid-template-columns:1fr}
.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.accent-card{position:relative;overflow:hidden;border-radius:28px;padding:22px 24px;min-height:180px}
.accent-card::after{content:"";position:absolute;right:-18px;top:-18px;width:86px;height:86px;border-radius:999px;background:var(--accent-halo)}
.item-label{font-size:14px;font-weight:800;opacity:0.88}
.item-title{margin-top:12px;font-size:26px;line-height:1.16;font-weight:900;letter-spacing:-0.05em;white-space:pre-line}
.item-value{margin-top:10px;font-size:17px;line-height:1.55;font-weight:700;white-space:pre-line}
.item-note{margin-top:10px;font-size:13px;line-height:1.5;font-weight:600;opacity:0.88;white-space:pre-line}
.module-footer{margin-top:14px;text-align:center;font-size:14px;font-weight:700;line-height:1.55;color:var(--muted-deep)}
.before-after{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.message-banner,.spotlight-banner{position:relative;overflow:hidden;border-radius:34px;background:var(--orange-banner);box-shadow:var(--shadow-module);color:var(--white)}
.message-banner::before,.message-banner::after,.spotlight-banner::before,.spotlight-banner::after{content:"";position:absolute;border-radius:999px;background:var(--accent-halo)}
.message-banner::before,.spotlight-banner::before{left:-26px;bottom:-30px;width:144px;height:144px}
.message-banner::after,.spotlight-banner::after{right:-18px;top:-24px;width:160px;height:160px}
.message-banner{padding:34px 32px;text-align:center}
.banner-kicker{position:relative;z-index:1;font-size:18px;font-weight:900;color:var(--banner-kicker-ink)}
.banner-title{position:relative;z-index:1;margin-top:14px;font-size:56px;line-height:1.02;font-weight:900;letter-spacing:-0.07em;white-space:pre-line}
.banner-copy{position:relative;z-index:1;margin:20px auto 0;max-width:80%;font-size:24px;line-height:1.48;font-weight:700;white-space:pre-line}
.code-window{display:flex;height:100%;flex-direction:column;overflow:hidden;border-radius:34px;background:var(--dark);box-shadow:var(--shadow-module)}
.code-window-header{display:flex;align-items:center;gap:10px;padding:20px 26px;border-bottom:1px solid var(--code-divider)}
.dot{width:14px;height:14px;border-radius:999px}
.dot.red{background:var(--code-dot-red)}.dot.yellow{background:var(--code-dot-yellow)}.dot.green{background:var(--code-dot-green)}
.code-window-title{margin-left:10px;font-size:20px;font-weight:700;color:var(--code-title-ink)}
.code-window-body{padding:24px 26px;display:grid;gap:18px}
.code-line{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.code-line .item-title{margin-top:0;font-size:22px;color:var(--code-accent)}
.code-line .item-value{font-size:18px;color:var(--code-body)}
.role-strips{display:grid;gap:12px}
.role-strip{display:grid;grid-template-columns:120px minmax(0,1fr) 180px;align-items:center;gap:16px;padding:18px 22px;border-radius:24px;box-shadow:var(--shadow-module)}
.role-strip .item-label{font-size:18px;opacity:1}
.role-strip .item-title{margin-top:0;text-align:center;font-size:30px}
.role-strip .item-value{text-align:right;font-size:16px}
.timeline-card{display:flex;flex-direction:column;height:100%;border-radius:var(--radius-panel);background:var(--white);box-shadow:var(--shadow-module);padding:24px 28px}
.timeline-shell{position:relative;margin-top:18px}
.timeline-line{position:absolute;left:12%;right:12%;top:26px;height:3px;background:var(--timeline-track)}
.timeline-grid{position:relative;display:grid;gap:20px}
.timeline-step{text-align:center}
.timeline-dot{display:flex;align-items:center;justify-content:center;width:54px;height:54px;margin:0 auto;border-radius:999px;font-size:22px;font-weight:900}
.timeline-step .item-title{font-size:18px;line-height:1.4;margin-top:14px;color:var(--ink)}
.timeline-step .item-value{font-size:16px;line-height:1.45;color:var(--ink-soft)}
.checklist-card{display:flex;flex-direction:column;height:100%;border-radius:var(--radius-panel);background:var(--white);box-shadow:var(--shadow-module);padding:24px 28px}
.checklist-title{font-size:16px;font-weight:900;color:var(--ink)}
.checklist-row{display:grid;grid-template-columns:76px minmax(0,1.1fr) minmax(220px,0.9fr);align-items:center;gap:22px;padding:18px 0;border-bottom:1px solid var(--soft-divider)}
.checklist-row:last-child{border-bottom:none}
.checklist-icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--orange-soft);color:var(--white);font-size:20px;font-weight:900}
.checklist-copy{min-width:0}
.checklist-copy .item-label{font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted-deep);opacity:1}
.checklist-copy .item-title{font-size:20px;color:var(--ink)}
.checklist-value{font-size:20px;line-height:1.55;font-weight:700;color:var(--ink-soft);text-align:right;white-space:pre-line}
.cover-hero-art{position:relative;width:332px;height:340px;flex:0 0 auto}
.hero-body{position:absolute;left:58px;bottom:0;width:188px;height:208px;border-radius:34px;border:10px solid var(--cover-outline-strong);background:var(--cover-card)}
.hero-head{position:absolute;left:100px;top:78px;width:112px;height:112px;border-radius:22px;border:9px solid var(--cover-outline-strong);background:var(--cover-paper)}
.hero-bubble{position:absolute;right:0;top:18px;padding:14px 20px;border-radius:18px;border:8px solid var(--cover-outline-strong);background:var(--cover-paper);color:var(--cover-outline);font-size:34px;font-weight:900}
.hero-orb{position:absolute;right:40px;bottom:64px;width:92px;height:92px;border-radius:999px;border:10px solid var(--cover-outline-strong);background:var(--cover-card)}
.hero-coin{position:absolute;left:18px;bottom:38px;width:62px;height:62px;border-radius:999px;border:8px solid var(--cover-outline-strong);background:var(--cover-chip)}
.closing-divider{margin-top:38px;width:56px;height:4px;border-radius:999px;background:var(--orange-soft)}
.closing-kicker{margin-top:44px;font-size:28px;font-weight:900;letter-spacing:-0.04em;color:var(--closing-brand-ink)}
.closing-final{margin-top:14px;font-size:62px;line-height:1.02;font-weight:900;letter-spacing:-0.07em;color:var(--orange-soft);white-space:pre-line}
`;

function getGridClass(count: number) {
  if (count >= 4) {
    return "grid-2";
  }

  if (count === 3) {
    return "grid-3";
  }

  if (count === 2) {
    return "grid-2";
  }

  return "grid-1";
}

function renderAccentCard(item: SlideModule["items"][number]) {
  const accent = accentTokenMap[item.accent];

  return `<div class="accent-card" style="background:${accent.background};color:${accent.color};">
    <div class="item-label">${escapeHtml(item.label)}</div>
    <div class="item-title">${nl2br(item.title)}</div>
    <div class="item-value">${nl2br(item.value)}</div>
    ${item.note ? `<div class="item-note">${nl2br(item.note)}</div>` : ""}
  </div>`;
}

function renderGenericGrid(module: SlideModule) {
  return `<div class="module-card">
    <div class="module-kicker">${escapeHtml(module.title)}</div>
    <div class="module-grid ${getGridClass(module.items.length)}">
      ${module.items.map((item) => renderAccentCard(item)).join("")}
    </div>
    ${module.footer ? `<div class="module-footer">${nl2br(module.footer)}</div>` : ""}
  </div>`;
}

function renderBeforeAfter(module: SlideModule) {
  return `<div>
    <div class="before-after">
      ${module.items.slice(0, 2).map((item) => renderAccentCard(item)).join("")}
    </div>
    ${module.footer ? `<div class="module-footer">${nl2br(module.footer)}</div>` : ""}
  </div>`;
}

function renderMessageBanner(module: SlideModule) {
  const primary = module.items[0];

  return `<div class="message-banner">
    ${module.title ? `<div class="banner-kicker">${escapeHtml(module.title)}</div>` : ""}
    <div class="banner-title">${nl2br(primary?.title || primary?.value || module.title)}</div>
    ${primary?.value || module.footer ? `<div class="banner-copy">${nl2br(primary?.value || module.footer)}</div>` : ""}
  </div>`;
}

function renderCodeWindow(module: SlideModule) {
  return `<div class="code-window">
    <div class="code-window-header">
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
      <div class="code-window-title">${escapeHtml(module.title)}</div>
    </div>
    <div class="code-window-body">
      ${module.items
        .map(
          (item) => `<div class="code-line">
            <div class="item-title">${nl2br(item.title)}</div>
            <div class="item-value">${nl2br(item.value)}</div>
          </div>`,
        )
        .join("")}
    </div>
  </div>`;
}

function renderRoleStrips(module: SlideModule) {
  return `<div class="role-strips">
    ${module.items
      .map((item) => {
        const accent = accentTokenMap[item.accent];
        return `<div class="role-strip" style="background:${accent.background};color:${accent.color};">
          <div class="item-label">${escapeHtml(item.label)}</div>
          <div class="item-title">${nl2br(item.title)}</div>
          <div class="item-value">${nl2br(item.value)}</div>
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderChecklistTable(module: SlideModule) {
  return `<div class="checklist-card">
    <div class="checklist-title">${escapeHtml(module.title)}</div>
    ${module.items
      .map(
        (item, index) => `<div class="checklist-row">
          <div class="checklist-icon">${String(index + 1).padStart(2, "0")}</div>
          <div class="checklist-copy">
            ${/^\d+$/u.test(item.label.trim()) ? "" : `<div class="item-label">${escapeHtml(item.label)}</div>`}
            <div class="item-title">${nl2br(item.title)}</div>
          </div>
          <div class="checklist-value">${nl2br(item.value)}</div>
        </div>`,
      )
      .join("")}
  </div>`;
}

function renderTimeline(module: SlideModule) {
  const columnCount = Math.max(3, Math.min(4, module.items.length));

  return `<div class="timeline-card">
    <div class="module-kicker">${escapeHtml(module.title)}</div>
    <div class="timeline-shell">
      <div class="timeline-line"></div>
      <div class="timeline-grid" style="grid-template-columns:repeat(${columnCount},minmax(0,1fr));">
        ${module.items
          .slice(0, 4)
          .map((item) => {
            const accent = accentTokenMap[item.accent];
            return `<div class="timeline-step">
              <div class="timeline-dot" style="background:${accent.background};color:${accent.color};">${escapeHtml(item.label)}</div>
              <div class="item-title">${nl2br(item.title)}</div>
              <div class="item-value">${nl2br(item.value)}</div>
            </div>`;
          })
          .join("")}
      </div>
    </div>
    ${module.footer ? `<div class="module-footer">${nl2br(module.footer)}</div>` : ""}
  </div>`;
}

function renderModule(module: SlideModule) {
  if (module.type === "before-after") {
    return renderBeforeAfter(module);
  }

  if (module.type === "message-banner" || module.type === "number-spotlight") {
    return renderMessageBanner(module);
  }

  if (module.type === "code-window") {
    return renderCodeWindow(module);
  }

  if (module.type === "role-strip") {
    return renderRoleStrips(module);
  }

  if (module.type === "checklist-table") {
    return renderChecklistTable(module);
  }

  if (module.type === "timeline") {
    return renderTimeline(module);
  }

  return renderGenericGrid(module);
}

function renderDecoration(slide: Slide) {
  const decoration = getPatternDecoration(slide.layout_pattern);
  if (decoration === "none") {
    return "";
  }

  return `<div class="shape ${decoration}" style="right:48px;top:128px;width:200px;height:220px;"></div>`;
}

function renderCover(slide: Slide) {
  const metrics = getSlideLayoutMetrics(slide);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${baseCss}</style></head><body>
    <div class="canvas cover">
      <div class="inner">
        <div class="stack">
          <div class="cover-badge">${escapeHtml(slide.question_badge)}</div>
          <div class="title cover-title" style="max-width:${metrics.titleWidth};font-size:${metrics.titleSize}px;">${nl2br(slide.headline)}</div>
          <div class="body cover-body" style="max-width:${metrics.bodyWidth};margin-top:${metrics.bodyMarginTop}px;font-size:${metrics.bodySize}px;line-height:${metrics.bodyLineHeight};">${nl2br(slide.body)}</div>
          <div style="margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;">
            <div style="max-width:40%;font-size:18px;font-weight:900;letter-spacing:-0.03em;color:var(--cover-brand-ink);">${nl2br(slide.emphasis || slide.save_point)}</div>
            <div class="cover-hero-art">
              <div class="hero-body"></div>
              <div class="hero-head"></div>
              <div class="hero-bubble">···</div>
              <div class="hero-orb"></div>
              <div class="hero-coin"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="cover-brand">${escapeHtml(brandText)}</div>
    </div>
  </body></html>`;
}

function renderClosing(slide: Slide, totalSlides: number) {
  const metrics = getSlideLayoutMetrics(slide);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${baseCss}</style></head><body>
    <div class="canvas closing">
      <div class="inner">
        <div class="stack">
          <div class="topbar">
            <div class="badge">${escapeHtml(slide.question_badge)}</div>
            <div class="page-counter closing">${formatPageCounter(slide.slide_number, totalSlides)}</div>
          </div>
          <div class="title closing-title" style="max-width:${metrics.titleWidth};font-size:${metrics.titleSize}px;">${nl2br(slide.headline)}</div>
          <div class="body closing-body" style="max-width:${metrics.bodyWidth};margin-top:${metrics.bodyMarginTop}px;font-size:${metrics.bodySize}px;line-height:${metrics.bodyLineHeight};">${nl2br(slide.body)}</div>
          <div class="closing-divider"></div>
          <div class="closing-kicker">${nl2br(slide.emphasis || slide.module.title)}</div>
          <div class="closing-final">${nl2br(slide.save_point || slide.module.items[0]?.title || slide.module.items[0]?.value)}</div>
        </div>
      </div>
      <div class="closing-brand">${escapeHtml(brandText)}</div>
    </div>
  </body></html>`;
}

function renderMiddle(slide: Slide, totalSlides: number) {
  const metrics = getSlideLayoutMetrics(slide);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${baseCss}</style></head><body>
    <div class="canvas middle">
      ${renderDecoration(slide)}
      <div class="inner">
        <div class="stack">
          <div class="topbar">
            <div class="badge">${escapeHtml(slide.question_badge)}</div>
            <div class="page-counter">${formatPageCounter(slide.slide_number, totalSlides)}</div>
          </div>
          <div class="title middle-title" style="max-width:${metrics.titleWidth};font-size:${metrics.titleSize}px;">${nl2br(slide.headline)}</div>
          <div class="body" style="max-width:${metrics.bodyWidth};margin-top:${metrics.bodyMarginTop}px;font-size:${metrics.bodySize}px;line-height:${metrics.bodyLineHeight};">${nl2br(slide.body)}</div>
          ${slide.emphasis ? `<div class="emphasis" style="font-size:${metrics.emphasisSize}px;line-height:1.4;">${nl2br(slide.emphasis)}</div>` : ""}
          ${slide.save_point ? `<div class="save-point" style="font-size:${metrics.saveSize}px;line-height:1.5;">${nl2br(slide.save_point)}</div>` : ""}
          <div class="module-zone" style="padding-top:${metrics.moduleZoneTop}px;padding-bottom:${metrics.moduleZoneBottom}px;">
            <div style="width:${metrics.moduleWidth};margin:0 auto;min-height:${metrics.moduleMinHeight}px;">
              ${renderModule(slide.module)}
            </div>
          </div>
          <div class="brand">${escapeHtml(brandText)}</div>
        </div>
      </div>
    </div>
  </body></html>`;
}

export function renderStandaloneSlideHtml(
  slide: Omit<Slide, "standalone_html">,
  totalSlides: number,
  _projectTitle: string,
) {
  void _projectTitle;
  const resolvedSlide = resolveEditorialSlide(slide as Slide, totalSlides);
  const variant = getSlideVariant(resolvedSlide);

  if (variant === "cover") {
    return renderCover(resolvedSlide);
  }

  if (variant === "closing") {
    return renderClosing(resolvedSlide, totalSlides);
  }

  return renderMiddle(resolvedSlide, totalSlides);
}

export function withStandaloneHtml(
  project: Omit<CarouselProject, "slides"> & {
    slides: Omit<Slide, "standalone_html">[];
  },
): CarouselProject {
  return {
    ...project,
    slides: project.slides.map((slide) => ({
      ...slide,
      standalone_html: renderStandaloneSlideHtml(slide, project.slides.length, project.project_title),
    })),
  };
}
