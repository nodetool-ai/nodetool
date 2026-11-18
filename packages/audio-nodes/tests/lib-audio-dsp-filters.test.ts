/**
 * The batch filter nodes run the Web Audio biquad design of the kernel
 * library. They must give the samples that node-web-audio-api's
 * OfflineAudioContext gave before they moved, and need no WebAudio.
 */
import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import type { BiquadType } from "@nodetool-ai/kernels";

const SAMPLE_RATE = 44100;
const FRAMES = 22050;

function sweep(): Float32Array {
  return new Float32Array(FRAMES).map(
    (_, i) => Math.sin(i * i * 4e-6) * 0.8 + Math.sin(i * 0.3) * 0.1
  );
}



async function viaNode(type: BiquadType, frequency: number, q: number | undefined, gainDb: number): Promise<Float32Array> {
  const { applyFilter } = await import("@nodetool-ai/audio-nodes/nodes/lib-audio-dsp");
  const { parseWavBytes } = await import("@nodetool-ai/audio-nodes");
  const ref = await applyFilter(
    { samples: sweep(), sampleRate: SAMPLE_RATE, numChannels: 1 },
    { type, frequency, q, gainDb }
  );
  const binary = atob(String(ref.data));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const wav = parseWavBytes(bytes);
  if (!wav) throw new Error("expected WAV output");
  return wav.samples;
}

/** The OfflineAudioContext render, quantized to PCM16 as the node's WAV is. */
async function viaWebAudio(type: BiquadType, frequency: number, q: number | undefined, gainDb: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, FRAMES, SAMPLE_RATE);
  const buffer = ctx.createBuffer(1, FRAMES, SAMPLE_RATE);
  buffer.getChannelData(0).set(sweep());
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  if (q !== undefined) filter.Q.value = q;
  filter.gain.value = gainDb;
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();
  const rendered = (await ctx.startRendering()).getChannelData(0);
  // `+ 0` turns the -0 of a small negative sample into the 0 that PCM16 holds.
  return rendered.map((s) => Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff) / 0x7fff + 0);
}

// node-web-audio-api's render can exceed the 5 s default when the whole
// workspace's suites run in parallel.
const RENDER_TIMEOUT_MS = 30_000;

const CASES: [BiquadType, number, number | undefined, number][] = [
  ["lowpass", 1000, undefined, 0],
  ["highpass", 200, undefined, 0],
  ["lowshelf", 200, undefined, 6],
  ["highshelf", 3000, undefined, -6],
  ["peaking", 1000, 2, 5]
];

describe("applyFilter", () => {
  for (const [type, frequency, q, gainDb] of CASES) {
    it(
      `${type} gives the samples of OfflineAudioContext`,
      { timeout: RENDER_TIMEOUT_MS },
      async () => {
        expect(await viaNode(type, frequency, q, gainDb)).toEqual(
          await viaWebAudio(type, frequency, q, gainDb)
        );
      }
    );
  }

});
