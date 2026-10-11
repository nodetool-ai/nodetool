import { wordEnvelope } from "../ScriptTakeWaveform";
import type { ScriptTake } from "../../../stores/script/ScriptStore";

const take = (words: ScriptTake["words"], durationMs = 1000): ScriptTake => ({
  id: "t",
  assetId: "a",
  durationMs,
  words,
  textSnapshot: "",
  voiceSnapshot: null,
  createdAt: new Date(0).toISOString()
});

describe("wordEnvelope", () => {
  it("swells over spoken words and rests at the floor between them", () => {
    const bars = wordEnvelope(
      take([
        { word: "a", startMs: 0, endMs: 400 },
        { word: "b", startMs: 600, endMs: 1000 }
      ]),
      10
    );

    // The middle of each word is loudest; the 400–600 ms gap is silent.
    expect(bars[2]).toBeGreaterThan(bars[0]);
    expect(bars[2]).toBeGreaterThan(0.9);
    expect(bars[5]).toBeCloseTo(0.12);
    expect(bars[7]).toBeGreaterThan(0.9);
  });

  it("is flat for a take with no word timings or no length", () => {
    expect(new Set(wordEnvelope(take([]), 8))).toEqual(new Set([0.12]));
    expect(
      new Set(wordEnvelope(take([{ word: "a", startMs: 0, endMs: 5 }], 0), 4))
    ).toEqual(new Set([0.12]));
  });
});
