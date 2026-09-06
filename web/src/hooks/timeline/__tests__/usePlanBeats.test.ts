import { describe, it, expect, jest } from "@jest/globals";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import { applyBeatPlan, planBeats } from "../usePlanBeats";
import { VIDEO_FORMATS, videoFormatById } from "../../../components/setup/video/formats";

/**
 * PRD § 8.7 criterion 3: `Plan the beats` writes `setup.beats` and creates no
 * clip and no job. Both halves are asserted — the store's clips, and the RPCs
 * the planner issued, since a render job is a `generate_media` call and nothing
 * else on this path can start one.
 */

const AD_15 = videoFormatById("ad-15")!;

/** A screenplay the Director would answer with, in the wire shape. */
const screenplay = {
  type: "screenplay",
  title: "Paper boat",
  style_bible: "overcast, handheld",
  shots: [
    {
      slug: "kerb",
      action: "a paper boat at the kerb",
      camera: { framing: "wide", lens: "35mm" },
      motion: "slow push in",
      narration: "It was never going to last.",
      duration_seconds: 3
    },
    {
      slug: "drain",
      action: "the boat slips into the drain",
      camera: { framing: "close" },
      duration_seconds: 4
    }
  ]
};

describe("planBeats (criterion 3)", () => {
  it("creates no clip and starts no job", async () => {
    const store = createTimelineStore();
    const request = jest.fn(
      async (command: string, _data: Record<string, unknown>) => {
        void command;
        return { data: screenplay };
      }
    );

    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request
    });
    applyBeatPlan(store, beats);

    expect(beats).toHaveLength(2);
    expect(store.getState().clips).toEqual([]);
    // The only command it issues is text generation. `generate_media` is what
    // starts a render job, and it is never sent.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([command]) => command)).toEqual([
      "generate_text"
    ]);
  });

  it("stops at the review with the plan on the document", async () => {
    const store = createTimelineStore();
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    applyBeatPlan(store, beats);

    expect(store.getState().setup?.stage).toBe("review");
    expect(store.getState().setup?.beats).toHaveLength(2);
  });

  it("composes each beat's prompt the direct-clip way", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    // `shot-prompt`'s direct composition: action, framing, lens, motion, style.
    expect(beats[0].prompt).toBe(
      "a paper boat at the kerb, wide shot, 35mm lens, slow push in, overcast, handheld"
    );
  });

  it("takes each beat's length from the shot, and the format's when absent", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({
        data: {
          ...screenplay,
          shots: [screenplay.shots[0], { action: "no length given" }]
        }
      })
    });
    expect(beats[0].duration_ms).toBe(3000);
    expect(beats[1].duration_ms).toBe(
      Math.round(AD_15.durationMs / AD_15.beatCount)
    );
  });

  it("carries the narration as the voiceover, only where the format has the lane", async () => {
    const trailer = videoFormatById("trailer")!;
    const [voiced] = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({ data: screenplay })
    });
    const [scored] = await planBeats({
      brief: "a paper boat's last voyage",
      format: trailer,
      request: async () => ({ data: screenplay })
    });
    expect(voiced.voiceover).toBe("It was never going to last.");
    expect(scored.voiceover).toBeUndefined();
  });

  it("still answers an editable plan when the provider returns nothing usable", async () => {
    const beats = await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      request: async () => ({})
    });
    expect(beats.length).toBe(AD_15.beatCount);
  });

  it("refuses an empty brief without asking a provider", async () => {
    const request = jest.fn(async () => ({ data: screenplay }));
    await expect(
      planBeats({ brief: "   ", format: AD_15, request })
    ).rejects.toThrow(/before planning/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the edited plan back as context on a re-plan", async () => {
    const sentPrompts: string[] = [];
    const request = async (
      _command: string,
      data: Record<string, unknown>
    ) => {
      sentPrompts.push(String(data["prompt"]));
      return { data: screenplay };
    };
    await planBeats({
      brief: "a paper boat's last voyage",
      format: AD_15,
      previous: [
        { id: "b1", prompt: "the kerb, but at night", duration_ms: 3000 }
      ],
      request
    });
    expect(sentPrompts[0]).toContain("the kerb, but at night");
  });

  it("asks for every format's beat count", () => {
    for (const format of VIDEO_FORMATS) {
      expect(format.beatCount).toBeGreaterThan(0);
      expect(format.beatCount).toBeLessThanOrEqual(20);
    }
  });
});
