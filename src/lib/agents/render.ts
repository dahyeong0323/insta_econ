import {
  type CarouselProject,
  type Slide,
  type SlideModule,
} from "@/lib/agents/schema";

const BRAND_TEXT =
  "ECON CAROUSEL \u00b7 \uc911\ud559\uc0dd \uacbd\uc81c \uce74\ub4dc\ub274\uc2a4";
const COVER_FOCUS_FALLBACK =
  "\uc2dc\uac04\uc774 \uc9c0\ub098\ub3c4 \uac00\uce58\uac00 \ubc84\ud2f0\ub294\uac00\uac00 \ud575\uc2ec";

const tokenCss = `
:root{
  --orange:#ff6b35;
  --orange-soft:#ff7847;
  --orange-banner:#ff8a58;
  --blue:#5d8ff5;
  --green:#51d8a1;
  --pink:#f57aaa;
  --yellow:#ffc74b;
  --dark:#1f1f22;
  --ink:#16161a;
  --muted:#76717a;
  --light:#f2f1f5;
  --light-border:#e7e5eb;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:transparent;
  color:var(--ink);
  font-family:"IBM Plex Sans KR","Noto Sans KR","Pretendard","Apple SD Gothic Neo",sans-serif;
}
.canvas{
  position:relative;
  width:1080px;
  height:1350px;
  overflow:hidden;
  border-radius:34px;
}
.cover{
  background:var(--orange);
  box-shadow:0 28px 70px rgba(255,107,53,.22);
}
.light{
  background:var(--light);
  border:1px solid var(--light-border);
  box-shadow:0 24px 56px rgba(44,34,24,.08);
}
.dark{
  background:#111113;
  color:#f7f6f9;
  box-shadow:0 28px 70px rgba(17,17,19,.28);
}
.inner{
  position:absolute;
  inset:0;
  padding:58px;
}
.stack{
  display:flex;
  height:100%;
  flex-direction:column;
}
.top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  position:relative;
  z-index:2;
}
.cover-chip{
  display:inline-flex;
  border-radius:18px;
  background:rgba(0,0,0,.10);
  padding:16px 28px;
  color:#211d1f;
  font-size:17px;
  font-weight:900;
  letter-spacing:-.03em;
}
.badge{
  display:inline-flex;
  border-radius:18px;
  background:var(--orange);
  padding:12px 20px;
  color:#fff;
  font-size:18px;
  font-weight:900;
  letter-spacing:-.03em;
}
.badge.dark{
  background:rgba(255,255,255,.08);
  color:#f7f6f9;
}
.page{
  color:#b4b0b8;
  font-size:22px;
  font-weight:900;
  letter-spacing:-.04em;
}
.page.dark{
  color:#5a5961;
}
.title{
  position:relative;
  z-index:2;
  margin:40px 0 0;
  color:var(--ink);
  font-size:66px;
  line-height:1.05;
  font-weight:900;
  letter-spacing:-.08em;
  white-space:pre-line;
}
.title.cover{
  max-width:72%;
  font-size:84px;
  line-height:.98;
  letter-spacing:-.09em;
}
.title.dark{
  max-width:82%;
  color:#fff;
  font-size:70px;
  line-height:1.02;
}
.body{
  position:relative;
  z-index:2;
  margin-top:54px;
  max-width:88%;
  color:var(--muted);
  font-size:30px;
  line-height:1.62;
  font-weight:500;
  letter-spacing:-.03em;
  white-space:pre-line;
}
.body.cover{
  max-width:78%;
  margin-top:40px;
  color:#94533f;
  font-size:30px;
  line-height:1.5;
  font-weight:700;
}
.body.dark{
  max-width:72%;
  margin-top:180px;
  color:#d2d0d6;
  font-size:33px;
  line-height:1.72;
}
.emphasis{
  position:relative;
  z-index:2;
  margin-top:28px;
  color:var(--orange);
  font-size:26px;
  line-height:1.35;
  font-weight:900;
  letter-spacing:-.03em;
  white-space:pre-line;
}
.save{
  position:relative;
  z-index:2;
  margin-top:16px;
  color:#1c1c20;
  font-size:21px;
  line-height:1.6;
  font-weight:900;
  letter-spacing:-.03em;
  white-space:pre-line;
}
.module-zone{
  position:relative;
  z-index:2;
  margin-top:auto;
  display:flex;
  align-items:flex-end;
  padding-top:32px;
  padding-bottom:34px;
}
.module-shell{
  width:100%;
}
.brand{
  position:absolute;
  left:50%;
  bottom:28px;
  transform:translateX(-50%);
  color:#bab6be;
  font-size:18px;
  font-weight:900;
  letter-spacing:-.03em;
}
.brand.inline{
  position:static;
  left:auto;
  bottom:auto;
  transform:none;
  margin-top:20px;
  align-self:center;
  font-size:17px;
}
.brand.cover{
  left:58px;
  transform:none;
  color:#8b4f3a;
}
.brand.dark{
  color:#5f5f66;
}
.shape{
  position:absolute;
  z-index:1;
}
.module-card{
  display:flex;
  height:100%;
  flex-direction:column;
  border-radius:32px;
  background:#fff;
  box-shadow:0 24px 50px rgba(34,29,27,.10);
}
.module-title{
  margin:0 0 16px;
  color:#9e9aa5;
  font-size:15px;
  font-weight:900;
  letter-spacing:-.03em;
}
.module-padding{
  padding:20px;
}
.grid{
  display:grid;
  grid-auto-rows:1fr;
  gap:16px;
}
.grid-1{grid-template-columns:1fr}
.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.accent-orange{background:#ff7847;color:#fff}
.accent-blue{background:#5d8ff5;color:#fff}
.accent-green{background:#51d8a1;color:#0f3929}
.accent-pink{background:#f57aaa;color:#fff}
.accent-yellow{background:#ffc74b;color:#3f2b00}
.accent-dark{background:#1f1f22;color:#f7f6f9}
.card-item{
  position:relative;
  overflow:hidden;
  min-height:220px;
  height:100%;
  border-radius:28px;
  padding:24px;
}
.card-item.compact{
  min-height:178px;
  padding:22px;
}
.card-item::after{
  content:"";
  position:absolute;
  top:-18px;
  right:-18px;
  width:80px;
  height:80px;
  border-radius:999px;
  background:rgba(255,255,255,.12);
}
.item-label{
  font-size:14px;
  font-weight:700;
  opacity:.85;
}
.item-title{
  margin-top:16px;
  font-size:26px;
  line-height:1.18;
  font-weight:900;
  letter-spacing:-.05em;
  white-space:pre-line;
}
.card-item.compact .item-title{
  margin-top:14px;
  font-size:22px;
}
.item-value{
  margin-top:12px;
  font-size:17px;
  line-height:1.6;
  font-weight:700;
  white-space:pre-line;
}
.card-item.compact .item-value{
  margin-top:10px;
  font-size:15px;
  line-height:1.55;
}
.item-note{
  margin-top:12px;
  font-size:14px;
  line-height:1.5;
  font-weight:600;
  opacity:.85;
  white-space:pre-line;
}
.card-item.compact .item-note{
  margin-top:10px;
  font-size:13px;
}
.code-window{
  display:flex;
  height:100%;
  flex-direction:column;
  overflow:hidden;
  border-radius:34px;
  background:#232326;
  box-shadow:0 24px 54px rgba(18,18,22,.18);
}
.code-header{
  display:flex;
  align-items:center;
  gap:12px;
  border-bottom:1px solid rgba(255,255,255,.08);
  padding:20px 28px;
}
.dot{
  width:16px;
  height:16px;
  border-radius:999px;
}
.dot.red{background:#ff5f57}
.dot.yellow{background:#febc2e}
.dot.green{background:#28c840}
.code-name{
  margin-left:12px;
  color:#a19ca6;
  font-size:20px;
  font-weight:600;
  letter-spacing:-.03em;
}
.code-body{
  flex:1;
  padding:28px;
}
.code-line{
  margin-top:18px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:22px;
  line-height:1.7;
}
.code-line:first-child{margin-top:0}
.code-title{
  color:#83c26b;
}
.code-value{
  margin-top:4px;
  color:#d7b09d;
}
.code-footer{
  padding:0 28px 28px;
}
.code-pill{
  display:inline-flex;
  border-radius:18px;
  border:1px solid #7a3531;
  background:#432320;
  padding:12px 20px;
  color:#ff6159;
  font-size:18px;
  font-weight:900;
}
.strip-list{
  display:flex;
  height:100%;
  flex-direction:column;
  justify-content:flex-end;
  gap:12px;
}
.strip{
  display:flex;
  min-height:88px;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  border-radius:22px;
  padding:16px 24px;
  box-shadow:0 16px 36px rgba(44,34,24,.10);
}
.strip-label{
  font-size:18px;
  font-weight:900;
}
.strip-title{
  flex:1;
  text-align:center;
  font-size:30px;
  font-weight:900;
  letter-spacing:-.05em;
}
.strip-value{
  text-align:right;
  font-size:16px;
  font-weight:700;
  opacity:.85;
}
.before-after{
  display:grid;
  flex:1;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:16px;
}
.feature-card{
  position:relative;
  overflow:hidden;
  min-height:240px;
  border-radius:30px;
  padding:24px;
  box-shadow:0 20px 42px rgba(34,29,27,.10);
}
.feature-card::after{
  content:"";
  position:absolute;
  top:-18px;
  right:-16px;
  width:96px;
  height:96px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
}
.feature-label{
  font-size:16px;
  font-weight:900;
}
.feature-title{
  margin-top:16px;
  font-size:26px;
  line-height:1.16;
  font-weight:900;
  letter-spacing:-.05em;
  white-space:pre-line;
}
.feature-copy{
  margin-top:12px;
  font-size:17px;
  line-height:1.6;
  font-weight:700;
  white-space:pre-line;
}
.banner{
  position:relative;
  overflow:hidden;
  margin-top:16px;
  border-radius:28px;
  background:var(--orange-banner);
  padding:24px 28px;
  color:#fff;
  box-shadow:0 20px 42px rgba(255,107,53,.12);
}
.banner::after{
  content:"";
  position:absolute;
  top:-18px;
  right:-18px;
  width:100px;
  height:100px;
  border-radius:999px;
  background:rgba(255,255,255,.12);
}
.banner-text{
  position:relative;
  z-index:1;
  font-size:20px;
  line-height:1.55;
  font-weight:900;
  letter-spacing:-.04em;
  white-space:pre-line;
}
.check-shell{
  display:flex;
  height:100%;
  flex-direction:column;
  border-radius:32px;
  background:#fff;
  padding:24px 28px;
  box-shadow:0 24px 50px rgba(34,29,27,.10);
}
.check-title{
  color:#202024;
  font-size:16px;
  font-weight:900;
}
.check-row{
  display:grid;
  min-height:94px;
  grid-template-columns:64px minmax(0,1fr) minmax(220px,auto);
  align-items:center;
  gap:20px;
  border-bottom:1px solid #f0eef2;
  padding:16px 0;
}
.check-row:last-child{
  border-bottom:none;
}
.check-icon{
  display:flex;
  width:48px;
  height:48px;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  background:#ff8a57;
  color:#fff;
  font-size:16px;
  font-weight:900;
  align-self:flex-start;
}
.check-copy{
  display:flex;
  flex-direction:column;
  min-width:0;
}
.check-label{
  color:#b0acb5;
  font-size:12px;
  font-weight:900;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.check-name{
  margin-top:4px;
  color:#202024;
  font-size:18px;
  font-weight:900;
  letter-spacing:-.03em;
  white-space:pre-line;
}
.check-value{
  color:#a7a2ac;
  font-size:18px;
  font-weight:500;
  line-height:1.55;
  text-align:right;
  white-space:pre-line;
}
.timeline-wrap{
  display:flex;
  height:100%;
  flex-direction:column;
  justify-content:flex-end;
  gap:16px;
}
.timeline-top{
  position:relative;
  border-radius:32px;
  background:#fff;
  padding:20px 28px;
  box-shadow:0 24px 50px rgba(34,29,27,.10);
}
.timeline-line{
  position:absolute;
  left:12%;
  right:12%;
  top:54px;
  height:3px;
  background:#dfdde3;
}
.timeline-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:20px;
  position:relative;
}
.timeline-step{
  text-align:center;
}
.timeline-dot{
  display:flex;
  width:54px;
  height:54px;
  margin:0 auto;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  font-size:22px;
  font-weight:900;
}
.timeline-label{
  margin-top:16px;
  color:#202024;
  font-size:18px;
  line-height:1.4;
  font-weight:900;
  letter-spacing:-.04em;
  white-space:pre-line;
}
.timeline-copy{
  margin-top:8px;
  color:#76717a;
  font-size:16px;
  line-height:1.45;
  font-weight:700;
  white-space:pre-line;
}
.spotlight{
  position:relative;
  display:flex;
  height:100%;
  flex-direction:column;
  justify-content:center;
  overflow:hidden;
  border-radius:34px;
  background:#ff8757;
  padding:32px;
  color:#fff;
  box-shadow:0 24px 50px rgba(255,107,53,.16);
}
.spotlight::before{
  content:"";
  position:absolute;
  left:-40px;
  bottom:-30px;
  width:128px;
  height:128px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
}
.spotlight::after{
  content:"";
  position:absolute;
  right:-8px;
  top:-20px;
  width:128px;
  height:128px;
  border-radius:999px;
  background:rgba(255,255,255,.12);
}
.spotlight-label{
  position:relative;
  z-index:1;
  font-size:18px;
  font-weight:900;
  color:rgba(255,255,255,.80);
}
.spotlight-title{
  position:relative;
  z-index:1;
  margin-top:28px;
  text-align:center;
  font-size:66px;
  line-height:.95;
  font-weight:900;
  letter-spacing:-.08em;
  white-space:pre-line;
}
.spotlight-copy{
  position:relative;
  z-index:1;
  margin-top:24px;
  text-align:center;
  font-size:24px;
  line-height:1.5;
  font-weight:700;
  white-space:pre-line;
}
.message{
  position:relative;
  display:flex;
  height:100%;
  flex-direction:column;
  justify-content:center;
  overflow:hidden;
  border-radius:34px;
  background:var(--orange-banner);
  padding:40px 32px;
  color:#fff;
  text-align:center;
  box-shadow:0 24px 50px rgba(255,107,53,.16);
}
.message::before{
  content:"";
  position:absolute;
  left:-24px;
  bottom:-24px;
  width:148px;
  height:148px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
}
.message::after{
  content:"";
  position:absolute;
  right:-18px;
  top:-22px;
  width:148px;
  height:148px;
  border-radius:999px;
  background:rgba(255,255,255,.10);
}
.message-kicker{
  position:relative;
  z-index:1;
  font-size:18px;
  font-weight:900;
  color:rgba(255,255,255,.80);
}
.message-title{
  position:relative;
  z-index:1;
  margin-top:16px;
  font-size:58px;
  line-height:1.02;
  font-weight:900;
  letter-spacing:-.07em;
  white-space:pre-line;
}
.message-copy{
  position:relative;
  z-index:1;
  margin:24px auto 0;
  max-width:80%;
  font-size:24px;
  line-height:1.5;
  font-weight:700;
  white-space:pre-line;
}
.cover-bottom{
  display:flex;
  margin-top:auto;
  align-items:flex-end;
  justify-content:space-between;
}
.cover-note{
  max-width:40%;
  color:#8b4f3a;
  font-size:18px;
  font-weight:900;
  letter-spacing:-.03em;
}
.cover-art{
  position:relative;
  width:340px;
  height:330px;
  flex:0 0 auto;
}
.art-body{
  position:absolute;
  left:56px;
  bottom:0;
  width:190px;
  height:210px;
  border:10px solid rgba(52,39,33,.85);
  border-radius:34px;
  background:#d97c59;
}
.art-head{
  position:absolute;
  left:96px;
  top:72px;
  width:112px;
  height:112px;
  border:9px solid rgba(52,39,33,.85);
  border-radius:22px;
  background:#ffe4d2;
}
.art-bubble{
  position:absolute;
  top:16px;
  right:6px;
  border:8px solid rgba(52,39,33,.85);
  border-radius:18px;
  background:#ffe4d2;
  padding:12px 20px;
  color:#342721;
  font-size:34px;
  font-weight:900;
}
.art-ball{
  position:absolute;
  right:42px;
  bottom:60px;
  width:92px;
  height:92px;
  border:10px solid rgba(52,39,33,.85);
  border-radius:999px;
  background:#d97c59;
}
.art-coin{
  position:absolute;
  left:16px;
  bottom:34px;
  width:62px;
  height:62px;
  border:8px solid rgba(52,39,33,.85);
  border-radius:999px;
  background:#ffd368;
}
.dark-divider{
  margin-top:40px;
  width:56px;
  height:4px;
  border-radius:999px;
  background:#ff7b49;
}
.dark-kicker{
  margin-top:48px;
  color:#66656c;
  font-size:28px;
  font-weight:900;
  letter-spacing:-.04em;
}
.dark-final{
  margin-top:16px;
  color:#ff7648;
  font-size:62px;
  line-height:1.02;
  font-weight:900;
  letter-spacing:-.07em;
  white-space:pre-line;
}
`;

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

function accentClass(accent: SlideModule["items"][number]["accent"]) {
  return `accent-${accent}`;
}

function getModuleWidthStyle(slideNumber: number) {
  if (slideNumber === 3 || slideNumber === 6) {
    return "width:94%;margin-left:auto;margin-right:auto;";
  }

  return "width:100%;";
}

function getLightLayout(slide: Omit<Slide, "standalone_html">) {
  switch (slide.role) {
    case "core":
      return {
        titleStyle: "max-width:86%;font-size:66px;",
        bodyStyle: "margin-top:54px;max-width:84%;font-size:30px;line-height:1.62;",
        emphasisStyle: "margin-top:28px;font-size:26px;",
        saveStyle: "margin-top:16px;font-size:21px;",
        moduleZoneStyle: "padding-top:32px;padding-bottom:36px;",
        moduleShellStyle: "min-height:408px;",
      };
    case "why":
      return {
        titleStyle: "max-width:92%;font-size:68px;",
        bodyStyle: "margin-top:50px;max-width:82%;font-size:30px;line-height:1.62;",
        emphasisStyle: "margin-top:28px;font-size:26px;",
        saveStyle: "margin-top:16px;font-size:21px;",
        moduleZoneStyle: "padding-top:28px;padding-bottom:36px;",
        moduleShellStyle: "min-height:430px;",
      };
    case "example":
      return {
        titleStyle: "max-width:92%;font-size:64px;",
        bodyStyle: "margin-top:48px;max-width:84%;font-size:28px;line-height:1.64;",
        emphasisStyle: "margin-top:28px;font-size:25px;",
        saveStyle: "margin-top:16px;font-size:20px;",
        moduleZoneStyle: "padding-top:28px;padding-bottom:40px;",
        moduleShellStyle: "min-height:484px;",
      };
    case "compare":
      return {
        titleStyle: "max-width:90%;font-size:64px;",
        bodyStyle: "margin-top:50px;max-width:82%;font-size:29px;line-height:1.62;",
        emphasisStyle: "margin-top:28px;font-size:25px;",
        saveStyle: "margin-top:16px;font-size:20px;",
        moduleZoneStyle: "padding-top:32px;padding-bottom:36px;",
        moduleShellStyle: "min-height:432px;",
      };
    case "number_or_steps":
      return {
        titleStyle: "max-width:92%;font-size:64px;",
        bodyStyle: "margin-top:50px;max-width:82%;font-size:29px;line-height:1.64;",
        emphasisStyle: "margin-top:28px;font-size:25px;",
        saveStyle: "margin-top:16px;font-size:20px;",
        moduleZoneStyle: "padding-top:32px;padding-bottom:48px;",
        moduleShellStyle: "min-height:404px;",
      };
    case "recap":
      return {
        titleStyle: "max-width:92%;font-size:68px;",
        bodyStyle: "margin-top:54px;max-width:82%;font-size:30px;line-height:1.64;",
        emphasisStyle: "margin-top:28px;font-size:26px;",
        saveStyle: "margin-top:16px;font-size:21px;",
        moduleZoneStyle: "padding-top:32px;padding-bottom:40px;",
        moduleShellStyle: "min-height:396px;",
      };
    default:
      return {
        titleStyle: "max-width:86%;font-size:66px;",
        bodyStyle: "margin-top:54px;max-width:88%;font-size:30px;line-height:1.62;",
        emphasisStyle: "margin-top:28px;font-size:26px;",
        saveStyle: "margin-top:16px;font-size:21px;",
        moduleZoneStyle: "padding-top:32px;padding-bottom:36px;",
        moduleShellStyle: "min-height:396px;",
      };
  }
}

function getModuleShellStyle(slide: Omit<Slide, "standalone_html">) {
  return `${getModuleWidthStyle(slide.slide_number)}${getLightLayout(slide).moduleShellStyle}`;
}

function lightBackgroundStyle(slideNumber: number) {
  if (slideNumber === 4 || slideNumber === 5) {
    return "background:#f3f2f6;border-color:#e8e6ed;";
  }

  return "background:#f2f1f5;border-color:#e7e5eb;";
}

function showLightDecoration(slide: Omit<Slide, "standalone_html">) {
  if (slide.module.type === "timeline" || slide.module.type === "checklist-table") {
    return false;
  }

  if (slide.slide_number >= 5 && slide.module.items.length >= 4) {
    return false;
  }

  return true;
}

function renderLightDecoration(slideNumber: number) {
  if (slideNumber === 2) {
    return `
      <div class="shape" style="right:40px;top:144px">
        <div style="position:relative;width:96px;height:96px;border-radius:28px;border:10px solid #ffb99b"></div>
        <div style="position:absolute;left:-24px;bottom:-8px;width:48px;height:48px;border-radius:999px;background:#ffd6c6"></div>
      </div>
    `;
  }

  if (slideNumber === 3) {
    return `
      <div class="shape" style="right:40px;top:136px">
        <div style="width:80px;height:256px;border-radius:999px;background:#d9e3ff"></div>
        <div style="position:absolute;left:-40px;top:0;width:72px;height:72px;border-radius:22px;border:9px solid #90acf6"></div>
      </div>
    `;
  }

  if (slideNumber === 4) {
    return "";
  }

  if (slideNumber === 5) {
    return `
      <div class="shape" style="right:40px;top:136px">
        <div style="width:176px;height:70px;border-radius:22px;background:#f7ccdb"></div>
        <div style="position:absolute;left:32px;top:96px;width:96px;height:44px;border-radius:999px;background:#ffdfea"></div>
      </div>
    `;
  }

  if (slideNumber === 6) {
    return `
      <div class="shape" style="right:40px;top:136px">
        <div style="width:96px;height:96px;border-radius:24px;background:#ffe09d"></div>
        <div style="position:absolute;left:-24px;top:96px;width:56px;height:56px;border-radius:999px;border:8px solid #ffd05e"></div>
      </div>
    `;
  }

  if (slideNumber === 7) {
    return "";
  }

  return "";
}

function renderCardGrid(module: SlideModule, compact = false) {
  const gridClass =
    module.items.length >= 4
      ? "grid-2"
      : module.items.length === 3
        ? "grid-3"
        : module.items.length === 2
          ? "grid-2"
          : "grid-1";

  return `<div class="module-card module-padding">
    ${module.title ? `<div class="module-title">${escapeHtml(module.title)}</div>` : ""}
    <div class="grid ${gridClass}">
      ${module.items
        .map(
          (item) => `<div class="card-item ${compact ? "compact" : ""} ${accentClass(item.accent)}">
            <div class="item-label">${escapeHtml(item.label)}</div>
            <div class="item-title">${nl2br(item.title)}</div>
            <div class="item-value">${nl2br(item.value)}</div>
            ${item.note ? `<div class="item-note">${nl2br(item.note)}</div>` : ""}
          </div>`,
        )
        .join("")}
    </div>
    ${module.footer ? `<div style="margin-top:16px;text-align:center;color:#b0acb5;font-size:14px;font-weight:700;">${nl2br(module.footer)}</div>` : ""}
  </div>`;
}

function renderCodeWindow(module: SlideModule) {
  return `<div class="code-window">
    <div class="code-header">
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
      <div class="code-name">${escapeHtml(module.title)}</div>
    </div>
    <div class="code-body">
      ${module.items
        .map(
          (item) => `<div class="code-line">
            <div class="code-title">${nl2br(item.title)}</div>
            <div class="code-value">${nl2br(item.value)}</div>
          </div>`,
        )
        .join("")}
    </div>
    ${module.footer ? `<div class="code-footer"><div class="code-pill">${nl2br(module.footer)}</div></div>` : ""}
  </div>`;
}

function renderRoleStrip(module: SlideModule) {
  return `<div class="strip-list">
    ${module.items
      .map(
        (item) => `<div class="strip ${accentClass(item.accent)}">
          <div class="strip-label">${escapeHtml(item.label)}</div>
          <div class="strip-title">${nl2br(item.title)}</div>
          <div class="strip-value">${nl2br(item.value)}</div>
        </div>`,
      )
      .join("")}
  </div>`;
}

function renderBeforeAfter(module: SlideModule) {
  const banner = module.footer || module.items[2]?.title || module.items[2]?.value || "";

  return `<div>
    <div class="before-after">
      ${module.items
        .slice(0, 2)
        .map(
          (item) => `<div class="feature-card ${accentClass(item.accent)}">
            <div class="feature-label">${escapeHtml(item.label)}</div>
            <div class="feature-title">${nl2br(item.title)}</div>
            <div class="feature-copy">${nl2br(item.value)}</div>
          </div>`,
        )
        .join("")}
    </div>
    ${banner ? `<div class="banner"><div class="banner-text">${nl2br(banner)}</div></div>` : ""}
  </div>`;
}

function renderChecklistTable(module: SlideModule) {
  return `<div class="check-shell">
    <div class="check-title">${escapeHtml(module.title)}</div>
    ${module.items
      .map(
        (item, index) => `<div class="check-row">
          <div class="check-icon">${String(index + 1).padStart(2, "0")}</div>
          <div class="check-copy">
            <div class="check-label">${escapeHtml(item.label)}</div>
            <div class="check-name">${nl2br(item.title)}</div>
          </div>
          <div class="check-value">${nl2br(item.value)}</div>
        </div>`,
      )
      .join("")}
  </div>`;
}

function renderTimeline(module: SlideModule) {
  const items = module.items.slice(0, 4);

  return `<div class="timeline-wrap">
    <div class="timeline-top">
      <div class="timeline-line"></div>
      <div class="timeline-grid">
        ${items
          .map(
            (item) => `<div class="timeline-step">
              <div class="timeline-dot ${accentClass(item.accent)}">${escapeHtml(item.label)}</div>
              <div class="timeline-label">${nl2br(item.title)}</div>
              <div class="timeline-copy">${nl2br(item.value)}</div>
            </div>`,
          )
          .join("")}
      </div>
    </div>
    ${renderCardGrid(module, module.items.length > 3)}
  </div>`;
}

function renderNumberSpotlight(module: SlideModule) {
  const item = module.items[0];
  const helper =
    item?.value && item.value !== item.title
      ? item.value
      : module.footer || module.subtitle || module.title;

  return `<div class="spotlight">
    <div class="spotlight-label">${escapeHtml(item?.label || module.title)}</div>
    <div class="spotlight-title">${nl2br(item?.title || item?.value || module.title)}</div>
    <div class="spotlight-copy">${nl2br(helper)}</div>
  </div>`;
}

function renderMessageBanner(module: SlideModule) {
  return `<div class="message">
    ${module.title ? `<div class="message-kicker">${escapeHtml(module.title)}</div>` : ""}
    <div class="message-title">${nl2br(module.items[0]?.title || module.items[0]?.value || module.title)}</div>
    ${
      module.items[0]?.value || module.footer
        ? `<div class="message-copy">${nl2br(module.items[0]?.value || module.footer)}</div>`
        : ""
    }
  </div>`;
}

function renderModule(module: SlideModule) {
  if (module.type === "code-window") {
    return renderCodeWindow(module);
  }

  if (module.type === "role-strip") {
    return renderRoleStrip(module);
  }

  if (module.type === "before-after") {
    return renderBeforeAfter(module);
  }

  if (module.type === "checklist-table") {
    return renderChecklistTable(module);
  }

  if (module.type === "timeline") {
    return renderTimeline(module);
  }

  if (module.type === "number-spotlight") {
    return renderNumberSpotlight(module);
  }

  if (module.type === "message-banner") {
    return renderMessageBanner(module);
  }

  return renderCardGrid(module);
}

function renderCover(slide: Omit<Slide, "standalone_html">) {
  const focus = slide.emphasis || slide.module.items[0]?.title || COVER_FOCUS_FALLBACK;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${tokenCss}</style></head><body>
    <div class="canvas cover">
      <div class="inner">
        <div class="stack">
          <div class="cover-chip">${escapeHtml(slide.question_badge)}</div>
          <div class="title cover">${nl2br(slide.headline)}</div>
          <div class="body cover">${nl2br(slide.body)}</div>
          <div class="cover-bottom">
            <div class="cover-note">${nl2br(focus)}</div>
            <div class="cover-art">
              <div class="art-body"></div>
              <div class="art-head"></div>
              <div class="art-bubble">…</div>
              <div class="art-ball"></div>
              <div class="art-coin"></div>
            </div>
          </div>
        </div>
        <div class="brand cover">${escapeHtml(BRAND_TEXT)}</div>
      </div>
    </div>
  </body></html>`;
}

function renderClosing(slide: Omit<Slide, "standalone_html">) {
  const kicker = slide.emphasis || slide.module.title;
  const finalLine = slide.save_point || slide.module.items[0]?.title || slide.module.items[0]?.value;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${tokenCss}</style></head><body>
    <div class="canvas dark">
      <div class="inner">
        <div class="stack">
          <div class="top">
            <div class="badge dark">${escapeHtml(slide.question_badge)}</div>
            <div class="page dark">${formatPage(slide.slide_number)}</div>
          </div>
          <div class="title dark">${nl2br(slide.headline)}</div>
          <div class="body dark">${nl2br(slide.body)}</div>
          <div class="dark-divider"></div>
          <div class="dark-kicker">${nl2br(kicker)}</div>
          <div class="dark-final">${nl2br(finalLine)}</div>
        </div>
        <div class="brand dark">${escapeHtml(BRAND_TEXT)}</div>
      </div>
    </div>
  </body></html>`;
}

function formatPage(page: number) {
  return `${String(page).padStart(2, "0")} / 08`;
}

function renderLightSlide(slide: Omit<Slide, "standalone_html">) {
  const layout = getLightLayout(slide);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=1080, initial-scale=1"/><style>${tokenCss}</style></head><body>
    <div class="canvas light" style="${lightBackgroundStyle(slide.slide_number)}">
      ${showLightDecoration(slide) ? renderLightDecoration(slide.slide_number) : ""}
      <div class="inner">
        <div class="stack">
          <div class="top">
            <div class="badge">${escapeHtml(slide.question_badge)}</div>
            <div class="page">${formatPage(slide.slide_number)}</div>
          </div>
          <div class="title" style="${layout.titleStyle}">${nl2br(slide.headline)}</div>
          <div class="body" style="${layout.bodyStyle}">${nl2br(slide.body)}</div>
          ${slide.emphasis ? `<div class="emphasis" style="${layout.emphasisStyle}">${nl2br(slide.emphasis)}</div>` : ""}
          ${slide.save_point ? `<div class="save" style="${layout.saveStyle}">${nl2br(slide.save_point)}</div>` : ""}
          <div class="module-zone" style="${layout.moduleZoneStyle}">
            <div class="module-shell" style="${getModuleShellStyle(slide)}">
              ${renderModule(slide.module)}
            </div>
          </div>
          <div class="brand inline">${escapeHtml(BRAND_TEXT)}</div>
        </div>
      </div>
    </div>
  </body></html>`;
}

export function renderStandaloneSlideHtml(
  slide: Omit<Slide, "standalone_html">,
  _projectTitle: string,
) {
  void _projectTitle;

  if (slide.slide_number === 1) {
    return renderCover(slide);
  }

  if (slide.slide_number === 8) {
    return renderClosing(slide);
  }

  return renderLightSlide(slide);
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
      standalone_html: renderStandaloneSlideHtml(slide, project.project_title),
    })),
  };
}
