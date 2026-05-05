/**
 * Shared output-persistence helpers for tools that produce media bytes
 * (images, audio, video, screenshots, etc.).
 *
 * `persistOutput` prefers writing through the context's `createAsset` model
 * interface — that returns a stable `asset_id` and `asset://` URI the agent
 * loop and chat UI can reference. When no asset interface is wired (CLI,
 * tests), it falls back to writing the bytes to a workspace file.
 */

import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";

export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
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
  const ws = (context as unknown as Record<string, unknown>)["workspaceDir"];
  return typeof ws === "string" && ws ? ws : null;
}

export function timestampedName(prefix: string, ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}.${ext}`;
}

export function inferImageMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return "image/png";
}

export interface SavedOutput {
  asset_id?: string;
  asset_uri?: string;
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

  if (typeof context.createAsset === "function") {
    try {
      const name = opts.outputFile ?? timestampedName(opts.namePrefix, ext);
      const asset = (await context.createAsset({
        name,
        contentType: opts.mime,
        content: bytes
      })) as { id?: string };
      if (asset && typeof asset.id === "string") {
        result.asset_id = asset.id;
        result.asset_uri = `asset://${asset.id}.${ext}`;
      }
    } catch {
      // Fall through to filesystem fallback.
    }
  }

  if (opts.outputFile || !result.asset_id) {
    const fileName = opts.outputFile ?? timestampedName(opts.namePrefix, ext);
    const ws = workspaceDir(context);
    const filePath = ws ? path.join(ws, fileName) : fileName;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(bytes));
    result.path = filePath;
  }

  return result;
}
