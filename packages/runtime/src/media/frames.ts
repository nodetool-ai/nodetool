/**
 * Video frames as PNG files, the in-process form of `ffmpeg -i in -vf <filter>
 * frame_%d.png`, `-ss T -i in -frames:v 1 frame.png` and `-sseof`.
 */

import { Encoder, type Frame } from "node-av";

import { abortError, findEncoder, quietLibav } from "./av.js";
import { openFilterGraph } from "./filter-graph.js";

/**
 * One frame as a PNG file. One encoder per frame: a PNG is a whole file, and
 * the encoder's options (size, format) are fixed when it opens.
 */
async function encodePng(frame: Frame, signal: AbortSignal | undefined): Promise<Uint8Array> {
  const codec = findEncoder("png");
  if (!codec) throw new Error("This libav build has no PNG encoder");
  const encoder = await Encoder.create(codec, { signal });
  try {
    const packets = [...(await encoder.encodeAll(frame)), ...(await encoder.encodeAll(null))];
    const parts: Uint8Array[] = [];
    for (const packet of packets) {
      if (packet.data) parts.push(new Uint8Array(packet.data));
      packet.free();
    }
    if (parts.length !== 1) throw new Error("The PNG encoder wrote no picture");
    return parts[0]!;
  } finally {
    encoder.close();
  }
}

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
        yield await encodePng(frame, signal);
        count += 1;
      } finally {
        frame.free();
      }
    }
  } finally {
    await run.close();
  }
}

/**
 * The last frame of `filePath` as PNG, or null when it has no picture: the
 * in-process form of `ffmpeg -sseof -1 -i in -update 1 -frames:v 1 out.png`.
 * Decodes only the last `tailSec` seconds.
 */
export async function lastFramePng(opts: {
  filePath: string;
  durationSec: number | null;
  alpha?: boolean;
  tailSec?: number;
  signal?: AbortSignal;
}): Promise<Uint8Array | null> {
  const { signal } = opts;
  quietLibav();
  const seekSec = Math.max(0, (opts.durationSec ?? 0) - (opts.tailSec ?? 1));
  const run = await openFilterGraph({
    filePath: opts.filePath,
    kind: "video",
    filter: [seekSec > 0 ? "trim=start=0" : null, `format=${opts.alpha ? "rgba" : "rgb24"}`]
      .filter((step) => step)
      .join(","),
    seekSec,
    signal
  });
  if (!run) return null;
  let last: Frame | null = null;
  try {
    for await (const frame of run.frames()) {
      last?.free();
      last = frame;
    }
    return last ? await encodePng(last, signal) : null;
  } finally {
    last?.free();
    await run.close();
  }
}
