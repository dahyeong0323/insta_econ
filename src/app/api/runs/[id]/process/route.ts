import { NextResponse } from "next/server";

import { processRun } from "@/lib/runs/processor";
import {
  ResearchDispatchAuthError,
  authorizeResearchDispatchRequest,
} from "@/lib/research/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
) {
  try {
    authorizeResearchDispatchRequest(request);

    const params = (await context.params) as { id?: string };
    const id = params.id?.trim();

    if (!id) {
      return NextResponse.json({ error: "Run id is required." }, { status: 400 });
    }

    const run = await processRun(id);

    return NextResponse.json({ ok: true, runId: id, run });
  } catch (error) {
    if (error instanceof ResearchDispatchAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process run.",
      },
      { status: 400 },
    );
  }
}
