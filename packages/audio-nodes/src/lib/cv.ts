/**
 * Control-voltage (CV) signal helpers for the modular synthesis nodes.
 *
 * CV rides the same chunk wire shape as streaming audio (`type:"chunk"`,
 * `content_type:"audio"`, base64 payload, `done:true` terminator) but with
 * `encoding:"f32le"`: pcm16 clamps to [-1,1] and quantizes, which is wrong
 * for multi-octave pitch CV. `readSignalChunk` decodes both encodings, so
 * any signal node accepts audio and CV interchangeably (Eurorack semantics).
 *
 * Also home to the sample-domain timing utilities:
 *  - `SampleFifo` / `alignedSignalStreams` — the "zip-with-hold" pattern for
 *    multi-input streaming nodes (the kernel has no sample-aligned zip;
 *    alignment is exact when one clock drives the patch, hold-last
 *    otherwise).
 *  - `abortableSleep` / `RealtimePacer` — wall-clock pacing for
 *    `realtime: true` generators. Pacing only delays emission; signal
 *    content is identical to a free run.
 */
import type { StreamingInputs } from "@nodetool-ai/node-sdk";
import { base64ToBytes, bytesToBase64 } from "@nodetool-ai/nodes-utils";
import { float32ToPcm16, pcm16ToFloat32 } from "./audio-wav.js";

export type SignalEncoding = "pcm16le" | "f32le";

/** Default sample rate for synth generators (matches the chunk default). */
export const SYNTH_SAMPLE_RATE = 24000;
/** Frames per generated chunk (~21 ms @ 24 kHz). */
export const SYNTH_CHUNK_FRAMES = 512;

/** Default value for `@prop({ type: "chunk" })` declarations on signal nodes. */
export const CHUNK_PROP_DEFAULT = {
  type: "chunk",
  node_id: null,
  thread_id: null,
  workflow_id: null,
  content_type: "audio",
  content: "",
  content_metadata: {},
  done: false,
  thinking: false
};

export interface SignalChunk {
  /** Channel-interleaved samples; empty for done markers. */
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  done: boolean;
}

/**
 * Parse a streamed item as a signal (audio or CV) chunk. Returns null for
 * non-audio chunks and non-chunk values, which callers skip. Decodes
 * `encoding:"f32le"` payloads as little-endian float32; anything else
 * (including absent metadata) takes the legacy pcm16le path.
 */
export function readSignalChunk(item: unknown): SignalChunk | null {
  if (!item || typeof item !== "object") return null;
  const c = item as {
    content?: unknown;
    content_type?: unknown;
    content_metadata?: unknown;
    done?: unknown;
  };
  if (c.content_type !== undefined && c.content_type !== "audio") return null;
  const meta = (c.content_metadata ?? {}) as {
    encoding?: unknown;
    sample_rate?: unknown;
    channels?: unknown;
  };
  const sampleRate =
    typeof meta.sample_rate === "number" && meta.sample_rate > 0
      ? meta.sample_rate
      : SYNTH_SAMPLE_RATE;
  const channels =
    typeof meta.channels === "number" && meta.channels > 0 ? meta.channels : 1;
  const content = typeof c.content === "string" ? c.content : "";
  let samples: Float32Array;
  if (!content) {
    samples = new Float32Array(0);
  } else {
    const bytes = base64ToBytes(content);
    samples =
      meta.encoding === "f32le" ? f32leToFloat32(bytes) : pcm16ToFloat32(bytes);
  }
  return { samples, sampleRate, channels, done: Boolean(c.done ?? false) };
}

/** Build a signal chunk in the shared chunk wire shape. */
export function makeSignalChunk(
  samples: Float32Array,
  sampleRate: number,
  channels: number,
  done: boolean,
  encoding: SignalEncoding
): Record<string, unknown> {
  const bytes =
    encoding === "f32le" ? float32ToF32le(samples) : float32ToPcm16(samples);
  return {
    type: "chunk",
    content: samples.length > 0 ? bytesToBase64(bytes) : "",
    done,
    content_type: "audio",
    content_metadata: {
      encoding,
      sample_rate: sampleRate,
      channels,
      format: "pcm",
      duration_seconds: samples.length / Math.max(1, channels) / sampleRate
    }
  };
}

/** End-of-stream marker: empty content, `done: true`. */
export function makeDoneSignalChunk(
  sampleRate: number,
  channels: number,
  encoding: SignalEncoding
): Record<string, unknown> {
  return makeSignalChunk(new Float32Array(0), sampleRate, channels, true, encoding);
}

/** Decode little-endian float32 bytes (explicit DataView for endianness safety). */
export function f32leToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.floor(bytes.length / 4);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/** Encode samples as little-endian float32 bytes. */
export function float32ToF32le(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(i * 4, samples[i], true);
  }
  return out;
}

// ── Sample FIFO + zip-with-hold ────────────────────────────────────

/**
 * Mono sample queue with hold-last semantics: pulling past the available
 * samples repeats the last seen value ("hold", the modular sample-&-hold
 * convention for a lagging or finished CV source) or fills zeros ("zero",
 * correct for ended audio in a mixer). Initial held value is 0.
 */
export class SampleFifo {
  private _segments: Float32Array[] = [];
  private _offset = 0;
  private _available = 0;
  private _last = 0;

  get available(): number {
    return this._available;
  }

  /** The most recently pushed (or pulled) sample value; 0 before any data. */
  get last(): number {
    return this._last;
  }

  push(samples: Float32Array): void {
    if (samples.length === 0) return;
    this._segments.push(samples);
    this._available += samples.length;
  }

  pull(n: number, mode: "hold" | "zero"): Float32Array {
    const out = new Float32Array(n);
    let written = 0;
    while (written < n && this._segments.length > 0) {
      const seg = this._segments[0];
      const take = Math.min(n - written, seg.length - this._offset);
      out.set(seg.subarray(this._offset, this._offset + take), written);
      written += take;
      this._offset += take;
      if (this._offset >= seg.length) {
        this._segments.shift();
        this._offset = 0;
      }
    }
    this._available -= written;
    if (written > 0) this._last = out[written - 1];
    if (written < n && mode === "hold") {
      out.fill(this._last, written);
    }
    return out;
  }
}

export interface AlignedFrame {
  /** The primary (driving) chunk — never a done marker. */
  primary: SignalChunk;
  /**
   * Per-CV-handle mono sample arrays, one value per primary *frame*
   * (hold-last when a CV source lags or has ended). Unconnected handles are
   * absent — check membership rather than relying on defaults.
   */
  cv: Record<string, Float32Array>;
}

/**
 * Zip-with-hold: consume one primary stream and any number of CV streams,
 * yielding the primary chunks paired with frame-aligned CV values.
 *
 * Sample-exact when all streams share cadence (a patch driven by a single
 * clock source); otherwise CV degrades to hold-last. Deadlock-free: the
 * single `inputs.any()` loop only blocks while some upstream is open, and a
 * primary chunk is released as soon as every connected CV handle can cover
 * it (buffered, done, or the whole loop ended). Multichannel CV inputs are
 * collapsed to channel 0.
 */
export async function* alignedSignalStreams(
  inputs: StreamingInputs,
  opts: { primary: string; cvHandles: readonly string[] }
): AsyncGenerator<AlignedFrame> {
  const connected = opts.cvHandles.filter((h) => inputs.hasStream(h));
  const fifos = new Map(connected.map((h) => [h, new SampleFifo()]));
  const cvDone = new Map(connected.map((h) => [h, false]));
  const pending: SignalChunk[] = [];
  let primaryDone = false;

  const frameCount = (chunk: SignalChunk): number =>
    Math.floor(chunk.samples.length / Math.max(1, chunk.channels));

  const covered = (frames: number): boolean =>
    connected.every(
      (h) => cvDone.get(h) || (fifos.get(h)?.available ?? 0) >= frames
    );

  function* drain(force: boolean): Generator<AlignedFrame> {
    while (pending.length > 0) {
      const frames = frameCount(pending[0]);
      if (!force && !covered(frames)) break;
      const primary = pending.shift()!;
      const cv: Record<string, Float32Array> = {};
      for (const h of connected) cv[h] = fifos.get(h)!.pull(frames, "hold");
      yield { primary, cv };
    }
  }

  for await (const [handle, item] of inputs.any()) {
    const chunk = readSignalChunk(item);
    if (!chunk) continue;
    if (handle === opts.primary) {
      if (chunk.done) primaryDone = true;
      else if (chunk.samples.length > 0) pending.push(chunk);
    } else if (fifos.has(handle)) {
      if (chunk.done) cvDone.set(handle, true);
      else fifos.get(handle)!.push(monoChannel(chunk));
    } else {
      continue;
    }
    yield* drain(false);
    if (primaryDone && pending.length === 0) break;
  }
  // The any() loop ended (EOS everywhere) — release whatever is left with
  // hold-last CV.
  yield* drain(true);
}

/** Channel 0 of an interleaved chunk (CV is conceptually mono). */
function monoChannel(chunk: SignalChunk): Float32Array {
  const channels = Math.max(1, chunk.channels);
  if (channels === 1) return chunk.samples;
  const frames = Math.floor(chunk.samples.length / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = chunk.samples[i * channels];
  return out;
}

// ── Realtime pacing ────────────────────────────────────────────────

/** Sleep that resolves early (without throwing) when `signal` aborts. */
export function abortableSleep(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Drift-compensated wall-clock pacer for `realtime: true` generators: chunk
 * k is released no earlier than `start + k·chunkMs` (same scheme as
 * IntervalTriggerNode). Pacing never alters chunk contents — a realtime
 * render is bit-identical to a free run.
 */
export class RealtimePacer {
  private readonly _startMs = Date.now();
  private _emitted = 0;

  constructor(private readonly _signal?: AbortSignal) {}

  /**
   * Wait for the next emission slot. Returns false when the run was
   * cancelled — the caller must stop producing.
   */
  async waitNext(chunkMs: number): Promise<boolean> {
    const targetMs = this._startMs + this._emitted * chunkMs;
    this._emitted++;
    const waitMs = targetMs - Date.now();
    if (waitMs > 0) await abortableSleep(waitMs, this._signal);
    return !(this._signal?.aborted ?? false);
  }
}
