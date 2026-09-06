import { describe, expect, it } from "vitest";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

/**
 * The § 8.6 tools, headlessly — criterion 7 says every criterion of the video
 * flow also passes through them, so the counts of criterion 5 and the
 * "no clip, no job" of criterion 3 are asserted on this surface too.
 */
const FOUR_BEATS = [
  { prompt: "wide of a paper boat at the kerb", durationMs: 3000 },
  {
    prompt: "macro of the hull taking on water",
    durationMs: 4000,
    voiceover: "It was never going to last.",
    transition: "crossfade"
  },
  { prompt: "the boat turning in the current", durationMs: 4000, music: true },
  {
    prompt: "it slips into the drain, gone",
    durationMs: 4000,
    voiceover: "And then it was gone."
  }
];

const bridgeWith = () => {
  const bridge = createTimelineToolBridge();
  const tool = (name: string) => {
    const found = bridge.tools.find((candidate) => candidate.name === name);
    if (!found) {
      throw new Error(`${name} is not registered`);
    }
    return found;
  };
  return { bridge, tool };
};

describe("guided video flow, headless", () => {
  it("plans beats without creating a clip or starting a job", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_set_setup").execute({
      brief: "a paper boat's last voyage",
      format: "ad-15"
    });
    const result = (await tool("ui_timeline_plan_beats").execute({
      beats: FOUR_BEATS
    })) as { beats: unknown[]; clipsCreated: number; jobsStarted: number };

    expect(result.beats).toHaveLength(4);
    expect(result.clipsCreated).toBe(0);
    expect(result.jobsStarted).toBe(0);
    const state = bridge.finalState();
    expect(state.clips).toHaveLength(0);
    expect(state.setup?.stage).toBe("review");
  });

  it("edits round-trip to the plan", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_plan_beats").execute({ beats: FOUR_BEATS });
    await tool("ui_timeline_update_beat").execute({
      beat: "1",
      prompt: "wide of a paper boat in the gutter",
      durationMs: 2000
    });
    const beats = bridge.finalState().setup?.beats ?? [];
    expect(beats[0].prompt).toBe("wide of a paper boat in the gutter");
    expect(beats[0].duration_ms).toBe(2000);
  });

  it("clears a transition when the edit passes null", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_plan_beats").execute({ beats: FOUR_BEATS });
    await tool("ui_timeline_update_beat").execute({
      beat: "2",
      transition: null
    });
    const beats = bridge.finalState().setup?.beats ?? [];
    expect(beats[1].transition).toBeUndefined();
  });

  it("cuts one video clip per beat, one voiceover per voiced beat, one bed", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_set_setup").execute({
      brief: "a paper boat's last voyage"
    });
    await tool("ui_timeline_plan_beats").execute({ beats: FOUR_BEATS });
    await tool("ui_timeline_generate_from_beats").execute({
      model: "nodetool/kling-turbo",
      provider: "nodetool",
      voice: "alloy"
    });

    const state = bridge.finalState();
    const video = state.documentClips.filter(
      (clip) => clip.bindingKind === "text-to-video"
    );
    const voiceover = state.documentClips.filter(
      (clip) => clip.bindingKind === "text-to-audio" && clip.beatId
    );
    const music = state.documentClips.filter((clip) => clip.name === "Music");

    expect(video).toHaveLength(4);
    expect(voiceover).toHaveLength(2);
    expect(music).toHaveLength(1);
    expect(state.setup?.stage).toBe("done");
    // Every clip names the beat it came from, and every beat names its clip.
    expect(video.map((clip) => clip.beatId)).toEqual(
      (state.setup?.beats ?? []).map((beat) => beat.id)
    );
    expect(
      (state.setup?.beats ?? []).every((beat) => beat.clip_id !== undefined)
    ).toBe(true);
  });

  it("applies the transitions the beats carry, and no others", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_plan_beats").execute({ beats: FOUR_BEATS });
    await tool("ui_timeline_generate_from_beats").execute({
      model: "nodetool/kling-turbo"
    });
    const video = bridge
      .finalState()
      .documentClips.filter((clip) => clip.bindingKind === "text-to-video");
    expect(video.map((clip) => clip.transitionIn?.type)).toEqual([
      undefined,
      "crossfade",
      undefined,
      undefined
    ]);
  });

  it("lays the beats end to end in plan order", async () => {
    const { bridge, tool } = bridgeWith();
    await tool("ui_timeline_plan_beats").execute({ beats: FOUR_BEATS });
    await tool("ui_timeline_generate_from_beats").execute({});
    const video = bridge
      .finalState()
      .documentClips.filter((clip) => clip.bindingKind === "text-to-video");
    expect(video.map((clip) => clip.startMs)).toEqual([0, 3000, 7000, 11000]);
  });

  it("refuses to generate before there is a plan", async () => {
    const { tool } = bridgeWith();
    await expect(
      tool("ui_timeline_generate_from_beats").execute({})
    ).rejects.toThrow(/no beat plan/i);
  });

  it("says which half of the contract it implements when asked to draft", async () => {
    const { tool } = bridgeWith();
    await expect(tool("ui_timeline_plan_beats").execute({})).rejects.toThrow(
      /no Director/i
    );
  });
});
