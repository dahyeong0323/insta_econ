import { NextResponse } from "next/server";

import { readRunStatePreferMirror } from "@/lib/runs/storage";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const run = await readRunStatePreferMirror(id);
    return NextResponse.json(run);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 404;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run not found." },
      { status },
    );
  }
}
