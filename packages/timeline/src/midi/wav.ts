/**
 * A minimal RIFF/WAVE writer: 16-bit PCM, one channel.
 *
 * The server renderer hands ffmpeg a file rather than a Float32Array, and a
 * whole audio library for a 44-byte header would be the only runtime
 * dependency in the package root.
 */

const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
/** PCM. */
const FORMAT_TAG = 1;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Encode mono float samples as a 16-bit PCM WAVE file. Samples are clamped to
 * [-1, 1] before scaling, so a caller that skipped the soft limiter gets
 * clipping rather than wrapped-around garbage.
 */
export function encodeWavPcm16(
  mono: Float32Array,
  sampleRate: number
): Uint8Array {
  const dataBytes = mono.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const byteRate = (sampleRate * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_TAG, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < mono.length; i++) {
    const clamped = Math.max(-1, Math.min(1, mono[i]));
    // Asymmetric on purpose: -1 maps to -32768 and +1 to 32767, the full range
    // a signed 16-bit sample actually has.
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(WAV_HEADER_BYTES + i * 2, Math.round(value), true);
  }

  return new Uint8Array(buffer);
}
