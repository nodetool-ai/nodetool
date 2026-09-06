import { describe, expect, it } from "@jest/globals";
import type { TimelineBeat } from "@nodetool-ai/timeline";
import { STUDIO_CLIP_MODELS } from "../../../studio/curatedModels";
import { plannedClipFields, summarizeBeatPlanCost } from "../useBeatPlanCostEstimate";

/**
 * PRD § 8.3: the cost line beside `Generate` prices the click that has not
 * happened yet, and says so plainly when no catalog figure covers it.
 */
const BEATS: TimelineBeat[] = [
  { id: "b1", prompt: "the kerb", duration_ms: 3000 },
  { id: "b2", prompt: "the hull", duration_ms: 4000, voiceover: "Gone." }
];

const inputs = {
  aspectRatio: "16:9",
  videoProvider: "nodetool",
  videoModel: STUDIO_CLIP_MODELS[0].id,
  voiceProvider: "nodetool",
  voiceModel: "nodetool/tts",
  voiced: true
};

describe("beat plan cost", () => {
  it("prices one clip per beat plus one per voiced beat", () => {
    const planned = plannedClipFields(BEATS, inputs);
    expect(planned).toHaveLength(3);
    expect(
      planned.filter((clip) => clip.bindingKind === "text-to-video")
    ).toHaveLength(2);
    expect(
      planned.filter((clip) => clip.bindingKind === "text-to-audio")
    ).toHaveLength(1);
  });

  it("plans no voiceover clip when the voice is off", () => {
    const planned = plannedClipFields(BEATS, { ...inputs, voiced: false });
    expect(planned).toHaveLength(2);
  });

  it("prices video by the length the beat occupies", () => {
    const short = summarizeBeatPlanCost(
      [{ id: "b", prompt: "x", duration_ms: 2000 }],
      inputs
    );
    const long = summarizeBeatPlanCost(
      [{ id: "b", prompt: "x", duration_ms: 8000 }],
      inputs
    );
    expect(short?.pricedCount).toBe(1);
    expect(long?.pricedCount).toBe(1);
    expect(long?.total ?? 0).toBeGreaterThan(short?.total ?? 0);
  });

  it("answers null when no figure covers the plan", () => {
    expect(
      summarizeBeatPlanCost(BEATS, {
        ...inputs,
        videoModel: "totally-not-a-real-model-xyz",
        voiceModel: "totally-not-a-real-voice-xyz"
      })
    ).toBeNull();
  });

  it("answers null on an empty plan", () => {
    expect(summarizeBeatPlanCost([], inputs)).toBeNull();
  });
});
