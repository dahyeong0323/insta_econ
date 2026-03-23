import { Buffer } from "node:buffer";

import { del, get, head, list, put } from "@vercel/blob";

const PRIVATE_ACCESS = "private" as const;

export class PersistentStorageConfigError extends Error {}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isVercelDeployment() {
  return process.env.VERCEL === "1";
}

export function isBlobStorageEnabled() {
  return hasBlobToken();
}

export function ensurePersistentStorageConfigured(feature: string) {
  if (isVercelDeployment() && !isBlobStorageEnabled()) {
    throw new PersistentStorageConfigError(
      `${feature} requires BLOB_READ_WRITE_TOKEN on Vercel.`,
    );
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function readBlobBuffer(pathname: string) {
  const result = await get(pathname, {
    access: PRIVATE_ACCESS,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob not found: ${pathname}`);
  }

  return streamToBuffer(result.stream);
}

export async function readBlobText(pathname: string) {
  const buffer = await readBlobBuffer(pathname);
  return buffer.toString("utf8");
}

export async function readBlobJson<T>(pathname: string) {
  const raw = await readBlobText(pathname);
  return JSON.parse(raw) as T;
}

export async function writeBlob(
  pathname: string,
  body: string | Buffer,
  options?: {
    contentType?: string;
    allowOverwrite?: boolean;
  },
) {
  await put(pathname, body, {
    access: PRIVATE_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: options?.allowOverwrite ?? true,
    contentType: options?.contentType,
  });
}

export async function writeBlobJson(pathname: string, value: unknown) {
  await writeBlob(pathname, JSON.stringify(value, null, 2), {
    contentType: "application/json; charset=utf-8",
  });
}

export async function listAllBlobs(prefix: string) {
  const blobs: Array<{
    pathname: string;
    url: string;
    size: number;
    uploadedAt: Date;
    etag: string;
  }> = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
    });

    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

export async function listAllFolders(prefix: string) {
  const folders = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
      mode: "folded",
    });

    for (const folder of page.folders) {
      folders.add(folder);
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return [...folders];
}

export async function deleteBlobPathnames(pathnames: string[]) {
  if (pathnames.length === 0) {
    return;
  }

  await del(pathnames);
}

export async function readBlobMetadata(pathname: string) {
  return head(pathname);
}
