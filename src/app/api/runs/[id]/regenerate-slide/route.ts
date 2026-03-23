import { NextResponse } from "next/server";

import { regenerateSlide } from "@/lib/runs/processor";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const json = await request.json();
    const run = await regenerateSlide(id, json);
    return NextResponse.json(run);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate slide." },
      { status },
    );
  }
}
