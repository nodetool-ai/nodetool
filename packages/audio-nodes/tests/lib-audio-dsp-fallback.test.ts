/**
 * Pins the two branches of the batch filter seam (`applyFilter`):
 *  - WebAudio branch — on Node, `loadOfflineAudioContext` resolves the
 *    node-web-audio-api constructor.
 *  - Pure-JS fallback — when the constructor is unavailable (Web Workers
 *    without WebAudio), the RBJ biquad path must produce equivalent output.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const SAMPLE_RATE = 16000;

function nyquistWav(frames = 2048) {
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) samples[i] = i % 2 === 0 ? 0.8 : -0.8;
  return { samples, sampleRate: SAMPLE_RATE, numChannels: 1 };
}

function tailRms(samples: Float32Array, skip = 256): number {
  let sum = 0;
  for (let i = skip; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length - skip));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@nodetool-ai/audio-nodes/lib/audio-context");
});

async function runLowPass(): Promise<Float32Array> {
  const { applyFilter } = await import(
    "@nodetool-ai/audio-nodes/nodes/lib-audio-dsp"
  );
  const { parseWavBytes } = await import("@nodetool-ai/audio-nodes");
  const ref = await applyFilter(nyquistWav(), {
    type: "lowpass",
    frequency: 1000
  });
  const binary = atob(String(ref.data));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wav = parseWavBytes(bytes);
  if (!wav) throw new Error("expected WAV output");
  return wav.samples;
}

// Generous timeout: node-web-audio-api's OfflineAudioContext render can blow
// the 5 s default when the whole workspace's test suites run in parallel.
const RENDER_TIMEOUT_MS = 30_000;

describe("applyFilter seam", () => {
  it(
    "WebAudio branch (Node): low-pass attenuates a Nyquist square wave",
    { timeout: RENDER_TIMEOUT_MS },
    async () => {
      const out = await runLowPass();
      expect(out.length).toBe(2048);
      expect(tailRms(out)).toBeLessThan(0.05);
    }
  );

  it(
    "fallback branch: biquad path used when OfflineAudioContext is unavailable",
    { timeout: RENDER_TIMEOUT_MS },
    async () => {
      vi.doMock("@nodetool-ai/audio-nodes/lib/audio-context", () => ({
        loadOfflineAudioContext: async () => null
      }));
      const out = await runLowPass();
      expect(out.length).toBe(2048);
      expect(tailRms(out)).toBeLessThan(0.05);
    }
  );
});
