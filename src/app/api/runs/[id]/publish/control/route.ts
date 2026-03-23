import { NextResponse } from "next/server";

import { publishControlSchema } from "@/lib/agents/schema";
import { publishRunWorkflow } from "@/lib/runs/publish";
import { stopRunPublish } from "@/lib/runs/processor";
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
    const rawPayload = await request.json().catch(() => ({}));
    const payload = publishControlSchema.parse(rawPayload);

    if (payload.action === "retry") {
      const result = await publishRunWorkflow(id, {
        trigger: "manual_api",
        requestedBy: "operator-ui",
      });

      return NextResponse.json({
        action: payload.action,
        run: result.run,
        publish: result.publish,
      });
    }

    const run = await stopRunPublish(id, payload);

    return NextResponse.json({
      action: payload.action,
      run,
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
          error instanceof Error ? error.message : "Failed to control Instagram publish.",
      },
      { status },
    );
  }
}
