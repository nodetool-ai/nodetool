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
  loadNodeFsPromises
} from "@nodetool-ai/nodes-utils";
import type { AudioRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

type AudioRefLike = {
  uri?: string;
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
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = asciiAt(bytes, offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (chunkId === "fmt " && body + 16 <= bytes.length) {
      numChannels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
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
  return { sampleRate, numChannels, bitsPerSample, dataOffset, dataSize };
}

/**
 * Parse already-loaded WAV bytes into Float32 samples (channel-interleaved).
 * Returns null when the input is not a valid RIFF/WAVE file.
 * Supports 16-bit and 8-bit PCM. Subchunks are traversed, so non-standard
 * layouts with `LIST`/`JUNK`/etc. before the `data` chunk work correctly.
 */
export function parseWavBytes(bytes: Uint8Array): WavData | null {
  const header = readWavHeader(bytes);
  if (!header) return null;
  const { sampleRate, numChannels, bitsPerSample, dataOffset, dataSize } =
    header;
  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample !== 1 && bytesPerSample !== 2) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = view.getInt16(pos, true) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (bytes[pos] - 128) / 128;
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
