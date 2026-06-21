/**
 * Canonical audio encoding/decoding helpers shared across the base-nodes
 * audio node implementations.
 *
 * - `encodeWav` / `decodeWav` operate in Float32 sample space ([-1, 1]) and
 *   handle 16-bit PCM WAV with proper chunk traversal.
 * - `audioBytes` / `audioBytesAsync` / `audioRefFromBytes` deal with the raw
 *   byte stream inside an `AudioRef`, independent of format. These are the
 *   single source of truth for every nodetool audio node — do not duplicate
 *   them at call sites.
 */

import {
  base64ToBytes,
  bytesToBase64,
  loadNodeFsPromises,
  loadNodeOs,
  loadNodePath
} from "@nodetool-ai/nodes-utils";
import { IS_NODE, importNodeBuiltin } from "@nodetool-ai/config";
import type { AudioRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  loadOfflineAudioContext,
  type OfflineAudioContextCtor
} from "./audio-context.js";

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

type AudioRefLike = {
  uri?: string;
  asset_id?: string | null;
  data?: Uint8Array | string;
};

/** Decode a base64 string to bytes, or pass through an existing Uint8Array. */
export function toBytes(value: Uint8Array | string | undefined): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (typeof value !== "string") throw new Error("Invalid audio data");
  return base64ToBytes(value);
}

/** Synchronously extract raw bytes from an AudioRef's inline `data` field. */
export function audioBytes(audio: unknown): Uint8Array {
  if (!audio || typeof audio !== "object") return new Uint8Array();
  return toBytes((audio as AudioRefLike).data);
}

/**
 * Extract raw bytes from an AudioRef, falling back to URI-based retrieval
 * (storage, `file://`, `http(s)://`) when no inline data is present.
 */
export async function audioBytesAsync(
  audio: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!audio || typeof audio !== "object") return new Uint8Array();
  const ref = audio as AudioRefLike;
  if (ref.data) return toBytes(ref.data);
  if (typeof ref.uri === "string" && ref.uri) {
    try {
      if (context?.storage) {
        const stored = await context.storage.retrieve(ref.uri);
        if (stored !== null) return new Uint8Array(stored);
      }
      if (ref.uri.startsWith("file://")) {
        const fs = await loadNodeFsPromises();
        return new Uint8Array(await fs.readFile(uriToPath(ref.uri)));
      }
      if (ref.uri.startsWith("http://") || ref.uri.startsWith("https://")) {
        const response = await fetch(ref.uri);
        if (!response.ok) return new Uint8Array();
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch {
      return new Uint8Array();
    }
  }
  return new Uint8Array();
}

/**
 * Resolve an AudioRef to bytes, throwing a descriptive error when nothing
 * playable can be loaded. Effect nodes use this instead of silently returning
 * their input on empty bytes — a no-op effect is indistinguishable from a
 * working one, so failure must be loud.
 */
export async function requireAudioBytes(
  audio: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  const bytes = await audioBytesAsync(audio, context);
  if (bytes.length > 0) return bytes;

  const ref = (audio && typeof audio === "object" ? audio : {}) as AudioRefLike;
  if (!ref.uri && !ref.asset_id && !ref.data) {
    throw new Error(
      "No audio connected: this effect needs audio on its input, but none was provided."
    );
  }
  if (ref.uri) {
    throw new Error(
      `Could not load audio from "${ref.uri}": it resolved to zero bytes. The file may be missing, empty, or stored somewhere this node can't reach.`
    );
  }
  if (ref.asset_id) {
    throw new Error(
      `Could not load audio for asset "${ref.asset_id}": no inline data and no resolvable URI. The asset may be unavailable in this context.`
    );
  }
  throw new Error("Could not load audio: the connected reference is empty (0 bytes).");
}

/** Strip a `file://` scheme from a URI, returning a plain filesystem path. */
export function uriToPath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) {
    try {
      // Use the Web-standard URL API instead of node:url's fileURLToPath
      // so this helper loads in any runtime. On Windows, the pathname
      // comes back as "/C:/path/foo" — strip the leading slash before
      // returning a real Windows path.
      const pathname = decodeURIComponent(new URL(uriOrPath).pathname);
      return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      // Fallback for non-standard URIs like file://C:\path
      return uriOrPath.slice("file://".length);
    }
  }
  return uriOrPath;
}

/** Wrap raw bytes into an AudioRef (base64-encoding the data). */
export function audioRefFromBytes(data: Uint8Array, uri?: string): AudioRef {
  return {
    type: "audio",
    uri: uri ?? "",
    data: bytesToBase64(data)
  };
}

/** Semantic alias for `audioRefFromBytes` at sites that specifically emit WAV. */
export function audioRefFromWav(wav: Uint8Array, uri?: string): AudioRef {
  return audioRefFromBytes(wav, uri);
}

/** Concatenate Uint8Arrays into a single buffer. */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Write an ASCII tag (e.g. "RIFF") into a byte buffer at `offset`. */
function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
}

/** Read bytes [start, end) as an ASCII string. */
function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let i = start; i < end && i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

/** Write the canonical 44-byte RIFF/WAVE PCM header into `out`. */
function writeWavHeader(
  out: Uint8Array,
  view: DataView,
  sampleRate: number,
  numChannels: number,
  dataSize: number
): void {
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  writeAscii(out, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(out, 8, "WAVE");
  writeAscii(out, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(out, 36, "data");
  view.setUint32(40, dataSize, true);
}

/**
 * Wrap a buffer of already-encoded little-endian 16-bit PCM samples in a
 * RIFF/WAVE container. Use when the caller already has Int16 samples (e.g.
 * from a TTS provider streaming `response_format: "pcm"`) — avoids the
 * Int16 → Float32 → Int16 round-trip that `encodeWav` would impose.
 */
export function encodePcm16Wav(
  pcmBytes: Uint8Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const dataSize = pcmBytes.length;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  writeWavHeader(out, view, sampleRate, numChannels, dataSize);
  out.set(pcmBytes, 44);
  return out;
}

/**
 * Encode Float32 samples (expected range [-1, 1]) as a 16-bit PCM WAV file.
 * Samples outside the range are clipped. Channels are interleaved.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const dataSize = samples.length * 2;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  writeWavHeader(out, view, sampleRate, numChannels, dataSize);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 0x7fff), true);
  }
  return out;
}

export interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  /**
   * The effective WAVE format tag: 1 = integer PCM, 3 = IEEE float. A
   * WAVE_FORMAT_EXTENSIBLE (0xFFFE) header is resolved to its underlying
   * 1 or 3 via the SubFormat GUID.
   */
  audioFormat: number;
  /** Byte offset of the start of the `data` chunk payload. */
  dataOffset: number;
  /** Length of the `data` chunk payload in bytes (clamped to the buffer). */
  dataSize: number;
}

/**
 * Locate the `fmt ` and `data` chunks in a RIFF/WAVE byte stream and return
 * the format fields plus the byte range of the PCM payload.
 *
 * Chunks are traversed honoring RIFF word-alignment (odd-sized chunks carry a
 * trailing pad byte), so layouts that interleave `LIST`/`JUNK`/`fact` chunks
 * — and non-canonical `fmt ` sizes (e.g. WAVE_FORMAT_EXTENSIBLE) — are read
 * correctly. Returns null when the input is not a RIFF/WAVE file or has no
 * `data` chunk.
 */
export function readWavHeader(bytes: Uint8Array): WavHeader | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 12) !== "WAVE") {
    return null;
  }

  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = asciiAt(bytes, offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (chunkId === "fmt " && body + 16 <= bytes.length) {
      audioFormat = view.getUint16(body, true);
      numChannels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE carries the real PCM/float tag in the first
      // two bytes of its SubFormat GUID (at fmt body + 24); unwrap it so
      // downstream sees a plain 1 (int) or 3 (float).
      if (audioFormat === 0xfffe && body + 26 <= bytes.length) {
        audioFormat = view.getUint16(body + 24, true);
      }
    } else if (chunkId === "data") {
      // `fmt ` always precedes `data` in a well-formed file, so the format
      // fields are populated by the time we get here.
      dataOffset = body;
      dataSize = chunkSize;
      break;
    }
    offset = body + chunkSize + (chunkSize & 1);
  }

  if (dataOffset < 0) return null;
  const available = bytes.length - dataOffset;
  if (dataSize <= 0 || dataSize > available) dataSize = available;
  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    audioFormat,
    dataOffset,
    dataSize
  };
}

/**
 * Parse already-loaded WAV bytes into Float32 samples (channel-interleaved).
 * Returns null when the input is not a valid RIFF/WAVE file or carries a
 * format this decoder doesn't handle (caller then falls back to WebAudio /
 * ffmpeg).
 *
 * Supported: integer PCM at 8/16/24/32-bit and IEEE float at 32-bit — the
 * formats `encodeWav`, ffmpeg, and common recorders emit. This is the only
 * decode path with no native-addon or subprocess dependency, so keeping it
 * broad lets edge/workers/browser runtimes decode without ffmpeg. Subchunks
 * are traversed, so layouts with `LIST`/`JUNK`/etc. before `data` work.
 */
export function parseWavBytes(bytes: Uint8Array): WavData | null {
  const header = readWavHeader(bytes);
  if (!header) return null;
  const { sampleRate, numChannels, bitsPerSample, audioFormat, dataOffset, dataSize } =
    header;
  const bytesPerSample = bitsPerSample / 8;

  // format 3 = IEEE float (32-bit only); format 1 (or a 0 tag from minimal
  // encoders) = integer PCM at 8/16/24/32-bit. Anything else → null.
  const isFloat = audioFormat === 3 && bitsPerSample === 32;
  const isPcm =
    (audioFormat === 1 || audioFormat === 0) &&
    (bitsPerSample === 8 ||
      bitsPerSample === 16 ||
      bitsPerSample === 24 ||
      bitsPerSample === 32);
  if (!isFloat && !isPcm) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (isFloat) {
      samples[i] = view.getFloat32(pos, true);
    } else if (bitsPerSample === 16) {
      samples[i] = view.getInt16(pos, true) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (bytes[pos] - 128) / 128;
    } else if (bitsPerSample === 24) {
      let v = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
      if (v & 0x800000) v -= 0x1000000; // sign-extend 24-bit
      samples[i] = v / 0x7fffff;
    } else {
      samples[i] = view.getInt32(pos, true) / 0x7fffffff; // 32-bit int PCM
    }
  }

  return { samples, sampleRate, numChannels };
}

/** Split channel-interleaved samples into per-channel planes. */
export function deinterleave(
  samples: Float32Array,
  numChannels: number
): Float32Array[] {
  const channels = Math.max(1, numChannels);
  const frames = Math.floor(samples.length / channels);
  const planes: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const plane = new Float32Array(frames);
    for (let i = 0; i < frames; i++) plane[i] = samples[i * channels + ch];
    planes.push(plane);
  }
  return planes;
}

/** Interleave per-channel planes back into a single sample buffer. */
export function interleave(planes: Float32Array[]): Float32Array {
  const numChannels = planes.length;
  const frames = numChannels > 0 ? planes[0].length : 0;
  const out = new Float32Array(frames * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    for (let i = 0; i < frames; i++) {
      out[i * numChannels + ch] = planes[ch][i];
    }
  }
  return out;
}

/** Decode raw little-endian 16-bit PCM bytes into Float32 samples ([-1, 1]). */
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.floor(bytes.length / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x7fff;
  }
  return samples;
}

/** Encode Float32 samples (clipped to [-1, 1]) as little-endian 16-bit PCM bytes. */
export function float32ToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(s * 0x7fff), true);
  }
  return out;
}

/**
 * Decode an AudioRef as WAV. Throws when the ref does not contain a valid
 * WAV file.
 */
export function decodeWav(audio: unknown): WavData {
  const wav = parseWavBytes(audioBytes(audio));
  if (!wav) throw new Error("Invalid WAV file");
  return wav;
}

/**
 * Decode an AudioRef as WAV, returning null for non-WAV / malformed input
 * instead of throwing. Use this when a caller wants to fall back to raw
 * byte handling when the input is not WAV.
 */
export function tryDecodeWav(audio: unknown): WavData | null {
  return parseWavBytes(audioBytes(audio));
}

/**
 * Decode arbitrary audio bytes (WAV, or any compressed format — mp3, flac,
 * ogg, m4a, WebM/Opus, …) into interleaved Float32 PCM.
 *
 * Decode order:
 *   1. WAV is parsed directly — no subprocess, no native addon.
 *   2. Otherwise WebAudio's `decodeAudioData` (`node-web-audio-api` on Node,
 *      the global in Chromium Web Workers). Handles mp3/flac/ogg-vorbis, but
 *      its Symphonia backend has no Opus/AAC/ALAC decoder.
 *   3. On Node, when WebAudio can't decode the input — notably the WebM/Opus a
 *      browser `MediaRecorder` produces — fall back to ffmpeg, one of
 *      Nodetool's managed runtime tools (the same universal decoder the ASR
 *      nodes use).
 *
 * When nothing can decode the bytes we throw an actionable error rather than
 * the opaque "Invalid WAV file" from `decodeWav`. Effect/DSP nodes use this
 * instead of `decodeWav` so a stored `.mp3`/`.webm` input is processed rather
 * than rejected.
 */
export async function decodeAudioToWav(bytes: Uint8Array): Promise<WavData> {
  const wav = parseWavBytes(bytes);
  if (wav) return wav;

  // WebAudio first: always present on Node (node-web-audio-api) and in
  // Chromium workers, and avoids a subprocess for the formats it supports.
  const Ctor = await loadOfflineAudioContext();
  let webAudioError: unknown;
  if (Ctor) {
    try {
      return await decodeViaWebAudio(Ctor, bytes);
    } catch (error) {
      webAudioError = error;
    }
  }

  // ffmpeg fallback (Node only): decodes what WebAudio's Symphonia backend
  // can't — notably the WebM/Opus a browser MediaRecorder emits.
  const viaFfmpeg = await tryFfmpegDecodeToWav(bytes);
  if (viaFfmpeg) return viaFfmpeg;

  // Nothing decoded it. Throw a reason that fits the runtime — every branch
  // keeps the "Could not decode audio" prefix that callers/tests match on.
  const WAV_FORMATS = "WAV (8/16/24/32-bit PCM or 32-bit float)";
  if (IS_NODE) {
    const reason = Ctor
      ? `WebAudio can't read it (${
          webAudioError instanceof Error
            ? webAudioError.message
            : String(webAudioError)
        }) and ffmpeg is unavailable`
      : "WebAudio (node-web-audio-api) could not be loaded and ffmpeg is unavailable";
    throw new Error(
      `Could not decode audio: input is not ${WAV_FORMATS} — ${reason}. ` +
        `Install ffmpeg (the Package Manager UI can do this) to decode formats ` +
        `like WebM/Opus, mp3, or m4a, or convert the audio to WAV upstream.`
    );
  }

  if (Ctor) {
    throw new Error(
      `Could not decode audio: the bytes are neither WAV nor a format WebAudio ` +
        `can read (${
          webAudioError instanceof Error
            ? webAudioError.message
            : String(webAudioError)
        }).`
    );
  }

  // Browser worker without WebAudio (Firefox/Safari), or an Edge/Workers
  // runtime with no WebAudio and no subprocess — only the pure-JS WAV path
  // is available here.
  throw new Error(
    `Could not decode audio: this runtime can only decode ${WAV_FORMATS} directly. ` +
      `Convert the audio to WAV upstream, or run this node on a Node server where ` +
      `ffmpeg can decode compressed formats.`
  );
}

/** Decode `bytes` via WebAudio into interleaved Float32 PCM. */
async function decodeViaWebAudio(
  Ctor: OfflineAudioContextCtor,
  bytes: Uint8Array
): Promise<WavData> {
  // decodeAudioData wants a standalone ArrayBuffer; slice to the ref's exact
  // byte range in case `bytes` is a view onto a larger pooled buffer.
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  // The constructor args don't affect decoding — decodeAudioData honors the
  // file's own sample rate / channel count.
  const ctx = new Ctor(1, 1, 44100);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const numChannels = audioBuffer.numberOfChannels;
  const frames = audioBuffer.length;
  const samples = new Float32Array(frames * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = audioBuffer.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      samples[i * numChannels + ch] = channel[i];
    }
  }
  return { samples, sampleRate: audioBuffer.sampleRate, numChannels };
}

/**
 * Decode arbitrary audio to WAV via ffmpeg, preserving the source channel
 * count and sample rate (no `-ac`/`-ar` — an audio effect must not silently
 * downmix or resample). Returns null off-Node, when ffmpeg isn't installed,
 * or when the conversion fails — callers surface their own error. Output is
 * 16-bit PCM, which the effect nodes re-encode to anyway, so no precision is
 * lost relative to the node's result.
 */
async function tryFfmpegDecodeToWav(
  bytes: Uint8Array
): Promise<WavData | null> {
  if (!IS_NODE || bytes.length === 0) return null;
  const childProcess = await importNodeBuiltin<
    typeof import("node:child_process")
  >("node:child_process");
  if (!childProcess) return null;
  const fs = await loadNodeFsPromises();
  const os = await loadNodeOs();
  const path = await loadNodePath();

  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nodetool-audio-decode-")
  );
  const inPath = path.join(dir, "input.bin");
  const outPath = path.join(dir, "output.wav");
  try {
    await fs.writeFile(inPath, bytes);
    await new Promise<void>((resolve, reject) => {
      childProcess.execFile(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-i",
          inPath,
          "-c:a",
          "pcm_s16le",
          "-f",
          "wav",
          outPath
        ],
        { maxBuffer: 64 * 1024 * 1024 },
        (error) => (error ? reject(error) : resolve())
      );
    });
    return parseWavBytes(new Uint8Array(await fs.readFile(outPath)));
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
