import { NextResponse } from "next/server";

import { repairLegacyRunArtifacts } from "@/lib/runs/processor";
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
    const result = await repairLegacyRunArtifacts(id);

    return NextResponse.json({
      run: result.run,
      migration_report: result.report,
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to repair legacy artifacts." },
      { status },
    );
  }
}
