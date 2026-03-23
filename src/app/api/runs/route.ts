import { after, NextResponse } from "next/server";

import { createRunRecord, recordRunSoftError } from "@/lib/runs/processor";
import {
  listRunIds,
  readRunStatePreferMirror,
  writeArtifact,
  writeRunState,
} from "@/lib/runs/storage";
import { triggerRunProcessing } from "@/lib/runs/triggers";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";

export const runtime = "nodejs";

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || "source.pdf";
}

export async function GET(request: Request) {
  try {
    authorizeOperatorRequest(request);
    const runIds = await listRunIds();
    const runs = await Promise.all(
      runIds.map((runId) => readRunStatePreferMirror(runId).catch(() => null)),
    );

    const summaries = runs
      .filter((run): run is NonNullable<typeof run> => run !== null)
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )
      .slice(0, 20)
      .map((run) => ({
        id: run.id,
        title: run.title,
        status: run.status,
        workflow_status: run.workflow_status,
        current_stage: run.current_stage,
        updated_at: run.updated_at,
        created_at: run.created_at,
        has_project: Boolean(run.project),
        publish_status: run.publish_result.status,
      }));

    return NextResponse.json({
      runs: summaries,
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
        error: error instanceof Error ? error.message : "Failed to list runs.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    authorizeOperatorRequest(request);

    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim() || null;
    const sourceText = String(formData.get("sourceText") ?? "").trim() || null;
    const audience = String(formData.get("audience") ?? "middle_school");
    const deferProcessing =
      String(formData.get("deferProcessing") ?? "").trim().toLowerCase() === "true";
    const sourcePdf = formData.get("sourcePdf");
    const sourcePdfName =
      sourcePdf instanceof File && sourcePdf.size > 0
        ? sanitizeFilename(sourcePdf.name)
        : null;

    if (!sourceText && !(sourcePdf instanceof File && sourcePdf.size > 0)) {
      return NextResponse.json(
        { error: "텍스트를 붙여넣거나 PDF를 업로드해 주세요." },
        { status: 400 },
      );
    }

    const run = await createRunRecord({
      title,
      audience,
      sourceText,
      sourceFileName: sourcePdfName,
      deferProcessing,
    });

    if (sourceText) {
      await writeArtifact(run.id, "source.txt", sourceText);
    }

    if (sourcePdf instanceof File && sourcePdf.size > 0 && sourcePdfName) {
      const bytes = Buffer.from(await sourcePdf.arrayBuffer());
      await writeArtifact(run.id, `source-${sourcePdfName}`, bytes);
    }

    await writeRunState(run);

    if (!deferProcessing) {
      after(async () => {
        try {
          await triggerRunProcessing(run.id);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown trigger error";
          await recordRunSoftError(
            run.id,
            `생성 요청은 기록됐지만 파이프라인 시작에 실패했어요: ${detail}`,
          ).catch(() => undefined);
        }
      });
    }

    return NextResponse.json({ runId: run.id });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError
          ? 500
          : 400;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create run." },
      { status },
    );
  }
}
