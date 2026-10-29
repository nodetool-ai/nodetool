import { trimVideo } from "./media/convert.js";
import { withTaskSpan } from "./tracing-helpers.js";

/**
 * Materialize the exact constant-speed source window sent to a video editor.
 * The source asset remains untouched in storage. The returned MP4 starts at
 * time zero so providers receive the same window-relative contract as the
 * timeline candidate.
 */
export async function trimVideoWindow(
  input: Uint8Array,
  startMs: number,
  endMs: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (
    input.length === 0 ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    throw new Error(
      "Video edit source window must be a positive finite range."
    );
  }
  signal?.throwIfAborted();
  return withTaskSpan(
    "cpu",
    "media.trim_video_window",
    { "nodetool.video.input_bytes": input.length },
    () => trimVideo(input, startMs / 1000, endMs / 1000, { signal })
  );
}
