import { describe, it, expect, jest } from "@jest/globals";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { TimelineBeat } from "@nodetool-ai/timeline";
import { generateFromBeats } from "../useGenerateFromBeats";

/**
 * PRD § 8.7 criterion 5, on the four-beat fixture the criterion names: exactly
 * one video clip per beat, one voiceover clip per voiced beat, at most one
 * music clip, and the transitions the beats carry.
 */
const FOUR_BEATS: TimelineBeat[] = [
  { id: "b1", prompt: "the kerb", duration_ms: 3000, music: true },
  {
    id: "b2",
    prompt: "the hull",
    duration_ms: 4000,
    voiceover: "It was never going to last.",
    transition: "crossfade",
    music: true
  },
  { id: "b3", prompt: "the current", duration_ms: 4000, music: true },
  {
    id: "b4",
    prompt: "the drain",
    duration_ms: 4000,
    voiceover: "And then it was gone.",
    music: true
  }
];

const seeded = (beats: TimelineBeat[] = FOUR_BEATS) => {
  const store = createTimelineStore();
  store.getState().setSetup({
    stage: "look",
    brief: "a paper boat's last voyage",
    format: "ad-15",
    beats
  });
  return store;
};

const options = {
  provider: "nodetool",
  model: "nodetool/kling-turbo",
  voice: "alloy",
  voiceProvider: "nodetool",
  voiceModel: "nodetool/tts"
};

describe("generateFromBeats (criterion 5)", () => {
  it("cuts one video clip per beat, one voiceover per voiced beat, one bed", async () => {
    const store = seeded();
    const result = await generateFromBeats(store, options);

    expect(result.videoClipIds).toHaveLength(4);
    expect(result.voiceoverClipIds).toHaveLength(2);
    expect(result.musicClipId).not.toBeNull();

    const clips = store.getState().clips;
    expect(
      clips.filter((clip) => clip.bindingKind === "text-to-video")
    ).toHaveLength(4);
    expect(
      clips.filter(
        (clip) => clip.bindingKind === "text-to-audio" && clip.beatId
      )
    ).toHaveLength(2);
    expect(clips.filter((clip) => clip.name === "Music")).toHaveLength(1);
  });

  it("makes no music clip when no beat asks for one", async () => {
    const store = seeded(FOUR_BEATS.map((beat) => ({ ...beat, music: false })));
    const result = await generateFromBeats(store, options);
    expect(result.musicClipId).toBeNull();
    expect(store.getState().clips.some((clip) => clip.name === "Music")).toBe(
      false
    );
  });

  it("makes no voiceover clip when the voiceover switch is off", async () => {
    const store = seeded();
    const result = await generateFromBeats(store, {
      ...options,
      voiceover: false
    });
    expect(result.voiceoverClipIds).toEqual([]);
    // The lines stay in the plan — the switch is about this render, not about
    // throwing the creator's words away.
    expect(
      (store.getState().setup?.beats ?? []).filter((beat) => beat.voiceover)
    ).toHaveLength(2);
  });

  it("applies the transitions the beats carry, and no others", async () => {
    const store = seeded();
    await generateFromBeats(store, options);
    const video = store
      .getState()
      .clips.filter((clip) => clip.bindingKind === "text-to-video");
    expect(video.map((clip) => clip.transitionIn?.type)).toEqual([
      undefined,
      "crossfade",
      undefined,
      undefined
    ]);
  });

  it("lays the beats end to end in plan order", async () => {
    const store = seeded();
    await generateFromBeats(store, options);
    const video = store
      .getState()
      .clips.filter((clip) => clip.bindingKind === "text-to-video");
    expect(video.map((clip) => clip.startMs)).toEqual([0, 3000, 7000, 11000]);
    expect(video.map((clip) => clip.durationMs)).toEqual([3000, 4000, 4000, 4000]);
  });

  it("links every clip to its beat and every beat to its clip", async () => {
    const store = seeded();
    await generateFromBeats(store, options);
    const beats = store.getState().setup?.beats ?? [];
    expect(beats.map((beat) => beat.clip_id)).toEqual(
      store
        .getState()
        .clips.filter((clip) => clip.bindingKind === "text-to-video")
        .map((clip) => clip.id)
    );
    expect(
      store
        .getState()
        .clips.filter((clip) => clip.bindingKind === "text-to-video")
        .map((clip) => clip.beatId)
    ).toEqual(["b1", "b2", "b3", "b4"]);
  });

  it("writes the terminal stage before it enqueues anything", async () => {
    const store = seeded();
    const stagesWhenStarted: (string | undefined)[] = [];
    await generateFromBeats(store, {
      ...options,
      startJob: async (clipId) => {
        stagesWhenStarted.push(store.getState().setup?.stage);
        return clipId;
      }
    });
    expect(stagesWhenStarted).toHaveLength(6);
    expect(new Set(stagesWhenStarted)).toEqual(new Set(["done"]));
  });

  it("enqueues every video and voiceover clip, and reports which started", async () => {
    const store = seeded();
    const startJob = jest.fn(async (clipId: string) => clipId);
    const result = await generateFromBeats(store, { ...options, startJob });
    expect(startJob).toHaveBeenCalledTimes(6);
    expect(result.startedClipIds).toHaveLength(6);
  });

  it("does not let one refusal stop the rest of the batch", async () => {
    const store = seeded();
    let call = 0;
    const result = await generateFromBeats(store, {
      ...options,
      startJob: async (clipId) => {
        call += 1;
        if (call === 1) {
          throw new Error("provider refused");
        }
        return clipId;
      }
    });
    expect(result.startedClipIds).toHaveLength(5);
  });

  it("refuses to generate before there is a plan", async () => {
    const store = createTimelineStore();
    await expect(generateFromBeats(store, options)).rejects.toThrow(
      /Plan the beats/i
    );
  });
});
