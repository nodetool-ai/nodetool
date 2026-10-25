import { AUDIO_EFFECT_SPECS } from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { makeAudioSample, type AudioSample } from "../audioSample";
import {
  AUDIO_EFFECTS,
  EFFECT_GROUPS,
  applyEffect,
  defaultEffectParams,
  echoTailSeconds,
  getAudioEffect,
  renderEffectPreview,
  type AudioEffect
} from "../audioEffects";

const makeSample = (channels: number[][], sampleRate = 4): AudioSample =>
  makeAudioSample(
    sampleRate,
    channels.map((c) => Float32Array.from(c))
  );

const values = (sample: AudioSample, channel = 0): number[] =>
  Array.from(sample.channels[channel]);

/** A stand-in effect whose output shape the test controls. */
const fakeEffect = (
  process: (input: AudioSample) => AudioSample,
  changesLength = false
): AudioEffect => ({
  id: "fake",
  label: "Fake",
  group: "Tone",
  description: "",
  params: [],
  changesLength,
  process: (input) => Promise.resolve(process(input))
});

describe("effect catalogue", () => {
  it("has unique ids, known groups, and defaults inside each range", () => {
    const ids = AUDIO_EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of AUDIO_EFFECTS) {
      expect(EFFECT_GROUPS).toContain(effect.group);
      for (const p of effect.params) {
        expect(p.defaultValue).toBeGreaterThanOrEqual(p.min);
        expect(p.defaultValue).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it("builds default params from the specs", () => {
    const echo = getAudioEffect("echo");
    expect(echo && defaultEffectParams(echo)).toEqual({
      delayMs: 350,
      feedback: 40,
      mix: 35
    });
  });
});

describe("applyEffect", () => {
  it("processes only the selected range", async () => {
    const sample = makeSample([[1, 1, 1, 1, 1, 1, 1, 1]]);
    const out = await applyEffect(
      sample,
      getAudioEffect("invert") as AudioEffect,
      {},
      0.5,
      1.5
    );
    expect(values(out)).toEqual([1, 1, -1, -1, -1, -1, 1, 1]);
  });

  it("processes the whole sample when there is no selection", async () => {
    const sample = makeSample([[1, -1]]);
    const out = await applyEffect(sample, getAudioEffect("invert") as AudioEffect, {});
    expect(values(out)).toEqual([-1, 1]);
  });

  it("mixes a tail onto the audio after the range and extends past the end", async () => {
    const sample = makeSample([[1, 1, 1, 1]]);
    // Output is the range doubled plus a two-frame tail of 0.5.
    const withTail = fakeEffect((input) =>
      makeSample([[...Array.from(input.channels[0], (v) => v * 2), 0.5, 0.5]])
    );
    const middle = await applyEffect(sample, withTail, {}, 0, 0.5);
    expect(values(middle)).toEqual([2, 2, 1.5, 1.5]);
    const end = await applyEffect(sample, withTail, {}, 0.5, 1);
    expect(values(end)).toEqual([1, 1, 2, 2, 0.5, 0.5]);
  });

  it("splices output of a different length for speed changes", async () => {
    const sample = makeSample([[1, 2, 3, 4, 5, 6]], 6);
    const halve = fakeEffect(
      (input) =>
        makeSample(
          [Array.from(input.channels[0]).filter((_, i) => i % 2 === 0)],
          6
        ),
      true
    );
    const out = await applyEffect(sample, halve, {}, 1 / 6, 5 / 6);
    expect(values(out)).toEqual([1, 2, 4, 6]);
  });

  it("returns the input for an empty range", async () => {
    const sample = makeSample([[1, 2]]);
    const out = await applyEffect(sample, getAudioEffect("invert") as AudioEffect, {}, 0.1, 0.1);
    expect(out).toBe(sample);
  });

  it("applies a mono effect output to every channel", async () => {
    const sample = makeSample([
      [1, 1],
      [2, 2]
    ]);
    const mono = fakeEffect(() => makeSample([[0, 0]]));
    const out = await applyEffect(sample, mono, {});
    expect(values(out, 1)).toEqual([0, 0]);
  });
});

describe("renderEffectPreview", () => {
  it("caps the preview length", async () => {
    const sample = makeAudioSample(10, [new Float32Array(10 * 60)]);
    const preview = await renderEffectPreview(
      sample,
      getAudioEffect("invert") as AudioEffect,
      {}
    );
    expect(preview?.channels[0].length).toBe(10 * 15);
  });
});

describe("echoTailSeconds", () => {
  it("lasts until the repeats fall 60 dB", () => {
    // 0.5 feedback needs ~10 repeats to reach -60 dB.
    expect(echoTailSeconds(0.1, 0.5)).toBeCloseTo(0.1 * (Math.log(0.001) / Math.log(0.5) + 1));
  });

  it("is one delay without feedback and is capped", () => {
    expect(echoTailSeconds(0.3, 0)).toBe(0.3);
    expect(echoTailSeconds(2, 0.9)).toBe(20);
  });
});

describe("AUDIO_EFFECTS and the shared effect catalog", () => {
  // The agent tools validate against AUDIO_EFFECT_SPECS in both hosts, so an
  // effect or parameter the editor renders differently would be refused or
  // mis-ranged there.
  it("declares exactly the shared specs", () => {
    const declared = AUDIO_EFFECTS.map(({ process: _process, ...spec }) => spec);
    expect(declared).toEqual(AUDIO_EFFECT_SPECS);
  });
});
