import { NextResponse } from "next/server";

import {
  guessArtifactContentType,
  listArtifacts,
  readRunState,
} from "@/lib/runs/storage";
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
    await readRunState(id);
    const artifacts = await listArtifacts(id);

    return NextResponse.json({
      run_id: id,
      artifacts: artifacts
        .sort((left, right) => left.filename.localeCompare(right.filename))
        .map((artifact) => ({
          filename: artifact.filename,
          content_type: guessArtifactContentType(artifact.filename) ?? null,
          download_path: `/api/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifact.filename)}`,
        })),
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 404;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list artifacts." },
      { status },
    );
  }
}
