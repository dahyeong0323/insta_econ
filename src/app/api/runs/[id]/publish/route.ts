import { NextResponse } from "next/server";

import { publishRunWorkflow } from "@/lib/runs/publish";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const result = await publishRunWorkflow(id, payload);

    return NextResponse.json({
      run: result.run,
      publish: result.publish,
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish to Instagram.",
      },
      { status },
    );
  }
}
