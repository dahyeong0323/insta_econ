import { z } from "zod";

export const researchPreviousTopicLinkSchema = z
  .object({
    runId: z.string().min(1),
    topicId: z.string().min(1).nullable(),
    title: z.string().min(1),
    publishedAt: z.string().min(1),
    relationship: z.enum(["series_next", "series_context", "concept_bridge"]),
  })
  .strict();

export const researchSelectionMetadataSchema = z
  .object({
    topicId: z.string().min(1),
    conceptId: z.string().min(1),
    seriesId: z.string().min(1),
    seriesTitle: z.string().min(1),
    seriesOrder: z.number().int().min(1),
    curriculumPosition: z.string().min(1),
    narrativeArc: z.string().min(1),
    teachingAngle: z.string().min(1),
    topicAliases: z.array(z.string().min(1)).max(12),
    previousTopicLink: researchPreviousTopicLinkSchema.nullable(),
    selectionMode: z.enum(["heuristic", "llm"]),
    selectionReason: z.string().min(1).max(500),
    selectionScore: z.number(),
    topSimilarityScore: z.number().min(0).max(1),
    operatorFocus: z.string().min(1).max(240),
    shortlistTopicIds: z.array(z.string().min(1)).max(8),
  })
  .strict();

export const researchDispatchArtifactSchema = z
  .object({
    selection_metadata: researchSelectionMetadataSchema,
  })
  .passthrough();

export type ResearchPreviousTopicLink = z.infer<typeof researchPreviousTopicLinkSchema>;
export type ResearchSelectionMetadata = z.infer<typeof researchSelectionMetadataSchema>;
