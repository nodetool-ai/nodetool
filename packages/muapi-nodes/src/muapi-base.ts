/**
 * Node-side helpers for the MuAPI pack.
 *
 * The transport — submit, poll, upload, download, and the billing and SSRF
 * rules around them — lives in `@nodetool-ai/runtime/provider-transport`,
 * shared with `MuapiProvider`. These nodes are thin wrappers over it: they
 * exist so a graph can pin MuAPI explicitly, while the generic Text to Video
 * and Image to Video nodes reach the same routes through the provider.
 */

import type { VideoRef } from "@nodetool-ai/node-sdk";
import { loadMediaRefBytes, type ProcessingContext } from "@nodetool-ai/runtime";
import { MUAPI_VIDEO_DURATIONS } from "@nodetool-ai/runtime/provider-transport";

export {
  MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
  MUAPI_TEXT_TO_VIDEO_ENDPOINT,
  MUAPI_VIDEO_ASPECT_RATIOS,
  MUAPI_VIDEO_RESOLUTIONS,
  muapiUploadImage,
  runMuapiMedia
} from "@nodetool-ai/runtime/provider-transport";

export const MUAPI_MIN_DURATION = Math.min(...MUAPI_VIDEO_DURATIONS);
export const MUAPI_MAX_DURATION = Math.max(...MUAPI_VIDEO_DURATIONS);

export function getMuapiApiKey(
  secrets: Record<string, string> | undefined
): string {
  const key = (secrets?.MUAPI_API_KEY || process.env.MUAPI_API_KEY || "").trim();
  if (!key) throw new Error("MUAPI_API_KEY is not configured");
  return key;
}

/** Clamp a prop-supplied duration onto the window the routes accept. */
export function normalizeMuapiVideoDuration(value: unknown): number {
  const duration = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(
    MUAPI_MAX_DURATION,
    Math.max(MUAPI_MIN_DURATION, Math.round(duration))
  );
}

export function videoRefFromBytes(bytes: Uint8Array): VideoRef {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(bytes).toString("base64"),
    format: "mp4"
  };
}

export async function resolveInputImageBytes(
  image: Parameters<typeof loadMediaRefBytes>[0],
  context?: ProcessingContext
): Promise<Uint8Array> {
  const bytes = await loadMediaRefBytes(image, context);
  if (!bytes || bytes.length === 0) throw new Error("An input image is required");
  return bytes;
}
