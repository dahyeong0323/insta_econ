import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deleteBlobPathnames,
  ensurePersistentStorageConfigured,
  isBlobStorageEnabled,
  readBlobMetadata,
  readBlobText,
  writeBlob,
} from "@/lib/storage/blob";

const dataRoot = path.join(process.cwd(), ".data");
const researchDispatchLockPath = path.join(dataRoot, "research-dispatch.lock");
const researchDispatchBlobLockPath = "locks/research-dispatch.lock";
const researchDispatchLockMaxAgeMs = 30 * 60 * 1000;

export class ResearchDispatchAuthError extends Error {}

export class ResearchDispatchConfigError extends Error {}

export class ResearchDispatchBusyError extends Error {}

function toDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

function isNodeErrorWithCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  );
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim() || null;
}

function readTrimmedHeader(request: Request, headerName: string) {
  return request.headers.get(headerName)?.trim() || null;
}

function resolveProvidedSecrets(request: Request) {
  return [
    readBearerToken(request),
    readTrimmedHeader(request, "x-research-dispatch-secret"),
    readTrimmedHeader(request, "x-operator-secret"),
  ].filter((value): value is string => Boolean(value));
}

function getConfiguredResearchDispatchSecrets() {
  return [
    process.env.RESEARCH_DISPATCH_SECRET?.trim(),
    process.env.OPERATOR_API_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function matchesAnySecret(expectedSecrets: string[], providedSecrets: string[]) {
  return providedSecrets.some((providedSecret) =>
    expectedSecrets.some((expectedSecret) =>
      timingSafeEqual(toDigest(expectedSecret), toDigest(providedSecret)),
    ),
  );
}

export function authorizeResearchDispatchRequest(request: Request) {
  const expectedSecrets = getConfiguredResearchDispatchSecrets();

  if (expectedSecrets.length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new ResearchDispatchConfigError(
        "RESEARCH_DISPATCH_SECRET or OPERATOR_API_SECRET is required in production.",
      );
    }

    return;
  }

  const providedSecrets = resolveProvidedSecrets(request);

  if (providedSecrets.length === 0) {
    throw new ResearchDispatchAuthError(
      "Research dispatch requests must include the scheduler or operator secret.",
    );
  }

  if (!matchesAnySecret(expectedSecrets, providedSecrets)) {
    throw new ResearchDispatchAuthError("Research dispatch authentication failed.");
  }
}

async function acquireFilesystemResearchDispatchLock(lockToken: string, allowRetry: boolean) {
  ensurePersistentStorageConfigured("Research dispatch lock");
  await mkdir(dataRoot, { recursive: true });

  try {
    await writeFile(researchDispatchLockPath, lockToken, {
      encoding: "utf8",
      flag: "wx",
    });
    return;
  } catch (error) {
    if (!isNodeErrorWithCode(error, "EEXIST")) {
      throw error;
    }
  }

  const currentLockStat = await stat(researchDispatchLockPath).catch(() => null);

  if (
    allowRetry &&
    currentLockStat &&
    Date.now() - currentLockStat.mtimeMs > researchDispatchLockMaxAgeMs
  ) {
    await rm(researchDispatchLockPath, { force: true }).catch(() => undefined);
    return acquireFilesystemResearchDispatchLock(lockToken, false);
  }

  throw new ResearchDispatchBusyError(
    "Another research dispatch is still running, so this request was skipped.",
  );
}

async function acquireBlobResearchDispatchLock(lockToken: string, allowRetry: boolean) {
  ensurePersistentStorageConfigured("Research dispatch lock");

  try {
    await writeBlob(researchDispatchBlobLockPath, lockToken, {
      contentType: "application/json; charset=utf-8",
      allowOverwrite: false,
    });
    return;
  } catch {
    const currentLockMetadata = await readBlobMetadata(researchDispatchBlobLockPath).catch(
      () => null,
    );

    if (
      allowRetry &&
      currentLockMetadata &&
      Date.now() - currentLockMetadata.uploadedAt.getTime() > researchDispatchLockMaxAgeMs
    ) {
      await deleteBlobPathnames([researchDispatchBlobLockPath]).catch(() => undefined);
      return acquireBlobResearchDispatchLock(lockToken, false);
    }
  }

  throw new ResearchDispatchBusyError(
    "Another research dispatch is still running, so this request was skipped.",
  );
}

async function acquireResearchDispatchLock(lockToken: string, allowRetry: boolean) {
  if (isBlobStorageEnabled()) {
    return acquireBlobResearchDispatchLock(lockToken, allowRetry);
  }

  return acquireFilesystemResearchDispatchLock(lockToken, allowRetry);
}

async function releaseBlobResearchDispatchLock(lockToken: string) {
  const currentLockToken = await readBlobText(researchDispatchBlobLockPath).catch(() => null);

  if (currentLockToken === lockToken) {
    await deleteBlobPathnames([researchDispatchBlobLockPath]).catch(() => undefined);
  }
}

async function releaseFilesystemResearchDispatchLock(lockToken: string) {
  ensurePersistentStorageConfigured("Research dispatch lock");
  const currentLockToken = await readFile(researchDispatchLockPath, "utf8").catch(() => null);

  if (currentLockToken === lockToken) {
    await rm(researchDispatchLockPath, { force: true }).catch(() => undefined);
  }
}

export async function readResearchDispatchLockState() {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Research dispatch lock");
    const metadata = await readBlobMetadata(researchDispatchBlobLockPath).catch(() => null);

    if (!metadata) {
      return {
        storage: "blob" as const,
        exists: false,
        createdAt: null,
        isStale: false,
      };
    }

    const createdAt = metadata.uploadedAt.toISOString();

    return {
      storage: "blob" as const,
      exists: true,
      createdAt,
      isStale:
        Date.now() - metadata.uploadedAt.getTime() > researchDispatchLockMaxAgeMs,
    };
  }

  ensurePersistentStorageConfigured("Research dispatch lock");
  const metadata = await stat(researchDispatchLockPath).catch(() => null);

  if (!metadata) {
    return {
      storage: "filesystem" as const,
      exists: false,
      createdAt: null,
      isStale: false,
    };
  }

  return {
    storage: "filesystem" as const,
    exists: true,
    createdAt: new Date(metadata.mtimeMs).toISOString(),
    isStale: Date.now() - metadata.mtimeMs > researchDispatchLockMaxAgeMs,
  };
}

export async function clearResearchDispatchLock() {
  if (isBlobStorageEnabled()) {
    ensurePersistentStorageConfigured("Research dispatch lock");
    await deleteBlobPathnames([researchDispatchBlobLockPath]).catch(() => undefined);
    return {
      cleared: true,
      storage: "blob" as const,
    };
  }

  ensurePersistentStorageConfigured("Research dispatch lock");
  await rm(researchDispatchLockPath, { force: true }).catch(() => undefined);
  return {
    cleared: true,
    storage: "filesystem" as const,
  };
}

export async function withResearchDispatchLock<T>(work: () => Promise<T>) {
  const lockToken = JSON.stringify({
    token: randomUUID(),
    created_at: new Date().toISOString(),
  });

  await acquireResearchDispatchLock(lockToken, true);

  try {
    return await work();
  } finally {
    if (isBlobStorageEnabled()) {
      await releaseBlobResearchDispatchLock(lockToken);
    } else {
      await releaseFilesystemResearchDispatchLock(lockToken);
    }
  }
}
