import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { stageValues, type RunState, runStateSchema } from "@/lib/agents/schema";
import { readMirroredRunState, syncRunStateToMirror } from "@/lib/runs/db-mirror";
import {
  deleteBlobPathnames,
  ensurePersistentStorageConfigured,
  isBlobStorageEnabled,
  listAllBlobs,
  readBlobMetadata,
  readBlobBuffer,
  readBlobJson,
  writeBlob,
  writeBlobJson,
} from "@/lib/storage/blob";

const dataRoot = path.join(process.cwd(), ".data", "runs");
const runBlobRoot = "runs";
const runLockMaxAgeMs = 30 * 60 * 1000;
const runBlobLockDeleteRetryCount = 5;
const runBlobLockDeleteRetryDelayMs = 250;

function getRunBlobPath(runId: string, filename: string) {
  return `${runBlobRoot}/${runId}/${filename}`;
}

export function getRunDir(runId: string) {
  return path.join(dataRoot, runId);
}

export function getRunStatePath(runId: string) {
  return path.join(getRunDir(runId), "run.json");
}

export function getRunArtifactPath(runId: string, filename: string) {
  return path.join(getRunDir(runId), filename);
}

export function getInputPdfPath(runId: string, filename: string) {
  return path.join(getRunDir(runId), `source-${filename}`);
}

function getRunLockPath(runId: string, lockName: string) {
  return path.join(getRunDir(runId), ".locks", `${lockName}.lock`);
}

function getRunBlobLockPath(runId: string, lockName: string) {
  return `locks/runs/${runId}/${lockName}.lock`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteBlobRunLockPath(
  lockPath: string,
  context: {
    runId: string;
    lockName: string;
    reason: "stale-reclaim" | "release";
  },
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= runBlobLockDeleteRetryCount; attempt += 1) {
    try {
      await deleteBlobPathnames([lockPath]);
    } catch (error) {
      lastError = error;
      console.warn("[runs.storage] Failed to delete blob run lock.", {
        ...context,
        lockPath,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const remainingMetadata = await readBlobMetadata(lockPath).catch(() => null);

    if (!remainingMetadata) {
      return;
    }

    if (attempt < runBlobLockDeleteRetryCount) {
      await delay(runBlobLockDeleteRetryDelayMs * attempt);
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : `Failed to delete blob run lock: ${lockPath}`,
  );
}

function isNodeErrorWithCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  );
}

export async function ensureRunDir(runId: string) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run storage");
    return;
  }

  ensurePersistentStorageConfigured("Run storage");
  await mkdir(getRunDir(runId), { recursive: true });
}

async function acquireFilesystemRunLock(
  runId: string,
  lockName: string,
  lockToken: string,
  allowRetry: boolean,
) {
  const lockPath = getRunLockPath(runId, lockName);
  ensurePersistentStorageConfigured("Run lock");
  await mkdir(path.dirname(lockPath), { recursive: true });

  try {
    await writeFile(lockPath, lockToken, {
      encoding: "utf8",
      flag: "wx",
    });
    return;
  } catch (error) {
    if (!isNodeErrorWithCode(error, "EEXIST")) {
      throw error;
    }
  }

  const currentLockStat = await stat(lockPath).catch(() => null);

  if (
    allowRetry &&
    currentLockStat &&
    Date.now() - currentLockStat.mtimeMs > runLockMaxAgeMs
  ) {
    await rm(lockPath, { force: true }).catch(() => undefined);
    return acquireFilesystemRunLock(runId, lockName, lockToken, false);
  }

  throw new Error("Another run operation is still in progress.");
}

async function acquireBlobRunLock(
  runId: string,
  lockName: string,
  lockToken: string,
  allowRetry: boolean,
) {
  const lockPath = getRunBlobLockPath(runId, lockName);
  ensurePersistentStorageConfigured("Run lock");

  try {
    await writeBlob(lockPath, lockToken, {
      contentType: "application/json; charset=utf-8",
      allowOverwrite: false,
    });
    return;
  } catch {
    const currentLockMetadata = await readBlobMetadata(lockPath).catch(() => null);

    if (
      allowRetry &&
      currentLockMetadata &&
      Date.now() - currentLockMetadata.uploadedAt.getTime() > runLockMaxAgeMs
    ) {
      await deleteBlobRunLockPath(lockPath, {
        runId,
        lockName,
        reason: "stale-reclaim",
      });
      return acquireBlobRunLock(runId, lockName, lockToken, false);
    }
  }

  throw new Error("Another run operation is still in progress.");
}

async function releaseFilesystemRunLock(runId: string, lockName: string, lockToken: string) {
  const lockPath = getRunLockPath(runId, lockName);
  const currentLockToken = await readFile(lockPath, "utf8").catch(() => null);

  if (currentLockToken === lockToken) {
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function releaseBlobRunLock(runId: string, lockName: string) {
  const lockPath = getRunBlobLockPath(runId, lockName);

  await deleteBlobRunLockPath(lockPath, {
    runId,
    lockName,
    reason: "release",
  });
}

async function acquireRunLock(
  runId: string,
  lockName: string,
  lockToken: string,
  allowRetry: boolean,
) {
  if (isBlobStorageEnabled()) {
    return acquireBlobRunLock(runId, lockName, lockToken, allowRetry);
  }

  return acquireFilesystemRunLock(runId, lockName, lockToken, allowRetry);
}

async function releaseRunLock(runId: string, lockName: string, lockToken: string) {
  if (isBlobStorageEnabled()) {
    return releaseBlobRunLock(runId, lockName);
  }

  return releaseFilesystemRunLock(runId, lockName, lockToken);
}

export async function withRunLock<T>(
  runId: string,
  lockName: string,
  work: () => Promise<T>,
) {
  const lockToken = JSON.stringify({
    token: randomUUID(),
    created_at: new Date().toISOString(),
    run_id: runId,
    lock_name: lockName,
  });

  await acquireRunLock(runId, lockName, lockToken, true);

  try {
    return await work();
  } finally {
    await releaseRunLock(runId, lockName, lockToken);
  }
}

export async function writeRunState(run: RunState) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run storage");
    await writeBlobJson(getRunBlobPath(run.id, "run.json"), run);
  } else {
    await ensureRunDir(run.id);
    await writeFile(getRunStatePath(run.id), JSON.stringify(run, null, 2), "utf8");
  }

  syncRunStateToMirror(run);
}

export async function readRunState(runId: string) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run storage");
    const raw = await readBlobJson<unknown>(getRunBlobPath(runId, "run.json"));
    return runStateSchema.parse(raw);
  }

  ensurePersistentStorageConfigured("Run storage");
  const raw = await readFile(getRunStatePath(runId), "utf8");
  return runStateSchema.parse(JSON.parse(raw));
}

export async function readRunStatePreferMirror(runId: string) {
  const mirrored = readMirroredRunState(runId);

  if (mirrored) {
    return mirrored;
  }

  return readRunState(runId);
}

export async function listRunIds() {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run storage");
    const blobs = await listAllBlobs(`${runBlobRoot}/`);

    return [...new Set(
      blobs
        .map((blob) => blob.pathname.split("/")[1] ?? "")
        .filter(Boolean),
    )]
      .filter(Boolean);
  }

  ensurePersistentStorageConfigured("Run storage");
  await mkdir(dataRoot, { recursive: true });
  return readdir(dataRoot);
}

export async function findRunByTelegramMessageId(messageId: string) {
  const runIds = await listRunIds();

  for (const runId of runIds) {
    try {
      const run = await readRunState(runId);

      if (
        run.script_approval.telegram_message_id === messageId ||
        run.image_approval.telegram_message_id === messageId ||
        run.telegram.script_message_id === messageId ||
        run.telegram.image_message_id === messageId ||
        run.telegram.script_reply_message_id === messageId ||
        run.telegram.image_reply_message_id === messageId ||
        run.telegram.publish_control_message_id === messageId
      ) {
        return run;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function readArtifact(runId: string, filename: string) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run artifacts");
    return readBlobBuffer(getRunBlobPath(runId, filename));
  }

  ensurePersistentStorageConfigured("Run artifacts");
  return readFile(getRunArtifactPath(runId, filename));
}

export async function readArtifactText(runId: string, filename: string) {
  const buffer = await readArtifact(runId, filename);
  return buffer.toString("utf8");
}

export function guessArtifactContentType(filename: string) {
  if (filename.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filename.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filename.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }

  if (filename.endsWith(".png")) {
    return "image/png";
  }

  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  return undefined;
}

export async function writeArtifact(
  runId: string,
  filename: string,
  content: string | Buffer,
) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run artifacts");
    await writeBlob(getRunBlobPath(runId, filename), content, {
      contentType: guessArtifactContentType(filename),
    });
    return;
  }

  ensurePersistentStorageConfigured("Run artifacts");
  await ensureRunDir(runId);
  await writeFile(path.join(getRunDir(runId), filename), content);
}

export async function listArtifacts(runId: string) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run artifacts");
    const blobs = await listAllBlobs(`${runBlobRoot}/${runId}/`);

    return blobs.map((blob) => ({
      filename: blob.pathname.replace(`${runBlobRoot}/${runId}/`, ""),
      pathname: blob.pathname,
    }));
  }

  ensurePersistentStorageConfigured("Run artifacts");
  const filenames = await readdir(getRunDir(runId));
  const artifactEntries = await Promise.all(
    filenames.map(async (filename) => {
      const pathname = getRunArtifactPath(runId, filename);
      const entry = await stat(pathname).catch(() => null);

      if (!entry?.isFile()) {
        return null;
      }

      return {
        filename,
        pathname,
      };
    }),
  );

  return artifactEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

export async function clearRun(runId: string) {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Run storage");
    const blobs = await listAllBlobs(`${runBlobRoot}/${runId}/`);
    await deleteBlobPathnames(blobs.map((blob) => blob.pathname));
    return;
  }

  ensurePersistentStorageConfigured("Run storage");
  await rm(getRunDir(runId), { recursive: true, force: true });
}

export function buildEmptyLogs() {
  return stageValues.map((stage) => ({
    stage,
    status: "pending" as const,
    started_at: null,
    ended_at: null,
    summary: null,
  }));
}
