import { after, NextResponse } from "next/server";

import { continueApprovedRunWorkflow } from "@/lib/runs/continuation";
import { recordRunSoftError, respondToRunApproval } from "@/lib/runs/processor";
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
    const payload = await request.json();
    const run = await respondToRunApproval(id, payload);

    after(async () => {
      try {
        await continueApprovedRunWorkflow(run);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown continuation error";
        await recordRunSoftError(run.id, `승인 후 다음 단계 자동 시작 실패: ${detail}`).catch(
          () => undefined,
        );
      }
    });

    return NextResponse.json(run);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record approval response." },
      { status },
    );
  }
}
