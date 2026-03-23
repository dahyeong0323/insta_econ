import JSZip from "jszip";
import { NextResponse } from "next/server";

import { listArtifacts, readArtifact, readRunState } from "@/lib/runs/storage";
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
    const run = await readRunState(id);
    const zip = new JSZip();
    const files = await listArtifacts(id);

    for (const file of files) {
      const content = await readArtifact(id, file.filename);
      zip.file(file.filename, content);
    }

    zip.file("run-summary.json", JSON.stringify(run, null, 2));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${id}-run-artifacts.zip"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export artifacts." },
      { status },
    );
  }
}
