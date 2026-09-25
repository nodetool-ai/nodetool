import { probeVideoDurationSeconds } from "@nodetool-ai/runtime";
import { probeDurationMs } from "./media.js";

export function isTimedMedia(contentType: string): boolean {
  return contentType.startsWith("audio/") || contentType.startsWith("video/");
}

export async function probeAssetDurationSeconds(
  contentType: string,
  source: { path: string } | { bytes: Uint8Array }
): Promise<number | null> {
  if (!isTimedMedia(contentType)) return null;
  try {
    const durationMs =
      "path" in source ? await probeDurationMs(source.path) : null;
    const seconds =
      "path" in source
        ? durationMs === null
          ? null
          : durationMs / 1000
        : await probeVideoDurationSeconds(
            source.bytes,
            new AbortController().signal
          );
    return seconds !== null && Number.isFinite(seconds) && seconds > 0
      ? seconds
      : null;
  } catch {
    return null;
  }
}
