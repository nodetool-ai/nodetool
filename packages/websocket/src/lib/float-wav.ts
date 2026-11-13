/**
 * 32-bit float WAV, the format of music mode take and context assets
 * (MUSIC-MODE.md section 11, Storage). Float holds the backend's output
 * without clipping or requantising, and ace-server's `wav32` output is this
 * format, so a 48 kHz stereo result is read here without any conversion.
 */

/** `WAVE_FORMAT_IEEE_FLOAT`. */
const FORMAT_FLOAT = 3;
/** `WAVE_FORMAT_EXTENSIBLE`: the real format is the first two bytes of the sub-format GUID. */
const FORMAT_EXTENSIBLE = 0xfffe;

export interface WavInfo {
  /** 1 for integer PCM, 3 for IEEE float, with an extensible header resolved. */
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** Byte offset of the first sample. */
  dataOffset: number;
  /** Bytes of sample data, clipped to the buffer. */
  dataBytes: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return text;
}

/** The `fmt ` and `data` chunks of a RIFF WAVE file, or null for anything else. */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: Omit<WavInfo, "dataOffset" | "dataBytes"> | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      let tag = view.getUint16(body, true);
      if (tag === FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= bytes.length) {
        tag = view.getUint16(body + 24, true);
      }
      format = {
        format: tag,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true)
      };
    } else if (id === "data") {
      if (!format) return null;
      return {
        ...format,
        dataOffset: body,
        dataBytes: Math.min(size, bytes.length - body)
      };
    }
    // Chunks are padded to an even length.
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * The samples of a 32-bit float WAV at `sampleRate` with `channels`
 * channels, interleaved and bit for bit, or null when the file is in any
 * other format.
 */
export function readFloatWav(
  bytes: Uint8Array,
  sampleRate: number,
  channels: number
): Float32Array | null {
  const info = readWavInfo(bytes);
  if (
    !info ||
    info.format !== FORMAT_FLOAT ||
    info.bitsPerSample !== 32 ||
    info.sampleRate !== sampleRate ||
    info.channels !== channels
  ) {
    return null;
  }
  const count = Math.floor(info.dataBytes / 4 / channels) * channels;
  // Copy: the data chunk need not start on a 4-byte boundary. The copy is a
  // fresh Uint8Array even for a Node Buffer, whose slice is a view of shared
  // memory that would put the header in front of the samples.
  const copy = new Uint8Array(count * 4);
  copy.set(bytes.subarray(info.dataOffset, info.dataOffset + count * 4));
  return new Float32Array(copy.buffer, 0, count);
}

/**
 * Write interleaved float samples as a 32-bit IEEE float WAV: an 18-byte
 * `fmt ` chunk with `cbSize` 0 and the `fact` chunk the format requires.
 */
export function encodeFloatWav(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): Uint8Array {
  if (samples.length % channels !== 0) {
    throw new Error(`${samples.length} samples do not fill whole ${channels}-channel frames`);
  }
  const dataBytes = samples.length * 4;
  const header = 12 + 8 + 18 + 8 + 4 + 8;
  const bytes = new Uint8Array(header + dataBytes);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  tag(0, "RIFF");
  view.setUint32(4, header - 8 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 18, true);
  view.setUint16(20, FORMAT_FLOAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  view.setUint16(36, 0, true);
  tag(38, "fact");
  view.setUint32(42, 4, true);
  view.setUint32(46, samples.length / channels, true);
  tag(50, "data");
  view.setUint32(54, dataBytes, true);
  // Little-endian float32 is the in-memory layout on every host Node runs on;
  // DataView keeps it right on any other.
  for (let index = 0; index < samples.length; index += 1) {
    view.setFloat32(header + index * 4, samples[index] ?? 0, true);
  }
  return bytes;
}
