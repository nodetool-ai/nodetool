/** Decode a file's audio to float PCM with node-av. */

import { openFilterGraph } from "./filter-graph.js";
import { probeMedia } from "./probe.js";

export interface PcmOptions {
  /** Output sample rate. */
  sampleRate: number;
  /**
   * Output channel count. Omit to keep the source layout. A `filter` that sets
   * the layout itself (`pan=mono|...`) decides it instead.
   */
  channels?: number;
  /** Filters applied before the resample, e.g. a `pan` downmix. */
  filter?: string;
  /** Stop after this many seconds of output, as the CLI's `-t` did. */
  maxSeconds?: number;
  signal?: AbortSignal;
}

export interface PcmAudio {
  /** Interleaved samples, `channels` per frame. */
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

function channelLayout(channels: number): string {
  if (channels === 1) return "mono";
  if (channels === 2) return "stereo";
  return `${channels}c`;
}

function pcmFilter(options: PcmOptions): string {
  const steps = [
    options.filter,
    `aresample=${options.sampleRate}`,
    options.channels
      ? `aformat=sample_fmts=flt:channel_layouts=${channelLayout(options.channels)}`
      : "aformat=sample_fmts=flt",
    options.maxSeconds !== undefined ? `atrim=end=${options.maxSeconds}` : undefined
  ];
  return steps.filter((step): step is string => Boolean(step)).join(",");
}

/**
 * Stream `filePath`'s first audio stream as interleaved float chunks. Yields
 * nothing when the file has no audio stream. Reading stops at the caller's
 * pace, so a two-hour file never sits in memory whole.
 */
export async function* decodeAudioChunks(
  filePath: string,
  options: PcmOptions
): AsyncGenerator<{ samples: Float32Array; channels: number }> {
  const run = await openFilterGraph({
    filePath,
    kind: "audio",
    filter: pcmFilter(options),
    signal: options.signal
  });
  if (!run) return;
  try {
    for await (const frame of run.frames()) {
      try {
        const bytes = frame.toBuffer();
        // Copy out of the frame's buffer, which libav reuses once it is freed.
        const samples = new Float32Array(bytes.byteLength / 4);
        new Uint8Array(samples.buffer).set(bytes);
        yield { samples, channels: frame.channels };
      } finally {
        frame.free();
      }
    }
  } finally {
    await run.close();
  }
}

/**
 * Decode `filePath`'s first audio stream to interleaved float PCM at
 * `sampleRate`. Throws when the file has no audio stream.
 */
export async function decodeAudioToPcm(
  filePath: string,
  options: PcmOptions
): Promise<PcmAudio> {
  const chunks: Float32Array[] = [];
  let channels = 0;
  let length = 0;
  let sawStream = false;
  for await (const chunk of decodeAudioChunks(filePath, options)) {
    sawStream = true;
    channels = chunk.channels;
    chunks.push(chunk.samples);
    length += chunk.samples.length;
  }
  if (!sawStream) {
    // An audio stream that decodes to nothing still names its layout.
    const probe = await probeMedia(filePath, { signal: options.signal });
    if (!probe.audio) throw new Error(`${filePath} has no audio stream`);
    channels = options.channels ?? probe.audio.channels;
  }
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return { samples, sampleRate: options.sampleRate, channels };
}
