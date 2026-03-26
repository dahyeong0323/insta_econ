import { NextResponse } from "next/server";
import { z } from "zod";

import {
  evaluateCandidateSimilarity,
  getSimilarityOperatorGuide,
  similarityThresholds,
} from "@/lib/history/similarity";

export const runtime = "nodejs";

const similarityCheckSchema = z
  .object({
    title: z.string().min(1).max(200),
    keyTerms: z.array(z.string().min(1).max(60)).max(12).optional(),
    summary: z.string().max(1200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const payload = similarityCheckSchema.parse(await request.json());
    const result = await evaluateCandidateSimilarity(payload);

    return NextResponse.json({
      ...result,
      operatorGuide: getSimilarityOperatorGuide(result),
      thresholds: similarityThresholds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to evaluate content similarity.",
      },
      { status: 400 },
    );
  }
}
