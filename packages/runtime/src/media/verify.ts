/**
 * Decode a whole stream with libav's strict error detection and keep nothing:
 * the in-process form of `ffmpeg -xerror -err_detect explode -i in -f null -`.
 */

import { AV_PKT_FLAG_CORRUPT, Decoder, Demuxer, type Packet } from "node-av";

import { abortError, quietLibav, throwIfAborted } from "./av.js";
import type { MediaKind } from "./decode.js";

/**
 * Decode every frame of `bytes`' first `kind` stream. `format` names the
 * demuxer (`wav`, `ogg`, `mp3`, `png_pipe`, `jpeg_pipe`, `webp_pipe`) instead
 * of probing for it. Throws when the stream is missing, any packet fails to
 * decode, or the stream decodes to nothing.
 */
export async function verifyDecodes(
  bytes: Uint8Array,
  opts: { kind: MediaKind; format?: string; signal?: AbortSignal }
): Promise<void> {
  const { signal } = opts;
  quietLibav();
  throwIfAborted(signal);
  const demuxer = await Demuxer.open(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    format: opts.format,
    // SAFETY: `err_detect` is a generic AVFormatContext option, which every
    // demuxer takes; the per-format option types list only private ones.
    options: { err_detect: "explode" } as Record<string, string>,
    signal
  });
  let decoder: Decoder | null = null;
  try {
    const stream = opts.kind === "audio" ? demuxer.audio() : demuxer.video();
    if (!stream) throw new Error(`The file has no ${opts.kind} stream`);
    // SAFETY: `err_detect` is a generic AVCodecContext option, which every
    // decoder takes; the per-codec option types list only private ones.
    const options = { err_detect: "explode" } as Record<string, string>;
    decoder = await Decoder.create(stream, { exitOnError: true, options, signal });
    let decoded = 0;
    const index = stream.index;
    // A short read marks the packet corrupt; the CLI's `-xerror` failed on it.
    async function* checked(): AsyncGenerator<Packet | null> {
      for await (const packet of demuxer.packets(index)) {
        if (packet && (packet.flags & AV_PKT_FLAG_CORRUPT) !== 0) {
          packet.free();
          throw new Error("A packet is corrupt or cut short");
        }
        yield packet;
      }
    }
    for await (const frame of decoder.frames(checked())) {
      if (!frame) continue;
      try {
        if (signal?.aborted) throw abortError(signal);
        decoded += opts.kind === "audio" ? frame.nbSamples : frame.width * frame.height;
      } finally {
        frame.free();
      }
    }
    if (decoded === 0) throw new Error(`The ${opts.kind} stream decoded to nothing`);
  } finally {
    decoder?.close();
    await demuxer.close();
  }
}
