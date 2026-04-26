/**
 * Minimal WAV encode/decode helpers shared between the TTS workflow node and
 * the transformers.js provider. Mirrors `encodeWav` in `@nodetool/base-nodes`
 * (`src/lib/audio-wav.ts`); update both if the canonical encoder ever changes.
 */

export function encodeWav(
  samples: ArrayLike<number>,
  sampleRate: number,
  numChannels = 1
): Buffer {
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
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

/**
 * Decode a 16- or 32-bit PCM WAV file into a mono Float32Array in [-1, 1].
 * Multi-channel input is downmixed by averaging channels.
 *
 * Supports the common subset emitted by `encodeWav` (16-bit PCM mono) plus
 * 32-bit float PCM, which is what most TTS models produce. For other formats
 * an error is thrown — callers should pre-convert.
 */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint8(0) !== 0x52 ||
    view.getUint8(1) !== 0x49 ||
    view.getUint8(2) !== 0x46 ||
    view.getUint8(3) !== 0x46
  ) {
    throw new Error("Not a WAV file (missing RIFF header)");
  }

  // Walk chunks to find "fmt " and "data".
  let offset = 12;
  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt ") fmtOffset = offset + 8;
    else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error("WAV missing fmt or data chunk");
  }

  const audioFormat = view.getUint16(fmtOffset, true);
  const numChannels = view.getUint16(fmtOffset + 2, true);
  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);

  const isPcm = audioFormat === 1 && (bitsPerSample === 16 || bitsPerSample === 8);
  const isFloat = audioFormat === 3 && bitsPerSample === 32;
  if (!isPcm && !isFloat) {
    throw new Error(
      `Unsupported WAV format (audioFormat=${audioFormat}, bits=${bitsPerSample})`
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = dataSize / (bytesPerSample * numChannels);
  const out = new Float32Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      const sampleOffset = dataOffset + (i * numChannels + c) * bytesPerSample;
      let v: number;
      if (bitsPerSample === 16) {
        v = view.getInt16(sampleOffset, true) / 0x8000;
      } else if (bitsPerSample === 8) {
        v = (view.getUint8(sampleOffset) - 128) / 128;
      } else {
        v = view.getFloat32(sampleOffset, true);
      }
      sum += v;
    }
    out[i] = sum / numChannels;
  }

  return { samples: out, sampleRate, numChannels };
}

/** Linear-resample a mono float32 buffer to a target sample rate. */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const lo = Math.floor(srcPos);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcPos - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
}
