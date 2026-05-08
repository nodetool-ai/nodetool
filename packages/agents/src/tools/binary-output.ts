/**
 * Shared helper for tools that produce binary output (images, audio, video,
 * downloaded files) and need to:
 *   1. Persist the bytes to the agent workspace so downstream tools can read
 *      them back by their `output_file` key.
 *   2. Push the bytes through the temp / asset storage adapter and resolve a
 *      UI-fetchable URL so the chat UI can display the result inline instead
 *      of echoing a `file://` path or a base64 data URI.
 *
 * Centralized here so download_file, openai_image_generation, openai_tts,
 * gemini_image_generation, etc. all follow the same pattern.
 */

import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "model/gltf-binary": "glb"
};

export function extForMime(mime: string, fallbackName?: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (MIME_TO_EXT[m]) return MIME_TO_EXT[m];
  if (fallbackName) {
    const ext = extname(fallbackName).replace(/^\./, "");
    if (ext) return ext;
  }
  return "bin";
}

export interface PersistedBinary {
  /** Storage key written to workspace (the same `output_file` callers passed in). */
  output_file?: string;
  /** UI-fetchable URL (e.g. `/api/storage/<id>.png`) when one could be resolved. */
  asset_url?: string;
  /** "image" | "audio" | "video" | "file" — chosen from the MIME type. */
  kind?: "image" | "audio" | "video" | "file";
  /**
   * Ready-to-paste markdown that embeds `asset_url` with the right syntax for
   * the asset kind. The chat presenter is instructed to surface this
   * verbatim instead of synthesizing its own markdown around `output_file`
   * (which is a workspace key, not a fetchable URL).
   */
  display_markdown?: string;
}

function kindForMime(mime: string): "image" | "audio" | "video" | "file" {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

function buildDisplayMarkdown(
  url: string,
  kind: "image" | "audio" | "video" | "file",
  label: string
): string {
  const safeLabel = label.replace(/[\[\]]/g, "");
  switch (kind) {
    case "image":
      return `![${safeLabel}](${url})`;
    case "audio":
      return `<audio controls src="${url}"></audio>`;
    case "video":
      return `<video controls src="${url}"></video>`;
    default:
      return `[${safeLabel}](${url})`;
  }
}

export interface PersistBinaryOptions {
  /** Optional workspace key. When set, bytes are also stored in `context.workspaceStorage`. */
  outputFile?: string;
  /** MIME type for storage + UI resolution. */
  contentType: string;
  /** Storage prefix for the temp adapter copy (e.g. `images`, `audio`, `downloads`). */
  uiPrefix?: string;
}

/**
 * Persist binary tool output and produce both a workspace key (for downstream
 * tools to read) and a UI-fetchable URL (for chat rendering).
 *
 * Either side may be unavailable: if no `outputFile` is supplied or no
 * workspace storage is wired, only `asset_url` is returned. If no asset
 * storage is wired, only `output_file` is returned. Tools should treat both
 * fields as optional.
 */
export async function persistBinaryOutput(
  context: ProcessingContext,
  bytes: Uint8Array,
  opts: PersistBinaryOptions
): Promise<PersistedBinary> {
  const result: PersistedBinary = {};

  // Workspace copy — read by downstream tools that take `output_file`.
  if (opts.outputFile && context.workspaceStorage) {
    try {
      await context.workspaceStorage.store(
        opts.outputFile,
        bytes,
        opts.contentType
      );
      result.output_file = opts.outputFile;
    } catch {
      // Non-fatal — the UI URL path may still succeed.
    }
  }

  // UI URL copy — written through the temp / asset adapter so the chat UI
  // can fetch it. Without this, callers either echo a file:// path (which
  // the UI can't render) or inline base64 bytes (which the LLM presenter
  // dutifully echoes back as a giant data URI in markdown).
  if (context.storage) {
    try {
      const ext = extForMime(opts.contentType, opts.outputFile);
      const prefix = opts.uiPrefix ?? "outputs";
      const key = `${prefix}/${randomUUID()}.${ext}`;
      const storageUri = await context.storage.store(
        key,
        bytes,
        opts.contentType
      );
      result.asset_url = await context.resolveTempUrl(storageUri);
    } catch {
      // Non-fatal — if both writes failed, callers get an empty result and
      // can decide how to surface that to the LLM. The `output_file` write
      // would already have populated the workspace key on success.
    }
  }

  if (result.asset_url) {
    const kind = kindForMime(opts.contentType);
    const label = opts.outputFile ?? kind;
    result.kind = kind;
    result.display_markdown = buildDisplayMarkdown(
      result.asset_url,
      kind,
      label
    );
  }

  return result;
}
