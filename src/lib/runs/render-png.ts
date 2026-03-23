import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import chromiumRuntime from "@sparticuz/chromium";
import { readRunState, writeArtifact } from "@/lib/runs/storage";

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
const EMBEDDED_FONT_FAMILY = "IBM Plex Sans KR";

const EMBEDDED_FONT_FILES = [
  {
    filename: "IBMPlexSansKR-Regular.ttf",
    weight: 400,
  },
  {
    filename: "IBMPlexSansKR-Bold.ttf",
    weight: 700,
  },
] as const;

let embeddedFontCssPromise: Promise<string> | null = null;

export type RenderedSlidePng = {
  slideNumber: number;
  filename: string;
  buffer: Buffer;
};

async function buildEmbeddedFontCss() {
  const cssRules = await Promise.all(
    EMBEDDED_FONT_FILES.map(async (font) => {
      const fontPath = path.join(process.cwd(), "public", "fonts", font.filename);
      const fontBuffer = await readFile(fontPath).catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown font loading error.";
        throw new Error(`Embedded render font is missing: ${font.filename} (${message})`);
      });

      return `@font-face{font-family:"${EMBEDDED_FONT_FAMILY}";font-style:normal;font-weight:${font.weight};font-display:block;src:url("data:font/ttf;base64,${fontBuffer.toString("base64")}") format("truetype");}`;
    }),
  );

  return cssRules.join("");
}

async function getEmbeddedFontCss() {
  embeddedFontCssPromise ??= buildEmbeddedFontCss();
  return embeddedFontCssPromise;
}

async function withEmbeddedFonts(html: string) {
  const embeddedFontCss = await getEmbeddedFontCss();
  const styleTag = `<style>${embeddedFontCss}</style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${styleTag}</head>`);
  }

  return `${styleTag}${html}`;
}

async function waitForEmbeddedFonts(page: {
  evaluate: (fn: () => Promise<void>) => Promise<void>;
  waitForTimeout: (timeout: number) => Promise<void>;
}) {
  await page.evaluate(async () => {
    const fonts = Array.from(document.fonts);
    await Promise.all(fonts.map((font) => font.load().catch(() => undefined)));
    await document.fonts.ready;
  });
  await page.waitForTimeout(80);
}

export async function renderRunSlidesToPng(runId: string): Promise<RenderedSlidePng[]> {
  const run = await readRunState(runId);

  if (!run.project) {
    throw new Error("PNG를 렌더링할 카드뉴스 결과가 아직 없습니다.");
  }

  let browser;

  if (process.env.VERCEL === "1") {
    const { chromium } = await import("playwright");
    const executablePath = await chromiumRuntime.executablePath();

    browser = await chromium.launch({
      args: chromiumRuntime.args,
      executablePath,
      headless: true,
    });
  } else {
    const { chromium } = await import("playwright");
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
    browser = await chromium.launch({ headless: true });
  }

  try {
    const context = await browser.newContext({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: 1,
    });
    const renderedSlides: RenderedSlidePng[] = [];

    for (const slide of run.project.slides) {
      const page = await context.newPage();

      try {
        const html = await withEmbeddedFonts(slide.standalone_html);
        await page.setContent(html, { waitUntil: "load" });
        await waitForEmbeddedFonts(page);

        const buffer = Buffer.from(
          await page.screenshot({
            type: "png",
            fullPage: false,
          }),
        );
        const filename = `slide-${slide.slide_number}.png`;

        await writeArtifact(runId, filename, buffer);
        renderedSlides.push({
          slideNumber: slide.slide_number,
          filename,
          buffer,
        });
      } finally {
        await page.close();
      }
    }

    return renderedSlides;
  } finally {
    await browser.close();
  }
}

export async function renderRunSlideToPng(runId: string, slideNumber: number) {
  const renderedSlides = await renderRunSlidesToPng(runId);
  const renderedSlide = renderedSlides.find((slide) => slide.slideNumber === slideNumber);

  if (!renderedSlide) {
    throw new Error(`${slideNumber}번 슬라이드 PNG를 찾지 못했습니다.`);
  }

  return renderedSlide;
}
