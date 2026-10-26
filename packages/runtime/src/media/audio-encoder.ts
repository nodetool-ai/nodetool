/**
 * An audio encoder that keeps the last partial frame.
 *
 * node-av's `Encoder` chunks audio to the codec's frame size through an
 * internal buffer whose flush only emits whole frames, so up to one frame of
 * samples at the end of every stream is silently dropped (128 ms of AAC at
 * 8 kHz). The ffmpeg CLI sends that tail as a short last frame. This wrapper
 * chunks with `asetnsamples` instead, hands the encoder whole frames, and sends
 * the short tail to the codec context directly.
 */

import {
  avChannelLayoutDefault,
  avGetSampleFmtName,
  CodecContext,
  Dictionary,
  Encoder,
  FilterAPI,
  Rational,
  type Codec,
  type Frame,
  type Packet
} from "node-av";

import { findEncoder, quietLibav } from "./av.js";

/** The frame size `codec` opens with at these settings; 0 means any size. */
async function probeFrameSize(
  codec: Codec,
  sampleRate: number,
  channels: number,
  options: Record<string, string> | undefined
): Promise<{ frameSize: number; sampleFormat: string }> {
  const sampleFormat = codec.sampleFormats?.[0];
  if (sampleFormat === undefined) throw new Error(`${codec.name} declares no sample format`);
  const context = new CodecContext();
  context.allocContext3(codec);
  try {
    context.sampleRate = sampleRate;
    context.sampleFormat = sampleFormat;
    context.channelLayout = avChannelLayoutDefault(channels);
    context.timeBase = new Rational(1, sampleRate);
    const dictionary = options ? Dictionary.fromObject(options) : null;
    const opened = await context.open2(codec, dictionary);
    dictionary?.free();
    if (opened < 0) throw new Error(`Could not open the ${codec.name} encoder (${opened})`);
    return { frameSize: context.frameSize, sampleFormat: avGetSampleFmtName(sampleFormat) ?? "" };
  } finally {
    context.freeContext();
  }
}

export class AudioEncoder {
  private tail: Frame | null = null;

  private constructor(
    /** Add this to a muxer before the first {@link encode}. */
    readonly encoder: Encoder,
    private readonly chunker: FilterAPI,
    private readonly frameSize: number
  ) {}

  /**
   * An encoder for `codecName` at `sampleRate` with `channels` channels. Input
   * frames may arrive in any rate, format and layout; they are converted as
   * the CLI's `-ar` and `-ac` converted them.
   */
  static async create(
    codecName: string,
    opts: {
      sampleRate: number;
      channels: number;
      options?: Record<string, string>;
      signal?: AbortSignal;
    }
  ): Promise<AudioEncoder> {
    quietLibav();
    const codec = findEncoder(codecName);
    if (!codec) throw new Error(`This libav build has no ${codecName} encoder`);
    const { frameSize, sampleFormat } = await probeFrameSize(
      codec,
      opts.sampleRate,
      opts.channels,
      opts.options
    );
    const layout = opts.channels === 1 ? "mono" : opts.channels === 2 ? "stereo" : `${opts.channels}c`;
    const chunker = FilterAPI.create(
      [
        `aresample=${opts.sampleRate}`,
        `aformat=sample_fmts=${sampleFormat}:sample_rates=${opts.sampleRate}:channel_layouts=${layout}`,
        frameSize > 0 ? `asetnsamples=n=${frameSize}:p=0` : undefined
      ]
        .filter(Boolean)
        .join(","),
      { signal: opts.signal }
    );
    const encoder = await Encoder.create(codec, { options: opts.options, signal: opts.signal });
    return new AudioEncoder(encoder, chunker, frameSize);
  }

  /** Encode `frame` (still the caller's to free) and return the packets ready. */
  async encode(frame: Frame): Promise<Packet[]> {
    return this.encodeChunks(await this.chunker.processAll(frame));
  }

  /** Encode what is buffered, including a short last frame, and end the stream. */
  async flush(): Promise<Packet[]> {
    const packets = await this.encodeChunks(await this.chunker.processAll(null));
    const tail = this.tail;
    this.tail = null;
    const context = this.encoder.getCodecContext();
    if (tail && context) {
      // Past the encoder's whole-frame buffer, which would drop it.
      const sent = await context.sendFrame(tail);
      tail.free();
      if (sent < 0) throw new Error(`The audio encoder refused the last frame (${sent})`);
    } else {
      tail?.free();
    }
    packets.push(...(await this.encoder.encodeAll(null)));
    return packets;
  }

  close(): void {
    this.tail?.free();
    this.tail = null;
    this.chunker.close();
    this.encoder.close();
  }

  private async encodeChunks(chunks: Frame[]): Promise<Packet[]> {
    const packets: Packet[] = [];
    for (const chunk of chunks) {
      if (this.frameSize > 0 && chunk.nbSamples < this.frameSize) {
        // Only the stream's last chunk is short; hold it for flush().
        this.tail?.free();
        this.tail = chunk;
        continue;
      }
      try {
        packets.push(...(await this.encoder.encodeAll(chunk)));
      } finally {
        chunk.free();
      }
    }
    return packets;
  }
}
