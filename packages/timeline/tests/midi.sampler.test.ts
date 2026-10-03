import { describe, expect, it, vi } from "vitest";
import { midiInstrument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  renderInstrumentEvents,
  renderMidiClip,
  renderAuditionNote
} from "../src/midi/voice.js";
import {
  loadSamplerSamples,
  type SamplerSamples
} from "../src/midi/sampler.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import type { SamplerMidiInstrument } from "../src/types.js";

const assetId = "a".repeat(32);
const instrument: SamplerMidiInstrument = {
  type: "sampler",
  oneShot: true,
  attackMs: 0,
  releaseMs: 50,
  gainDb: -6,
  zones: [
    {
      id: "zone",
      name: "Hit",
      assetId,
      rootNote: 60,
      lowNote: 48,
      highNote: 72,
      gainDb: 0
    }
  ]
};
const samples: SamplerSamples = {
  [assetId]: {
    sampleRate: 1000,
    samples: Float32Array.from(
      { length: 1000 },
      (_, i) => 0.4 * Math.sin((2 * Math.PI * 10 * i) / 1000)
    )
  }
};
const event = { pitch: 60, velocity: 127, startFrame: 0, gateOffFrame: 100 };
const render = (voice = instrument, pitch = 60, velocity = 127) =>
  renderInstrumentEvents(
    [{ ...event, pitch, velocity }],
    1200,
    voice,
    1000,
    samples
  );
const energy = (buffer: Float32Array) =>
  buffer.reduce((sum, x) => sum + x * x, 0);

describe("sample instrument", () => {
  it("plays recorded PCM after note-off in one-shot mode and releases gated notes", () => {
    const oneShot = render();
    const gated = render({ ...instrument, oneShot: false });
    expect(energy(oneShot.slice(200, 900))).toBeGreaterThan(1);
    expect(energy(gated.slice(151))).toBe(0);
    expect(energy(oneShot.slice(1000))).toBe(0);
    expect(oneShot.every(Number.isFinite)).toBe(true);
  });
  it("transposes an octave at double playback speed and respects source sample rate", () => {
    const root = render(),
      octave = render(instrument, 72);
    for (let i = 1; i < 450; i++) expect(octave[i]).toBeCloseTo(root[i * 2], 6);
    expect(energy(octave.slice(501))).toBe(0);
    const resampled = renderInstrumentEvents(
      [event],
      2400,
      instrument,
      2000,
      samples
    );
    expect(resampled[50]).toBeCloseTo(root[25], 6);
  });
  it("maps ranges, layers overlapping zones and responds to velocity and gain", () => {
    expect(energy(render(instrument, 36))).toBe(0);
    expect(energy(render(instrument, 60, 50))).toBeLessThan(energy(render()));
    expect(
      energy(
        render({
          ...instrument,
          zones: [...instrument.zones, { ...instrument.zones[0], id: "layer" }]
        })
      )
    ).toBeGreaterThan(energy(render()));
    expect(energy(render({ ...instrument, gainDb: -20 }))).toBeLessThan(
      energy(render())
    );
  });
  it("fades in and bounds a phrase to its clip window", () => {
    const attack = render({ ...instrument, attackMs: 100 });
    expect(Math.abs(attack[25])).toBeLessThan(Math.abs(render()[25]));
    const clip = renderMidiClip({
      clip: {
        durationMs: 400,
        notes: [
          { id: "n", pitch: 60, velocity: 127, startTick: 0, durationTick: 100 }
        ]
      },
      bpm: 120,
      instrument,
      sampleRate: 1000,
      samples
    });
    expect(clip).toHaveLength(400);
    expect(Math.abs(clip[399])).toBeLessThan(0.01);
    const audition = renderAuditionNote({
      pitch: 60,
      velocity: 127,
      durationMs: 100,
      instrument,
      sampleRate: 1000,
      samples
    });
    expect(energy(audition.slice(200, 900))).toBeGreaterThan(1);
  });
  it("loads recordings once and fails clearly when missing", async () => {
    const load = vi.fn().mockResolvedValue(samples[assetId]);
    await loadSamplerSamples(
      { ...instrument, zones: [instrument.zones[0], instrument.zones[0]] },
      load
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(() =>
      renderInstrumentEvents([event], 1000, instrument, 1000)
    ).toThrow("Sample unavailable");
    await expect(
      loadSamplerSamples(instrument, async () => ({
        samples: new Float32Array(),
        sampleRate: 1000
      }))
    ).rejects.toThrow("no usable audio");
  });
  it("preserves sample mappings through JSON/schema storage and invalidates edited renders", () => {
    expect(
      midiInstrument.parse(JSON.parse(JSON.stringify(instrument)))
    ).toEqual(instrument);
    expect(
      midiInstrument.safeParse({
        ...instrument,
        zones: [{ ...instrument.zones[0], lowNote: 72, highNote: 48 }]
      }).success
    ).toBe(false);
    expect(
      midiInstrument.safeParse({
        ...instrument,
        zones: [{ ...instrument.zones[0], assetId: "../../other" }]
      }).success
    ).toBe(false);
    const input = {
      clip: { durationMs: 1000 },
      bpm: 120,
      sampleRate: 1000,
      instrument
    };
    expect(midiRenderKey(input)).not.toBe(
      midiRenderKey({ ...input, instrument: { ...instrument, oneShot: false } })
    );
    expect(midiRenderKey(input)).not.toBe(
      midiRenderKey({
        ...input,
        instrument: {
          ...instrument,
          zones: [{ ...instrument.zones[0], assetId: "b".repeat(32) }]
        }
      })
    );
  });
});
