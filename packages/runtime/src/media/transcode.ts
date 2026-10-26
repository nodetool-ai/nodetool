/**
 * Re-encode a file's video through a filter chain with node-av: the
 * in-process form of `ffmpeg -i in -map 0:v:0 -vf <filter> <codec args> out`.
 * Frame timestamps pass through, so a variable-rate source stays variable.
 */

import { Encoder, type Frame } from "node-av";

import { abortError, findEncoder, openFileMuxer, quietLibav, type FileMuxer } from "./av.js";
import { openFilterGraph } from "./filter-graph.js";
import type { VideoEncoderSpec } from "./rgba.js";

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
  const { spec, signal } = opts;
  quietLibav();
  const codec = findEncoder(spec.codec);
  if (!codec) throw new Error(`This libav build has no ${spec.codec} encoder`);
  const run = await openFilterGraph({
    filePath: opts.inputPath,
    kind: "video",
    filter: [spec.filter, `format=${spec.pixelFormat}`].filter(Boolean).join(","),
    signal
  });
  if (!run) throw new Error(`${opts.inputPath} has no video stream`);
  let output: FileMuxer | null = null;
  let encoder: Encoder | null = null;
  try {
    output = await openFileMuxer(opts.outPath, {
      format: opts.format,
      muxerOptions: opts.muxerOptions,
      signal
    });
    encoder = await Encoder.create(codec, { options: spec.options, signal });
    const index = output.muxer.addStream(encoder);
    const activeEncoder = encoder;
    const activeOutput = output;
    const write = async (frame: Frame | null): Promise<void> => {
      for (const packet of await activeEncoder.encodeAll(frame)) {
        await activeOutput.muxer.writePacket(packet, index);
        packet.free();
      }
    };
    let frames = 0;
    for await (const frame of run.frames()) {
      try {
        if (signal?.aborted) throw abortError(signal);
        await write(frame);
        frames += 1;
      } finally {
        frame.free();
      }
    }
    if (frames === 0) throw new Error(`${opts.inputPath} decoded to no frames`);
    await write(null);
    await output.close();
  } finally {
    await run.close();
    encoder?.close();
    await output?.close();
  }
}
