/**
 * Shared helper for tools that produce binary output (screenshots, downloaded
 * files, edited media) and need to:
 *   1. Save the bytes as one asset whose file is in the run's project folder,
 *      at `output_file` when the caller named one so downstream tools can read
 *      it back by that key, and in `Generated/` otherwise.
 *   2. Hand back the asset's URI as a link the chat UI can display inline
 *      instead of echoing a `file://` path or a base64 data URI.
 *
 * A host with no asset interface keeps the older pair: a workspace file plus
 * a temp storage copy for the UI URL.
 *
 * Centralized here so download_file, take_screenshot, media_edit and every
 * other binary-producing tool follow the same pattern.
 */

import { extname, posix } from "node:path";
import { randomUUID } from "node:crypto";
import { saveRunFileAsset, type ProcessingContext } from "@nodetool-ai/runtime";

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
  /** The asset the bytes were saved as, when the host saves assets. */
  asset_id?: string;
  /** Storage key written to workspace (the same `output_file` callers passed in). */
  output_file?: string;
  /**
   * UI-fetchable URL: the asset's `asset://<id>.<ext>` URI, or a temp storage
   * URL (`/api/storage/<key>`) on a host with no asset interface.
   */
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
  /** Per-side write errors. Set only when a write or URL resolution failed. */
  errors?: { workspace?: string; asset?: string };
}

function kindForMime(mime: string): "image" | "audio" | "video" | "file" {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

function htmlAttrEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function urlForMarkdown(url: string): string {
  // `(`, `)`, ` `, `<`, `>` can prematurely terminate a markdown link target.
  return url.replace(
    /[()\s<>]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function buildDisplayMarkdown(
  url: string,
  kind: "image" | "audio" | "video" | "file",
  label: string
): string {
  const safeLabel = label.replace(/[[\]]/g, "");
  switch (kind) {
    case "image":
      return `![${safeLabel}](${urlForMarkdown(url)})`;
    case "audio":
      return `<audio controls src="${htmlAttrEscape(url)}"></audio>`;
    case "video":
      return `<video controls src="${htmlAttrEscape(url)}"></video>`;
    default:
      return `[${safeLabel}](${urlForMarkdown(url)})`;
  }
}

interface PersistBinaryOptions {
  /** Optional workspace path. When set, bytes are also written to `context.workspace`. */
  outputFile?: string;
  /** MIME type for storage + UI resolution. */
  contentType: string;
  /** Storage prefix for the temp adapter copy (e.g. `images`, `audio`, `downloads`). */
  uiPrefix?: string;
}

/**
 * Save the bytes as an asset. The file is written once, in the run's project
 * folder, and the row points at it. Null when the host saves no assets.
 */
async function persistAsAsset(
  context: ProcessingContext,
  bytes: Uint8Array,
  opts: PersistBinaryOptions
): Promise<PersistedBinary | null> {
  if (!context.hasModelInterface?.("createAsset")) return null;
  const result: PersistedBinary = {};
  const errors: { workspace?: string; asset?: string } = {};
  const ext = extForMime(opts.contentType, opts.outputFile);
  let assetId: string | null = null;
  if (opts.outputFile) {
    try {
      const saved = await saveRunFileAsset(context, bytes, {
        path: opts.outputFile,
        name: posix.basename(opts.outputFile),
        contentType: opts.contentType
      });
      assetId = saved.asset_id;
      if (saved.path) result.output_file = saved.path;
      if (saved.asset_error) errors.asset = saved.asset_error;
    } catch (e) {
      errors.workspace = e instanceof Error ? e.message : String(e);
    }
  } else {
    try {
      const created = (await context.createAsset({
        name: `${opts.uiPrefix ?? "output"}.${ext}`,
        contentType: opts.contentType,
        content: bytes
      })) as { id?: unknown } | null;
      assetId = typeof created?.id === "string" ? created.id : null;
    } catch (e) {
      errors.asset = e instanceof Error ? e.message : String(e);
    }
  }
  if (assetId) {
    result.asset_id = assetId;
    result.asset_url = `asset://${assetId}.${ext}`;
  }
  return withDisplay(result, opts, errors);
}

/** Adds the display fields for `asset_url` and any per-side errors. */
function withDisplay(
  result: PersistedBinary,
  opts: PersistBinaryOptions,
  errors: { workspace?: string; asset?: string }
): PersistedBinary {
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
  if (errors.workspace || errors.asset) {
    result.errors = errors;
  }
  return result;
}

/**
 * Persist binary tool output and produce both a workspace key (for downstream
 * tools to read) and a UI-fetchable URL (for chat rendering).
 *
 * On a host that saves assets the bytes become one asset file in the project
 * folder: at `outputFile` when given, in `Generated/` otherwise. Elsewhere
 * either side may be unavailable: if no `outputFile` is supplied or no
 * workspace storage is wired, only `asset_url` is returned. If no asset
 * storage is wired, only `output_file` is returned. Tools should treat both
 * fields as optional.
 */
export async function persistBinaryOutput(
  context: ProcessingContext,
  bytes: Uint8Array,
  opts: PersistBinaryOptions
): Promise<PersistedBinary> {
  const asAsset = await persistAsAsset(context, bytes, opts);
  if (asAsset) return asAsset;
  const result: PersistedBinary = {};
  const errors: { workspace?: string; asset?: string } = {};

  // Workspace copy — read by downstream tools that take `output_file`.
  if (opts.outputFile && context.workspace) {
    try {
      await context.workspace.write(
        opts.outputFile,
        bytes,
        opts.contentType
      );
      result.output_file = opts.outputFile;
    } catch (e) {
      errors.workspace = e instanceof Error ? e.message : String(e);
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
    } catch (e) {
      errors.asset = e instanceof Error ? e.message : String(e);
    }
  }

  return withDisplay(result, opts, errors);
}
