import {
  decodeAudioBytesToSamples,
  resampleLinear
} from "@nodetool-ai/transformers-js-nodes";

export function samplesToPcm16(samples: Float32Array): ArrayBuffer {
  if (samples.length === 0) {
    throw new Error("Audio input is empty");
  }
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(
      i * 2,
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff),
      true
    );
  }
  return buffer;
}
export async function decodeToPcm16(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (bytes.length === 0) {
    throw new Error("Audio input is empty");
  }
  return samplesToPcm16(await decodeAudioBytesToSamples(bytes, 16000));
}
export function pcm16Base64ToSamples(
  b64: string,
  sampleRate: number
): Float32Array {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) {
    throw new Error("Audio input is empty");
  }
  if (bytes.length % 2 !== 0) {
    throw new Error("PCM16 audio must contain complete samples");
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Audio sample rate must be positive");
  }
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = bytes.readInt16LE(i * 2) / 32768;
  }
  return sampleRate === 16000
    ? samples
    : resampleLinear(samples, sampleRate, 16000);
}
