/**
 * Re-encode a file's video through a filter chain with node-av: the
 * in-process form of `ffmpeg -i in -map 0:v:0 -vf <filter> <codec args> out`.
 * Frame timestamps pass through, so a variable-rate source stays variable.
 */

import type { VideoEncoderSpec } from "./rgba.js";
import { transformMedia } from "./transform.js";

export async function transcodeVideo(opts: {
  inputPath: string;
  outPath: string;
  spec: VideoEncoderSpec;
  /** Container muxer name; defaults to the one for the extension. */
  format?: string;
  /** Muxer AVOptions, e.g. `{ movflags: "+faststart" }`. */
  muxerOptions?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<void> {
  await transformMedia({
    inputs: [{ filePath: opts.inputPath }],
    outPath: opts.outPath,
    video: { filter: "null" },
    audio: null,
    videoEncoder: opts.spec,
    format: opts.format,
    muxerOptions: opts.muxerOptions,
    signal: opts.signal
  });
}
