import { NextResponse } from "next/server";

import { dispatchResearchDraft } from "@/lib/research/service";
import {
  authorizeResearchDispatchRequest,
  ResearchDispatchAuthError,
  ResearchDispatchConfigError,
} from "@/lib/research/scheduler";
import { PersistentStorageConfigError } from "@/lib/storage/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    authorizeResearchDispatchRequest(request);

    const payload = await request.json().catch(() => ({}));
    const result = await dispatchResearchDraft(payload);

    if (result.status === "skipped") {
      return NextResponse.json(result, { status: 202 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResearchDispatchAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ResearchDispatchConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof PersistentStorageConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to dispatch research draft.",
      },
      { status: 400 },
    );
  }
}
