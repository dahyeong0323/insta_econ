import { NextResponse } from "next/server";

import { verifyInstagramPublishReadiness } from "@/lib/integrations/instagram/client";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";
export const maxDuration = 60;

type PreflightRequestBody = {
  runId?: string | null;
};

export async function POST(request: Request) {
  try {
    authorizeOperatorRequest(request);

    const payload = (await request.json().catch(() => ({}))) as PreflightRequestBody;
    const readiness = await verifyInstagramPublishReadiness({
      runId: payload.runId?.trim() || null,
    });

    return NextResponse.json(readiness);
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
          error instanceof Error
            ? error.message
            : "Failed to run Instagram publish preflight.",
      },
      { status },
    );
  }
}
