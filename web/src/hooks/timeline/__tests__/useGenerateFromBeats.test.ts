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
  voiceModel: "nodetool/tts",
  // Named, because a bed is only cut when there is a model to render it with:
  // one created without a model was left out of the queue and finished as a
  // silent placeholder. Criterion 5 is about the shape of the cut, so the
  // fixture states the precondition rather than relying on it.
  musicProvider: "nodetool",
  musicModel: "nodetool/stable-audio"
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
    expect(video.map((clip) => clip.durationMs)).toEqual([
      3000, 4000, 4000, 4000
    ]);
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
    // Four video, two voiceover, one bed.
    expect(stagesWhenStarted).toHaveLength(7);
    expect(new Set(stagesWhenStarted)).toEqual(new Set(["done"]));
  });

  it("enqueues every clip it cut, bed included, and reports which started", async () => {
    const store = seeded();
    const startJob = jest.fn(async (clipId: string) => clipId);
    const result = await generateFromBeats(store, { ...options, startJob });
    // Four video, two voiceover, one bed. The bed was the one this used to
    // leave out: it was created and then filtered from the queue, so the cut
    // finished on a placeholder nothing would fill.
    expect(startJob).toHaveBeenCalledTimes(7);
    expect(result.startedClipIds).toHaveLength(7);
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
    expect(result.startedClipIds).toHaveLength(6);
  });

  it("refuses to generate before there is a plan", async () => {
    const store = createTimelineStore();
    await expect(generateFromBeats(store, options)).rejects.toThrow(
      /Plan the beats/i
    );
  });

  it("assigns take numbers before dispatch and forwards resolved reference ids", async () => {
    const store = seeded([
      {
        id: "b-production",
        prompt: "the product in use",
        duration_ms: 4_000,
        production: {
          schema_version: 1,
          speech_mode: "none",
          reference_bindings: [{ kind: "product", asset_id: "asset-product" }],
          requested_take_count: 3
        }
      }
    ]);
    const requests: Array<{
      clipId: string;
      requestId?: string;
      variationIndex?: number;
      referenceAssetIds?: readonly string[];
    }> = [];

    const result = await generateFromBeats(store, {
      ...options,
      music: false,
      productionBatchId: "batch-reviewed",
      startJob: async (clipId, production) => {
        requests.push({
          clipId,
          requestId: production?.identity.requestId,
          variationIndex: production?.identity.variationIndex,
          referenceAssetIds: production?.referenceAssetIds
        });
        return production?.identity.requestId ?? clipId;
      }
    });

    expect(result.videoClipIds).toHaveLength(1);
    expect(result.startedClipIds).toEqual(result.videoClipIds);
    expect(requests.map((request) => request.variationIndex)).toEqual([
      1, 2, 3
    ]);
    expect(requests.map((request) => request.requestId)).toEqual([
      `request:candidate:variation:batch-reviewed:timeline_clip:${result.videoClipIds[0]}:1`,
      `request:candidate:variation:batch-reviewed:timeline_clip:${result.videoClipIds[0]}:2`,
      `request:candidate:variation:batch-reviewed:timeline_clip:${result.videoClipIds[0]}:3`
    ]);
    expect(
      requests.every((request) =>
        request.referenceAssetIds?.includes("asset-product")
      )
    ).toBe(true);
  });

  it("rejects speech that does not fit before creating destinations", async () => {
    const store = seeded([
      {
        id: "b-too-long",
        prompt: "voiceover over a short shot",
        duration_ms: 2_000,
        production: {
          schema_version: 1,
          speech_mode: "off_camera",
          speech_binding: { audio_asset_id: "audio-long" },
          speech_duration_ms: 2_500,
          requested_take_count: 1
        }
      }
    ]);
    const startJob = jest.fn(async (clipId: string) => clipId);

    await expect(
      generateFromBeats(store, { ...options, startJob })
    ).rejects.toThrow(/speech duration/i);
    expect(store.getState().clips).toHaveLength(0);
    expect(startJob).not.toHaveBeenCalled();
  });
});

/**
 * The look step writes the sequence's dimensions when the creator changes the
 * aspect, and its cost estimate reads them back. The generated clips have to
 * read the same thing: a portrait timeline that sends 16:9 requests pays for
 * clips it then letterboxes, and the estimate quoted a different frame than
 * the one billed.
 */
describe("generateFromBeats stamps the sequence's aspect", () => {
  it("uses the ratio the sequence is cut at, not the format's original", async () => {
    const store = seeded();
    // "ad-15" is a 16:9 format; the creator switched the timeline to portrait.
    store.getState().setProjectSettings({ width: 1080, height: 1920 });

    await generateFromBeats(store, options);

    const video = store
      .getState()
      .clips.filter((clip) => clip.mediaType === "video");
    expect(video).toHaveLength(4);
    for (const clip of video) {
      expect(clip.aspectRatio).toBe("9:16");
    }
  });

  it("still stamps the format's ratio when the creator left it alone", async () => {
    const store = seeded();
    await generateFromBeats(store, options);

    const video = store
      .getState()
      .clips.filter((clip) => clip.mediaType === "video");
    expect(video.every((clip) => clip.aspectRatio === "16:9")).toBe(true);
  });
});

/**
 * With Music on, the bed is created and then has to be queued like any other
 * clip. It was created with no model and excluded from the queue, so the flow
 * finished on a silent placeholder that nothing would ever fill.
 */
describe("generateFromBeats queues the music bed", () => {
  it("starts the bed when a music model is supplied", async () => {
    const store = seeded();
    const startJob = jest.fn(async (clipId: string) => `req-${clipId}`);

    const result = await generateFromBeats(store, {
      ...options,
      music: true,
      startJob
    });

    expect(result.musicClipId).not.toBeNull();
    expect(result.startedClipIds).toContain(result.musicClipId);

    const bed = store
      .getState()
      .clips.find((clip) => clip.id === result.musicClipId);
    expect(bed?.model).toBe("nodetool/stable-audio");
    expect(bed?.provider).toBe("nodetool");
  });
});
