/**
 * Game slot audio: SoundEffect and MusicLoop produce fills that pass the
 * protocol's checkSlotFill for the platformer fixture, and MusicLoop's
 * crossfade closes the loop seam.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkSlotFill,
  gameAssetManifest,
  SLOT_METADATA_KEY,
  type GameSlotSpec
} from "@nodetool-ai/protocol";
import {
  MusicLoopNode,
  SoundEffectNode,
  encodeWav,
  parseWavBytes,
  toBytes
} from "@nodetool-ai/audio-nodes";

const SAMPLE_RATE = 8000;

const manifest = gameAssetManifest.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../protocol/fixtures/game-assets/platformer.manifest.json",
        import.meta.url
      ),
      "utf8"
    )
  )
);

function slot(id: string): GameSlotSpec {
  const spec = manifest.slots.find((s) => s.id === id);
  if (!spec) throw new Error(`fixture has no slot ${id}`);
  return spec;
}

/** Mono sine burst. `phaseJump` adds a DC step half way so the loop seam is discontinuous. */
function sineRef(seconds: number, hz = 440, dcJump = 0) {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) + (i > frames / 2 ? dcJump : 0);
  }
  return { type: "audio", uri: "", data: encodeWav(samples, SAMPLE_RATE, 1) };
}

function outSamples(ref: { data?: unknown }): Float32Array {
  const wav = parseWavBytes(toBytes(ref.data as Uint8Array | string));
  if (!wav) throw new Error("expected WAV output");
  return wav.samples;
}

/** Mean |x[i] - x[i-1]| across the seam when the clip wraps around. */
function seamDiscontinuity(s: Float32Array, span = 4): number {
  let total = 0;
  for (let k = -span; k < span; k++) {
    const a = s[(s.length + k) % s.length];
    const b = s[(s.length + k + 1) % s.length];
    total += Math.abs(b - a);
  }
  return total / (2 * span);
}

describe("SoundEffect", () => {
  it("fills sfx.jump from an overlong clip and passes checkSlotFill", async () => {
    const spec = slot("sfx.jump");
    const { output, fill } = await new SoundEffectNode({
      audio: sineRef(2),
      slot_id: spec.id,
      seconds: spec.seconds
    }).process();
    expect(checkSlotFill(spec, fill)).toEqual([]);
    expect(fill.seconds).toBeCloseTo(0.4, 3);
    expect(output.metadata?.[SLOT_METADATA_KEY]).toEqual(fill);
    const s = outSamples(output);
    expect(s.length).toBe(Math.round(0.4 * SAMPLE_RATE));
    expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
  });

  it("with trim off, an overlong clip produces a fill checkSlotFill rejects", async () => {
    const spec = slot("sfx.jump");
    const { fill } = await new SoundEffectNode({
      audio: sineRef(2),
      slot_id: spec.id,
      seconds: spec.seconds,
      trim: false
    }).process();
    expect(fill.seconds).toBeCloseTo(2, 3);
    expect(checkSlotFill(spec, fill)).toHaveLength(1);
  });

  it("rejects a slot id the schema does not accept", async () => {
    await expect(
      new SoundEffectNode({ audio: sineRef(1), slot_id: "Bad Id", seconds: 1 }).process()
    ).rejects.toThrow();
  });
});

describe("MusicLoop", () => {
  it("fills music.level to the target length, loop: true, passes checkSlotFill", async () => {
    const spec = slot("music.level");
    const { output, fill } = await new MusicLoopNode({
      audio: sineRef(70),
      slot_id: spec.id,
      seconds: spec.seconds
    }).process();
    expect(fill.loop).toBe(true);
    expect(fill.seconds).toBeCloseTo(60, 2);
    expect(checkSlotFill(spec, fill)).toEqual([]);
    expect(output.metadata?.[SLOT_METADATA_KEY]).toEqual(fill);
  });

  it("crossfade closes the seam the raw input fails", async () => {
    const input = sineRef(4, 100, 0.6);
    const before = seamDiscontinuity(outSamples(input));
    const { output } = await new MusicLoopNode({
      audio: input,
      slot_id: "music.level",
      seconds: 4,
      trim: false,
      crossfade_ms: 250
    }).process();
    const after = seamDiscontinuity(outSamples(output));
    const threshold = 0.05;
    expect(before).toBeGreaterThan(threshold);
    expect(after).toBeLessThan(threshold);
  });
});
