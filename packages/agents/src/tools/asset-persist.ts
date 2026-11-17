/**
 * Shared output-persistence helpers for tools that produce media bytes
 * (images, audio, video, screenshots, etc.).
 *
 * `persistOutput` saves through the context's `createAsset` model interface,
 * which writes one file in the run's project folder and returns a stable
 * `asset_id` and `asset://` URI the agent loop and chat UI can reference.
 * With `output_file` the file is at that path; without it the host names it
 * in `Generated/`. When no asset interface is wired (tests), the bytes go to
 * a workspace file.
 */

import { posix } from "node:path";
import { saveRunFileAsset, type ProcessingContext } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/vnd.adobe.photoshop": "psd",
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
  const setAsset = (assetId: string): void => {
    result.asset_id = assetId;
    result.asset_uri = `asset://${assetId}.${ext}`;
    // The same URI, extension and all: a renderer types the media by the
    // suffix, and the bare `asset://<id>` this used to hand the model's
    // prose embedded a video as an image.
    result.url = result.asset_uri;
  };

  // A named file is the asset's file: written once, at that path in the
  // project folder, with the row pointing at it.
  if (opts.outputFile) {
    try {
      const saved = await saveRunFileAsset(context, bytes, {
        path: opts.outputFile,
        name: posix.basename(opts.outputFile),
        contentType: opts.mime
      });
      if (saved.asset_id) setAsset(saved.asset_id);
      if (saved.path) result.path = saved.path;
    } catch {
      // Neither an asset nor a workspace file: the caller reports no handle.
    }
    return result;
  }

  // The interface, not the method: `createAsset` is on the prototype either
  // way, so this used to be a check that could not fail.
  if (context.hasModelInterface?.("createAsset")) {
    try {
      const asset = (await context.createAsset({
        name: timestampedName(opts.namePrefix, ext),
        contentType: opts.mime,
        content: bytes
      })) as { id?: string };
      if (asset && isString(asset.id)) setAsset(asset.id);
    } catch {
      // Fall through to the workspace file below.
    }
  }

  // No asset: a workspace file is the only handle the caller gets. Routed
  // through the workspace rather than `node:fs`, so a cloud deployment
  // behaves identically.
  if (!result.asset_id && context.workspace) {
    const fileName = timestampedName(opts.namePrefix, ext);
    try {
      await context.workspace.write(fileName, bytes, opts.mime);
      result.path = fileName;
    } catch {
      // Neither handle exists; the caller reports it.
    }
  }

  return result;
}
