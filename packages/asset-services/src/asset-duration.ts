import { loadMediaModule, probeVideoDurationSeconds } from "@nodetool-ai/runtime";

export function isTimedMedia(contentType: string): boolean {
  return contentType.startsWith("audio/") || contentType.startsWith("video/");
}

export async function probeAssetDurationSeconds(
  contentType: string,
  source: { path: string } | { bytes: Uint8Array }
): Promise<number | null> {
  if (!isTimedMedia(contentType)) return null;
  try {
    const seconds =
      "path" in source
        ? await (await loadMediaModule()).probeDurationSec(source.path)
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
