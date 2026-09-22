import { describe, expect, it } from "@jest/globals";
import { productionRequirement } from "@nodetool-ai/protocol";
import type { TimelineBeat } from "@nodetool-ai/timeline";
import { STUDIO_CLIP_MODELS } from "../../../studio/curatedModels";
import {
  plannedClipFields,
  summarizeBeatPlanCost
} from "../useBeatPlanCostEstimate";

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

  it("prices every compiled take and exposes destination and request counts", () => {
    const beats: TimelineBeat[] = [
      {
        id: "b1",
        prompt: "the kerb",
        duration_ms: 3000,
        production: productionRequirement.parse({ requested_take_count: 3 })
      },
      {
        id: "b2",
        prompt: "the hull",
        duration_ms: 4000,
        production: productionRequirement.parse({ requested_take_count: 3 })
      }
    ];

    const planned = plannedClipFields(beats, { ...inputs, voiced: false });
    const estimate = summarizeBeatPlanCost(beats, {
      ...inputs,
      voiced: false
    });

    expect(planned).toHaveLength(6);
    expect(estimate).toMatchObject({
      destinationCount: 2,
      videoRequestCount: 6,
      voiceRequestCount: 0,
      pricedCount: 6,
      unpricedCount: 0
    });
  });

  it("keeps the known subtotal and counts an unpriced voice request", () => {
    const estimate = summarizeBeatPlanCost(BEATS, {
      ...inputs,
      voiceModel: "totally-not-a-real-voice-xyz"
    });

    expect(estimate).toMatchObject({
      destinationCount: 2,
      videoRequestCount: 2,
      voiceRequestCount: 1,
      pricedCount: 2,
      unpricedCount: 1
    });
    expect(estimate?.total ?? 0).toBeGreaterThan(0);
  });

  it("does not price replacement video for imported source footage", () => {
    const estimate = summarizeBeatPlanCost(
      [
        {
          id: "b-source",
          prompt: "trim the supplied shot",
          duration_ms: 4000,
          source_clip_id: "source-clip",
          voiceover: "Use the footage the creator supplied."
        }
      ],
      inputs
    );

    expect(estimate).toMatchObject({
      destinationCount: 1,
      videoRequestCount: 0,
      voiceRequestCount: 1
    });
  });

  it("reports a zero-request commitment for a source-only edit", () => {
    const estimate = summarizeBeatPlanCost(
      [
        {
          id: "b-source",
          prompt: "trim the supplied shot",
          duration_ms: 4000,
          source_clip_id: "source-clip"
        }
      ],
      { ...inputs, voiced: false }
    );

    expect(estimate).toMatchObject({
      total: 0,
      destinationCount: 1,
      videoRequestCount: 0,
      voiceRequestCount: 0,
      pricedCount: 0,
      unpricedCount: 0
    });
  });

  it("tolerates incomplete review fields instead of throwing during render", () => {
    expect(() =>
      plannedClipFields(
        [
          {
            id: "b-editing",
            prompt: "",
            duration_ms: 0
          }
        ],
        inputs
      )
    ).not.toThrow();
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

  it("retains request counts when no figure covers the plan", () => {
    expect(
      summarizeBeatPlanCost(BEATS, {
        ...inputs,
        videoModel: "totally-not-a-real-model-xyz",
        voiceModel: "totally-not-a-real-voice-xyz"
      })
    ).toMatchObject({
      destinationCount: 2,
      videoRequestCount: 2,
      voiceRequestCount: 1,
      pricedCount: 0,
      unpricedCount: 3
    });
  });

  it("answers null on an empty plan", () => {
    expect(summarizeBeatPlanCost([], inputs)).toBeNull();
  });
});
