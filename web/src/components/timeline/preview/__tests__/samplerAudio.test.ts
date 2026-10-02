import { renderMidiClip } from "@nodetool-ai/timeline";
import type { SamplerMidiInstrument } from "@nodetool-ai/timeline";
import { getMidiClipBuffer, clearMidiRenderCache } from "../midiRender";
import { getSamplerAudio } from "../samplerAudio";

jest.mock("../../../../utils/resolveMediaUri", () => ({
  resolveMediaUri: jest.fn().mockResolvedValue("https://example.test/hit.wav")
}));
const assetId = "c".repeat(32);
const instrument: SamplerMidiInstrument = {
  type: "sampler",
  zones: [
    {
      id: "z",
      name: "Hit",
      assetId,
      rootNote: 60,
      lowNote: 36,
      highNote: 72,
      gainDb: 0
    }
  ],
  oneShot: true,
  attackMs: 0,
  releaseMs: 50,
  gainDb: -6
};
const data = Float32Array.from(
  { length: 1000 },
  (_, i) => 0.3 * Math.sin(i * 0.05)
);
function context() {
  return {
    sampleRate: 1000,
    decodeAudioData: jest
      .fn()
      .mockResolvedValue({
        sampleRate: 1000,
        duration: 1,
        length: 1000,
        numberOfChannels: 1,
        getChannelData: () => data
      }),
    createBuffer: (_channels: number, length: number) => {
      const out = new Float32Array(length);
      return { length, getChannelData: () => out };
    }
  };
}
const originalFetch = globalThis.fetch;
beforeEach(() => {
  clearMidiRenderCache();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
it("loads and decodes once across preview renders, including a changed mapping", async () => {
  const ctx = context();
  const clip = {
    durationMs: 1200,
    notes: [
      { id: "n", pitch: 60, velocity: 127, startTick: 0, durationTick: 96 }
    ]
  };
  const first = await getMidiClipBuffer(
    ctx as unknown as BaseAudioContext,
    clip,
    120,
    instrument
  );
  const second = await getMidiClipBuffer(
    ctx as unknown as BaseAudioContext,
    clip,
    120,
    { ...instrument, oneShot: false }
  );
  expect(
    first
      .getChannelData(0)
      .slice(200, 900)
      .some((x) => Math.abs(x) > 0.01)
  ).toBe(true);
  expect(
    second
      .getChannelData(0)
      .slice(200)
      .every((x) => x === 0)
  ).toBe(true);
  expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
});
it("surfaces a failed fetch and retries the next request", async () => {
  const ctx = context();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    });
  await expect(
    getSamplerAudio(ctx as unknown as BaseAudioContext, instrument)
  ).rejects.toThrow("404");
  await expect(
    getSamplerAudio(ctx as unknown as BaseAudioContext, instrument)
  ).resolves.toHaveProperty(assetId);
});

it("passes decoded recordings to the worker and matches inline sample playback", async () => {
  const host = globalThis as unknown as { Worker?: unknown };
  const originalWorker = host.Worker;
  host.Worker = class {};
  try {
    const ctx = context();
    const clip = {
      durationMs: 1200,
      notes: [
        { id: "n", pitch: 60, velocity: 100, startTick: 0, durationTick: 96 }
      ]
    };
    const buffer = await getMidiClipBuffer(
      ctx as unknown as BaseAudioContext,
      clip,
      120,
      instrument
    );
    const expected = renderMidiClip({
      clip,
      bpm: 120,
      instrument,
      sampleRate: 1000,
      samples: { [assetId]: { sampleRate: 1000, samples: data } }
    });
    expect(Array.from(buffer.getChannelData(0))).toEqual(Array.from(expected));
  } finally {
    if (originalWorker === undefined) delete host.Worker;
    else host.Worker = originalWorker;
  }
});

it("averages stereo channels instead of boosting their combined level", async () => {
  const ctx = context();
  ctx.decodeAudioData.mockResolvedValue({ sampleRate: 1000, duration: .1, length: 100, numberOfChannels: 2,
    getChannelData: (channel: number) => new Float32Array(100).fill(channel === 0 ? .4 : .2) });
  const loaded = await getSamplerAudio(ctx as unknown as BaseAudioContext, instrument);
  expect(loaded[assetId].samples[20]).toBeCloseTo(.3, 6);
});
