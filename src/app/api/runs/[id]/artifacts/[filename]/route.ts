import { NextResponse } from "next/server";

import { guessArtifactContentType, readArtifact } from "@/lib/runs/storage";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; filename: string }> },
) {
  try {
    authorizeOperatorRequest(request);

    const { id, filename } = await context.params;
    const content = await readArtifact(id, filename);
    const contentType = guessArtifactContentType(filename) ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 404;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read artifact." },
      { status },
    );
  }
}
