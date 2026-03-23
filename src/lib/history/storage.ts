import { mkdirSync } from "node:fs";
import path from "node:path";

import { type RunState } from "@/lib/agents/schema";
import {
  ensurePersistentStorageConfigured,
  isBlobStorageEnabled,
  readBlobJson,
  writeBlobJson,
} from "@/lib/storage/blob";

const dataRoot = path.join(process.cwd(), ".data");
const dbPath = path.join(dataRoot, "content-history.db");
const historyBlobPath = "history/published-content.json";

export type PublishedContentRecord = {
  run_id: string;
  title: string;
  canonical_topic: string;
  source_title: string | null;
  source_summary: string | null;
  caption: string;
  permalink: string | null;
  instagram_creation_id: string | null;
  instagram_media_id: string | null;
  published_at: string;
  key_terms: string[];
  slide_headlines: string[];
  concept_summary: string;
  concept_tokens: string[];
};

export type SimilarContentMatch = {
  runId: string;
  title: string;
  publishedAt: string;
  permalink: string | null;
  sharedTerms: string[];
  score: number;
};

export type PublishedContentListItem = {
  runId: string;
  title: string;
  canonicalTopic: string;
  sourceTitle: string | null;
  publishedAt: string;
  permalink: string | null;
  keyTerms: string[];
  slideHeadlines: string[];
  conceptSummary: string;
  conceptTokens: string[];
};

type PublishedContentRow = {
  run_id?: unknown;
  title?: unknown;
  canonical_topic?: unknown;
  source_title?: unknown;
  published_at?: unknown;
  permalink?: unknown;
  key_terms_json?: unknown;
  slide_headlines_json?: unknown;
  concept_summary?: unknown;
  concept_tokens_json?: unknown;
};

type DatabaseSyncInstance = import("node:sqlite").DatabaseSync;
type DatabaseSyncConstructor = typeof import("node:sqlite").DatabaseSync;

let cachedDatabaseSync: DatabaseSyncConstructor | null | undefined;

function ensureDataRoot() {
  mkdirSync(dataRoot, { recursive: true });
}

function getDatabaseSyncConstructor() {
  if (cachedDatabaseSync !== undefined) {
    return cachedDatabaseSync;
  }

  try {
    const nodeRequire = eval("require") as NodeJS.Require;
    const sqliteModule = nodeRequire("node:sqlite") as typeof import("node:sqlite");
    cachedDatabaseSync = sqliteModule.DatabaseSync;
  } catch {
    cachedDatabaseSync = null;
  }

  return cachedDatabaseSync;
}

function withDb<T>(work: (db: DatabaseSyncInstance) => T) {
  ensureDataRoot();
  const DatabaseSync = getDatabaseSyncConstructor();

  if (!DatabaseSync) {
    throw new Error("node:sqlite is not available in this runtime.");
  }

  const db = new DatabaseSync(dbPath);

  try {
    initializeContentHistoryDb(db);
    return work(db);
  } finally {
    db.close();
  }
}

function initializeContentHistoryDb(db: DatabaseSyncInstance) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS published_content (
      run_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      canonical_topic TEXT NOT NULL,
      source_title TEXT,
      source_summary TEXT,
      caption TEXT NOT NULL,
      permalink TEXT,
      instagram_creation_id TEXT,
      instagram_media_id TEXT,
      published_at TEXT NOT NULL,
      key_terms_json TEXT NOT NULL,
      slide_headlines_json TEXT NOT NULL,
      concept_summary TEXT NOT NULL,
      concept_tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_published_content_published_at
    ON published_content (published_at DESC);

    CREATE INDEX IF NOT EXISTS idx_published_content_canonical_topic
    ON published_content (canonical_topic);
  `);
}

function normalizeTopic(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return [...new Set(normalizeTopic(value).split(" ").filter((token) => token.length > 1))];
}

function safeJsonParseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);

  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function buildConceptSummary(run: RunState) {
  const parts = [
    run.project?.project_title ?? run.title ?? "",
    run.source_bundle?.source_summary ?? "",
    ...(run.source_bundle?.key_terms ?? []),
    ...(run.project?.slides.map((slide) => slide.headline) ?? []),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(" | ").slice(0, 2000);
}

function buildPublishedContentRecord(run: RunState): PublishedContentRecord {
  if (!run.project) {
    throw new Error("Published history requires a completed project.");
  }

  if (run.publish_result.status !== "published" || !run.publish_result.published_at) {
    throw new Error("Only published runs can be saved into content history.");
  }

  const title = run.project.project_title.trim();
  const canonicalTopic = normalizeTopic(run.title ?? run.project.project_title);
  const slideHeadlines = run.project.slides.map((slide) => slide.headline.trim());
  const keyTerms = (run.source_bundle?.key_terms ?? []).map((term) => term.trim()).filter(Boolean);
  const conceptSummary = buildConceptSummary(run);
  const conceptTokens = tokenize([title, conceptSummary, keyTerms.join(" ")].join(" "));

  return {
    run_id: run.id,
    title,
    canonical_topic: canonicalTopic,
    source_title: run.source_bundle?.source_title ?? null,
    source_summary: run.source_bundle?.source_summary ?? null,
    caption: run.project.caption,
    permalink: run.publish_result.permalink,
    instagram_creation_id: run.publish_result.instagram_creation_id,
    instagram_media_id: run.publish_result.instagram_media_id,
    published_at: run.publish_result.published_at,
    key_terms: keyTerms,
    slide_headlines: slideHeadlines,
    concept_summary: conceptSummary,
    concept_tokens: conceptTokens,
  };
}

function mapRecordToListItem(record: PublishedContentRecord): PublishedContentListItem {
  return {
    runId: record.run_id,
    title: record.title,
    canonicalTopic: record.canonical_topic,
    sourceTitle: record.source_title,
    publishedAt: record.published_at,
    permalink: record.permalink,
    keyTerms: record.key_terms,
    slideHeadlines: record.slide_headlines,
    conceptSummary: record.concept_summary,
    conceptTokens: record.concept_tokens,
  };
}

async function readBlobHistoryRecords() {
  ensurePersistentStorageConfigured("Published content history");

  try {
    return await readBlobJson<PublishedContentRecord[]>(historyBlobPath);
  } catch {
    return [];
  }
}

async function writeBlobHistoryRecords(records: PublishedContentRecord[]) {
  ensurePersistentStorageConfigured("Published content history");
  await writeBlobJson(historyBlobPath, records);
}

export async function savePublishedRunToHistory(run: RunState) {
  const record = buildPublishedContentRecord(run);
  const now = new Date().toISOString();

  if (isBlobStorageEnabled()) {
    const records = await readBlobHistoryRecords();
    const nextRecords = [
      record,
      ...records.filter((item) => item.run_id !== record.run_id),
    ].sort((left, right) => right.published_at.localeCompare(left.published_at));

    await writeBlobHistoryRecords(nextRecords);
    return record;
  }

  ensurePersistentStorageConfigured("Published content history");
  withDb((db) => {
    const statement = db.prepare(`
      INSERT INTO published_content (
        run_id,
        title,
        canonical_topic,
        source_title,
        source_summary,
        caption,
        permalink,
        instagram_creation_id,
        instagram_media_id,
        published_at,
        key_terms_json,
        slide_headlines_json,
        concept_summary,
        concept_tokens_json,
        created_at,
        updated_at
      ) VALUES (
        $run_id,
        $title,
        $canonical_topic,
        $source_title,
        $source_summary,
        $caption,
        $permalink,
        $instagram_creation_id,
        $instagram_media_id,
        $published_at,
        $key_terms_json,
        $slide_headlines_json,
        $concept_summary,
        $concept_tokens_json,
        $created_at,
        $updated_at
      )
      ON CONFLICT(run_id) DO UPDATE SET
        title = excluded.title,
        canonical_topic = excluded.canonical_topic,
        source_title = excluded.source_title,
        source_summary = excluded.source_summary,
        caption = excluded.caption,
        permalink = excluded.permalink,
        instagram_creation_id = excluded.instagram_creation_id,
        instagram_media_id = excluded.instagram_media_id,
        published_at = excluded.published_at,
        key_terms_json = excluded.key_terms_json,
        slide_headlines_json = excluded.slide_headlines_json,
        concept_summary = excluded.concept_summary,
        concept_tokens_json = excluded.concept_tokens_json,
        updated_at = excluded.updated_at
    `);

    statement.run({
      $run_id: record.run_id,
      $title: record.title,
      $canonical_topic: record.canonical_topic,
      $source_title: record.source_title,
      $source_summary: record.source_summary,
      $caption: record.caption,
      $permalink: record.permalink,
      $instagram_creation_id: record.instagram_creation_id,
      $instagram_media_id: record.instagram_media_id,
      $published_at: record.published_at,
      $key_terms_json: JSON.stringify(record.key_terms),
      $slide_headlines_json: JSON.stringify(record.slide_headlines),
      $concept_summary: record.concept_summary,
      $concept_tokens_json: JSON.stringify(record.concept_tokens),
      $created_at: now,
      $updated_at: now,
    });
  });

  return record;
}

export async function listPublishedContent(limit = 50) {
  if (isBlobStorageEnabled()) {
    const records = await readBlobHistoryRecords();
    return records.slice(0, limit).map(mapRecordToListItem);
  }

  ensurePersistentStorageConfigured("Published content history");
  return withDb((db) => {
    const statement = db.prepare(`
      SELECT *
      FROM published_content
      ORDER BY published_at DESC
      LIMIT ?
    `);

    return (statement.all(limit) as PublishedContentRow[]).map<PublishedContentListItem>(
      (row) => ({
        runId: String(row.run_id),
        title: String(row.title),
        canonicalTopic: String(row.canonical_topic),
        sourceTitle: row.source_title ? String(row.source_title) : null,
        publishedAt: String(row.published_at),
        permalink: row.permalink ? String(row.permalink) : null,
        keyTerms: safeJsonParseArray(String(row.key_terms_json ?? "[]")),
        slideHeadlines: safeJsonParseArray(String(row.slide_headlines_json ?? "[]")),
        conceptSummary: String(row.concept_summary ?? ""),
        conceptTokens: safeJsonParseArray(String(row.concept_tokens_json ?? "[]")),
      }),
    );
  });
}

export async function findSimilarPublishedContent(input: {
  title?: string | null;
  keyTerms?: string[];
  summary?: string | null;
  limit?: number;
  minScore?: number;
}) {
  const limit = input.limit ?? 30;
  const minScore = input.minScore ?? 0.34;
  const title = input.title?.trim() || "";
  const keyTerms = (input.keyTerms ?? []).map((term) => term.trim()).filter(Boolean);
  const probeTokens = tokenize([title, input.summary ?? "", keyTerms.join(" ")].join(" "));
  const probeKeyTerms = [...new Set(keyTerms.map((term) => normalizeTopic(term)))];
  const candidates = await listPublishedContent(limit);

  return candidates
    .map<SimilarContentMatch | null>((candidate) => {
      const candidateTerms = candidate.keyTerms.map((term: string) => normalizeTopic(term));
      const sharedTerms = probeKeyTerms.filter((term: string) => candidateTerms.includes(term));
      const topicScore = jaccard(probeTokens, candidate.conceptTokens);
      const termScore =
        probeKeyTerms.length === 0 && candidateTerms.length === 0
          ? 0
          : jaccard(probeKeyTerms, candidateTerms);
      const score = Number((topicScore * 0.65 + termScore * 0.35).toFixed(4));

      if (score < minScore) {
        return null;
      }

      return {
        runId: candidate.runId,
        title: candidate.title,
        publishedAt: candidate.publishedAt,
        permalink: candidate.permalink,
        sharedTerms,
        score,
      };
    })
    .filter((candidate: SimilarContentMatch | null): candidate is SimilarContentMatch => candidate !== null)
    .sort((left: SimilarContentMatch, right: SimilarContentMatch) => right.score - left.score);
}
