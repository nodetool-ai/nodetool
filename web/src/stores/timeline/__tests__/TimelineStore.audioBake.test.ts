/**
 * `bakeAudioAnimation` — the store's side of "Animate from audio".
 *
 * The bake runs on the server against the STORED document, so the action has
 * three jobs and each is asserted here: persist the open document first, post
 * the settings, and take back what the server wrote as ONE undo entry (a bake
 * the user can undo in one keystroke, not two hundred keyframes' worth).
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import {
  mockTimelineGet,
  trpcClient
} from "../../../__mocks__/trpcClientMock";
import { bakeAudioAnimation } from "../../../utils/timelineAudioBake";
import type { BakeAudioAnimationBody } from "../../../utils/timelineAudioBake";

jest.mock("../../../utils/timelineAudioBake", () => ({
  bakeAudioAnimation: jest.fn()
}));

const postBake = bakeAudioAnimation as jest.MockedFunction<
  typeof bakeAudioAnimation
>;
// The shared mock declares a narrower resolved value than this test needs.
const updateMutate = trpcClient.timeline.update.mutate as unknown as jest.Mock<
  (input: unknown) => Promise<{ updatedAt: string }>
>;

const SEQUENCE_ID = "tl-1";
const BODY: BakeAudioAnimationBody = {
  audio_clip_id: "audio-1",
  target_clip_id: "target-1",
  property: "scale",
  output_range: [1, 1.15],
  mode: "envelope",
  sensitivity: 1,
  attack_ms: 20,
  release_ms: 150,
  offset_ms: 0
};

const BAKED_ANIMATION = {
  id: "anim-1",
  role: "emphasis" as const,
  preset: "custom",
  durationMs: 2000,
  custom: {
    timeBase: "source" as const,
    curves: [
      {
        property: "scale" as const,
        keyframes: [
          { t: 0, sourceMs: 0, value: 1 },
          { t: 1, sourceMs: 2000, value: 1.15 }
        ]
      }
    ],
    bakedFrom: { kind: "audio", clipId: "audio-1" }
  }
};

function seedStore() {
  const store = createTimelineStore();
  const track: TimelineTrack = makeTrack({ type: "video", name: "V1" });
  const target: TimelineClip = makeClip({
    id: "target-1",
    trackId: track.id,
    name: "Shot 1",
    startMs: 0,
    durationMs: 2000,
    mediaType: "video"
  });
  store.setState({
    sequenceId: SEQUENCE_ID,
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    tracks: [track],
    clips: [target]
  });
  timelineTemporalOf(store).clear();
  return { store, track, target };
}

/** What the server answers `timeline.get` with once the bake has landed. */
function serverSequence(track: TimelineTrack, target: TimelineClip) {
  return {
    id: SEQUENCE_ID,
    updatedAt: "2026-01-01T00:05:00.000Z",
    tracks: [track],
    clips: [{ ...target, animations: [BAKED_ANIMATION] }],
    markers: []
  };
}

beforeEach(() => {
  postBake.mockReset();
  updateMutate.mockReset();
  mockTimelineGet.mockReset();
  updateMutate.mockResolvedValue({
    updatedAt: "2026-01-01T00:01:00.000Z"
  });
  postBake.mockResolvedValue({
    timeline_id: SEQUENCE_ID,
    updated_at: "2026-01-01T00:05:00.000Z",
    clip_id: "target-1",
    property: "scale",
    mode: "envelope",
    animationId: "anim-1",
    keyframeCount: 2,
    analyzed: { fromMs: 0, toMs: 2000 },
    truncated: false,
    replaced: false
  });
});

describe("bakeAudioAnimation", () => {
  it("saves the open document, posts the bake, and reloads what the server wrote", async () => {
    const { store, track, target } = seedStore();
    mockTimelineGet.mockResolvedValue(serverSequence(track, target));

    const result = await store.getState().bakeAudioAnimation(BODY);

    // Saved first, against the token the store held.
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      id: SEQUENCE_ID,
      baseUpdatedAt: "2026-01-01T00:00:00.000Z"
    });
    // Then the bake, then the reload.
    expect(postBake).toHaveBeenCalledWith(SEQUENCE_ID, BODY);
    expect(mockTimelineGet).toHaveBeenCalledWith({ id: SEQUENCE_ID });

    expect(result.keyframeCount).toBe(2);
    expect(store.getState().clips[0].animations).toEqual([BAKED_ANIMATION]);
    // The reload's token becomes the concurrency base for the next save.
    expect(store.getState().baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("records exactly one undo entry for the whole bake", async () => {
    const { store, track, target } = seedStore();
    mockTimelineGet.mockResolvedValue(serverSequence(track, target));
    const before = timelineTemporalOf(store).pastStates.length;

    await store.getState().bakeAudioAnimation(BODY);

    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);

    timelineTemporalOf(store).undo();
    expect(store.getState().clips[0].animations).toBeUndefined();
  });

  it("leaves the document alone when the editor moved to another sequence", async () => {
    const { store, track, target } = seedStore();
    mockTimelineGet.mockImplementation(async () => {
      store.setState({ sequenceId: "tl-2" });
      return serverSequence(track, target);
    });

    await store.getState().bakeAudioAnimation(BODY);

    expect(store.getState().clips[0].animations).toBeUndefined();
  });

  it("refuses to bake when no timeline is open", async () => {
    const { store } = seedStore();
    store.setState({ sequenceId: null });

    await expect(store.getState().bakeAudioAnimation(BODY)).rejects.toThrow(
      "No timeline is open."
    );
    expect(postBake).not.toHaveBeenCalled();
  });

  it("propagates the server's refusal without touching the document", async () => {
    const { store } = seedStore();
    postBake.mockRejectedValue(new Error("Clip carries a time remap"));

    await expect(store.getState().bakeAudioAnimation(BODY)).rejects.toThrow(
      "Clip carries a time remap"
    );
    expect(mockTimelineGet).not.toHaveBeenCalled();
    expect(store.getState().clips[0].animations).toBeUndefined();
  });
});
