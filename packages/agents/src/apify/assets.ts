/**
 * Bringing actor-produced bytes into NodeTool.
 *
 * An actor that makes a file — a screenshot, a downloaded video, a rendered
 * PDF — does not hand back the bytes. It hands back a URL into Apify's storage,
 * and those URLs expire. Returning one as if it were a NodeTool asset produces
 * a workflow that works today and is broken next week, so anything worth
 * keeping is fetched through trusted host code and written to NodeTool storage
 * here.
 *
 * Three properties this file exists to hold:
 *
 * - **The guest never fetches.** The download runs on the host through
 *   `safeFetch`, so the URL and every redirect hop are screened for SSRF. An
 *   actor is a third party, and its output URL is therefore attacker-
 *   influenced input, not a trusted handle.
 * - **Size is bounded before it is read.** A `Content-Length` past the cap is
 *   refused without downloading, and the streaming read is cut off at the cap
 *   for a server that declares nothing — a 4 GB video must not become a 4 GB
 *   buffer.
 * - **A failure to import is not a failure of the run.** The actor already ran
 *   and already cost money. An import that fails reports itself and leaves the
 *   remote URL in place, so the caller still has something to use.
 */

import { safeFetch } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { persistBinaryOutput } from "../tools/binary-output.js";
import { ApifyError } from "./errors.js";

/** Largest actor file imported into storage, in bytes. */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

/** What an import produced, or why it did not. */
export interface ImportedFile {
  /** The URL the bytes came from. Always present, even on failure. */
  readonly source_url: string;
  readonly content_type?: string;
  readonly size_bytes?: number;
  /** "image" | "audio" | "video" | "file", from the MIME type. */
  readonly kind?: string;
  /** UI-fetchable URL for the stored copy. */
  readonly asset_url?: string;
  /** Workspace key, when the caller asked for one. */
  readonly output_file?: string;
  /** Set when the import failed; the run itself still succeeded. */
  readonly import_error?: string;
}

/** Read a response body, stopping at `limit` rather than buffering past it. */
async function readCapped(
  response: Response,
  limit: number
): Promise<Uint8Array> {
  const declared = Number(response.headers?.get?.("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    throw new ApifyError(
      "asset_download_failed",
      `The file is ${declared} bytes, past the ${limit}-byte import limit.`
    );
  }

  const body = response.body;
  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > limit) {
      throw new ApifyError(
        "asset_download_failed",
        `The file exceeded the ${limit}-byte import limit.`
      );
    }
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ApifyError(
        "asset_download_failed",
        `The file exceeded the ${limit}-byte import limit while downloading.`
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Fetch one actor-produced URL and persist it.
 *
 * Returns a record rather than throwing on an import failure: the actor run
 * behind this URL has already been paid for, and losing its whole result
 * because one of twenty images 404'd is the wrong trade.
 */
export async function importActorFile(
  context: ProcessingContext,
  url: string,
  options: { outputFile?: string; signal?: AbortSignal } = {}
): Promise<ImportedFile> {
  try {
    const response = await safeFetch(url, { signal: options.signal });
    if (!response.ok) {
      throw new ApifyError(
        "asset_download_failed",
        `Downloading ${url} failed with HTTP ${response.status}.`
      );
    }
    const contentType =
      response.headers?.get?.("content-type")?.split(";")[0]?.trim() ??
      "application/octet-stream";
    const bytes = await readCapped(response, MAX_IMPORT_BYTES);

    const persisted = await persistBinaryOutput(context, bytes, {
      contentType,
      uiPrefix: "apify",
      outputFile: options.outputFile
    });

    return {
      source_url: url,
      content_type: contentType,
      size_bytes: bytes.byteLength,
      kind: persisted.kind,
      asset_url: persisted.asset_url,
      output_file: persisted.output_file
    };
  } catch (e) {
    return {
      source_url: url,
      import_error: e instanceof Error ? e.message : String(e)
    };
  }
}

/** Persist bytes already in hand — a key-value record, say. */
export async function importActorBytes(
  context: ProcessingContext,
  bytes: Uint8Array,
  contentType: string,
  options: { outputFile?: string; label?: string } = {}
): Promise<ImportedFile> {
  const label = options.label ?? "record";
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return {
      source_url: label,
      size_bytes: bytes.byteLength,
      import_error: `The ${label} is ${bytes.byteLength} bytes, past the ${MAX_IMPORT_BYTES}-byte import limit.`
    };
  }
  try {
    const persisted = await persistBinaryOutput(context, bytes, {
      contentType,
      uiPrefix: "apify",
      outputFile: options.outputFile
    });
    return {
      source_url: label,
      content_type: contentType,
      size_bytes: bytes.byteLength,
      kind: persisted.kind,
      asset_url: persisted.asset_url,
      output_file: persisted.output_file
    };
  } catch (e) {
    return {
      source_url: label,
      import_error: e instanceof Error ? e.message : String(e)
    };
  }
}

/**
 * Whether a content type is worth importing rather than leaving remote.
 *
 * Text and JSON are already in the result — importing them would store a copy
 * of something the caller can read directly. Binary is the case an asset
 * exists for.
 */
export function isBinaryContentType(contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type.startsWith("text/")) return false;
  return !(
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/javascript"
  );
}

/** Most files one run imports from its dataset. */
export const MAX_FILES_PER_RUN = 5;

const APIFY_RECORD_URL =
  /^https:\/\/api\.apify\.com\/v2\/key-value-stores\/[A-Za-z0-9]+\/records\/[^\s"']+$/;

/** Whether a string is a URL into Apify's key-value storage — a produced file. */
export function isApifyRecordUrl(value: string): boolean {
  return APIFY_RECORD_URL.test(value);
}

/**
 * The Apify storage URLs a dataset preview points at, in order of first
 * appearance and without duplicates. Every actor names its file field
 * differently (`downloadedFileUrl`, `screenshotUrl`, `fileUrl`), so this walks
 * every string at any depth and keeps the ones that live in Apify's store —
 * the URLs that expire, and therefore the ones worth importing. Anything else
 * (a YouTube manifest, a page URL) is data, not a produced file.
 */
export function collectRecordUrls(
  items: readonly unknown[],
  limit = MAX_FILES_PER_RUN
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (found.length >= limit || depth > 8) return;
    if (typeof value === "string") {
      if (isApifyRecordUrl(value) && !seen.has(value)) {
        seen.add(value);
        found.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, depth + 1);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const entry of Object.values(value)) walk(entry, depth + 1);
    }
  };
  for (const item of items) walk(item, 0);
  return found;
}
