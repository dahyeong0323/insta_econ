import { NextResponse } from "next/server";
import { z } from "zod";

import { failRun } from "@/lib/runs/processor";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

const failRunSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id } = await context.params;
    const rawPayload = await request.json().catch(() => ({}));
    const payload = failRunSchema.parse(rawPayload);
    const run = await failRun(
      id,
      payload.reason?.trim() || "운영자가 수동으로 이 run을 종료했습니다.",
      {
        allowAlreadyFailed: true,
      },
    );

    return NextResponse.json(run);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fail run." },
      { status },
    );
  }
}
