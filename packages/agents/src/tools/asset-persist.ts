/**
 * Shared output-persistence helpers for tools that produce media bytes
 * (images, audio, video, screenshots, etc.).
 *
 * `persistOutput` prefers writing through the context's `createAsset` model
 * interface — that returns a stable `asset_id` and `asset://` URI the agent
 * loop and chat UI can reference. When no asset interface is wired (CLI,
 * tests), it falls back to writing the bytes to a workspace file.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "application/octet-stream": "bin"
};

export function workspaceDir(context: ProcessingContext): string | null {
  const ws = context.workspaceDir;
  return isString(ws) && ws ? ws : null;
}

export function timestampedName(prefix: string, ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}.${ext}`;
}

export { detectImageMime as inferImageMime } from "@nodetool-ai/runtime";

export interface SavedOutput {
  asset_id?: string;
  asset_uri?: string;
  /** `asset://<id>.<ext>` — ready-made link for the agent's prose. */
  url?: string;
  path?: string;
  bytes: number;
  mime_type: string;
}

export async function persistOutput(
  context: ProcessingContext,
  bytes: Uint8Array,
  opts: {
    namePrefix: string;
    mime: string;
    outputFile?: string;
  }
): Promise<SavedOutput> {
  const ext = MIME_TO_EXT[opts.mime] ?? "bin";
  const result: SavedOutput = { bytes: bytes.length, mime_type: opts.mime };

  // The interface, not the method: `createAsset` is on the prototype either
  // way, so this used to be a check that could not fail.
  if (context.hasModelInterface?.("createAsset")) {
    try {
      const name = opts.outputFile ?? timestampedName(opts.namePrefix, ext);
      const asset = (await context.createAsset({
        name,
        contentType: opts.mime,
        content: bytes
      })) as { id?: string };
      if (asset && isString(asset.id)) {
        result.asset_id = asset.id;
        result.asset_uri = `asset://${asset.id}.${ext}`;
        // The same URI, extension and all: a renderer types the media by the
        // suffix, and the bare `asset://<id>` this used to hand the model's
        // prose embedded a video as an image.
        result.url = result.asset_uri;
      }
    } catch {
      // Fall through to filesystem fallback.
    }
  }

  // Persist a workspace copy so downstream tools can read the bytes back by
  // `output_file`. Routed through the workspace rather than `node:fs`, so a
  // cloud deployment behaves identically.
  if ((opts.outputFile || !result.asset_id) && context.workspace) {
    const fileName = opts.outputFile ?? timestampedName(opts.namePrefix, ext);
    try {
      await context.workspace.write(fileName, bytes, opts.mime);
      result.path = fileName;
    } catch {
      // Non-fatal — asset_id (if set) is still a valid handle.
    }
  }

  return result;
}
