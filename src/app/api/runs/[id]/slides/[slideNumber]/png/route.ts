import { NextResponse } from "next/server";

import { renderRunSlideToPng } from "@/lib/runs/render-png";
import { readArtifact, readRunState } from "@/lib/runs/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; slideNumber: string }> },
) {
  try {
    const { id, slideNumber } = await context.params;
    const parsedSlideNumber = Number(slideNumber);
    const run = await readRunState(id);
    const maxSlideNumber = run.project?.slides.length ?? 0;

    if (
      !Number.isInteger(parsedSlideNumber) ||
      parsedSlideNumber < 1 ||
      parsedSlideNumber > maxSlideNumber
    ) {
      return NextResponse.json({ error: "Invalid slide number." }, { status: 400 });
    }

    const filename = `slide-${parsedSlideNumber}.png`;
    const buffer = await readArtifact(id, filename).catch(async () => {
      const renderedSlide = await renderRunSlideToPng(id, parsedSlideNumber);
      return renderedSlide.buffer;
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load slide PNG.",
      },
      { status: 404 },
    );
  }
}
