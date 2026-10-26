/**
 * Video frames as PNG files, the in-process form of `ffmpeg -i in -vf <filter>
 * frame_%d.png` and `-ss T -i in -frames:v 1 frame.png`.
 */

import { Encoder } from "node-av";

import { abortError, findEncoder, quietLibav } from "./av.js";
import { openFilterGraph } from "./filter-graph.js";

/**
 * PNG bytes of every frame `filter` passes, in order. Frames are RGB, or RGBA
 * with `alpha`, as the CLI's PNG encoder chose from the source. `seekSec`
 * starts at the frame shown at that time; `limit` stops after that many.
 * Yields nothing when the file has no video stream.
 */
export async function* pngFrames(opts: {
  filePath: string;
  filter?: string;
  seekSec?: number;
  limit?: number;
  alpha?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<Uint8Array> {
  const { signal } = opts;
  quietLibav();
  const codec = findEncoder("png");
  if (!codec) throw new Error("This libav build has no PNG encoder");
  const seekSec = opts.seekSec && opts.seekSec > 0 ? opts.seekSec : 0;
  const run = await openFilterGraph({
    filePath: opts.filePath,
    kind: "video",
    filter: [
      seekSec > 0 ? "trim=start=0" : null,
      opts.filter,
      `format=${opts.alpha ? "rgba" : "rgb24"}`
    ]
      .filter((step) => step)
      .join(","),
    seekSec,
    signal
  });
  if (!run) return;
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  let count = 0;
  try {
    for await (const frame of run.frames()) {
      try {
        if (signal?.aborted) throw abortError(signal);
        if (count >= limit) break;
        // One encoder per frame: a PNG is a whole file, and the encoder's
        // options (size, format) are fixed when it opens.
        const encoder = await Encoder.create(codec, { signal });
        try {
          const packets = [
            ...(await encoder.encodeAll(frame)),
            ...(await encoder.encodeAll(null))
          ];
          for (const packet of packets) {
            if (packet.data) yield new Uint8Array(packet.data);
            packet.free();
          }
        } finally {
          encoder.close();
        }
        count += 1;
      } finally {
        frame.free();
      }
    }
  } finally {
    await run.close();
  }
}
