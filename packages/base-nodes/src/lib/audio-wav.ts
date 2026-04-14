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

import { promises as fs } from "node:fs";
import type { AudioRef } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

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
  return Uint8Array.from(Buffer.from(value, "base64"));
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
        return new Uint8Array(await fs.readFile(uriToPath(ref.uri)));
      }
      if (ref.uri.startsWith("http://") || ref.uri.startsWith("https://")) {
        const response = await fetch(ref.uri);
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
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
  return uriOrPath;
}

/** Wrap raw bytes into an AudioRef (base64-encoding the data). */
export function audioRefFromBytes(data: Uint8Array, uri?: string): AudioRef {
  return {
    type: "audio",
    uri: uri ?? "",
    data: Buffer.from(data).toString("base64")
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

/**
 * Encode Float32 samples (expected range [-1, 1]) as a 16-bit PCM WAV file.
 * Samples outside the range are clipped. Channels are interleaved.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

/**
 * Parse already-loaded WAV bytes into Float32 samples.
 * Returns null when the input is not a valid RIFF/WAVE file.
 * Supports 16-bit and 8-bit PCM. Subchunks are traversed, so non-standard
 * layouts with `LIST`/`JUNK`/etc. before the `data` chunk work correctly.
 */
export function parseWavBytes(bytes: Uint8Array): WavData | null {
  if (bytes.length < 44) return null;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const numChannels = buf.readUInt16LE(22);

  let dataOffset = 36;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample !== 1 && bytesPerSample !== 2) return null;
  const totalSamples = Math.floor((buf.length - dataOffset) / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = buf.readInt16LE(pos) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (buf.readUInt8(pos) - 128) / 128;
    }
  }

  return { samples, sampleRate, numChannels };
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
