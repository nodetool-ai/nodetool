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
import type {
  ClipAnimation,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import {
  mockTimelineGet,
  trpcClient
} from "../../../__mocks__/trpcClientMock";
import { useConflictStore, clearAllConflicts } from "../../ConflictStore";
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

/** An earlier bake of the same kind and property: what a re-bake replaces. */
const EARLIER_BAKE: ClipAnimation = {
  ...BAKED_ANIMATION,
  id: "anim-0",
  custom: {
    ...BAKED_ANIMATION.custom,
    curves: [
      {
        property: "scale" as const,
        keyframes: [
          { t: 0, sourceMs: 0, value: 1 },
          { t: 1, sourceMs: 2000, value: 1.05 }
        ]
      }
    ]
  }
};

/** A curve nobody baked: it carries no `bakedFrom`, so no bake owns it. */
const HAND_ANIMATION: ClipAnimation = {
  id: "hand-1",
  role: "in",
  preset: "fade-in",
  durationMs: 500
};

function seedStore(animations?: ClipAnimation[]) {
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
  if (animations) {
    target.animations = animations;
  }
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

/** The conflict-banner key the store reports this sequence's refusals under. */
const CONFLICT_KEY = `timelinesequence:${SEQUENCE_ID}`;

const listedConflicts = () =>
  useConflictStore.getState().byKey[CONFLICT_KEY]?.conflicts ?? [];

beforeEach(() => {
  clearAllConflicts();
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

  it("keeps edits made while the bake was in flight", async () => {
    const { store, track, target } = seedStore();
    // A second track with nothing on it, and a clip the bake never touches:
    // the two things the user is about to change while the request runs.
    const spare: TimelineTrack = makeTrack({ type: "video", name: "V2" });
    const other: TimelineClip = makeClip({
      id: "other-1",
      trackId: track.id,
      name: "Shot 2",
      startMs: 2000,
      durationMs: 2000,
      mediaType: "video"
    });
    store.setState({
      tracks: [track, spare],
      clips: [target, other]
    });
    timelineTemporalOf(store).clear();

    // The server answers with the document as it was SAVED plus the bake —
    // it never saw the edits made after the save.
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () =>
            resolve({
              id: SEQUENCE_ID,
              updatedAt: "2026-01-01T00:05:00.000Z",
              tracks: [track, spare],
              clips: [{ ...target, animations: [BAKED_ANIMATION] }, other],
              markers: []
            });
        })
    );

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    // Inside the 750 ms autosave debounce: none of this has reached the
    // server, and the response in flight predates all of it.
    store.getState().patchClip("other-1", { name: "Renamed" });
    const marker = store.getState().addMarker({ timeMs: 1000, label: "Beat" });
    store.getState().removeTrack(spare.id);
    const before = timelineTemporalOf(store).pastStates.length;

    releaseGet();
    await pending;

    const state = store.getState();
    expect(state.clips.find((c) => c.id === "other-1")?.name).toBe("Renamed");
    expect(state.markers.map((m) => m.id)).toEqual([marker.id]);
    expect(state.tracks.map((t) => t.id)).toEqual([track.id]);
    // …and the bake's own write still arrived.
    expect(state.clips.find((c) => c.id === "target-1")?.animations).toEqual([
      BAKED_ANIMATION
    ]);
    expect(state.baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
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

  it("keeps a rename made while the INITIAL SAVE was in flight", async () => {
    const { store, track, target } = seedStore();
    let releaseSave: () => void = () => {};
    updateMutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSave = () =>
            resolve({ updatedAt: "2026-01-01T00:01:00.000Z" });
        })
    );
    // The server never saw the rename: it started from the document the save
    // carried, and answers with that document plus the curve.
    mockTimelineGet.mockResolvedValue(serverSequence(track, target));

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateMutate).toHaveBeenCalledTimes(1);

    // Inside the save's own window — the edit is not in what was sent.
    store.getState().patchClip("target-1", { name: "User rename" });
    releaseSave();
    await pending;

    const clip = store.getState().clips.find((c) => c.id === "target-1");
    expect(clip?.name).toBe("User rename");
    expect(clip?.animations).toEqual([BAKED_ANIMATION]);
    expect(listedConflicts()).toEqual([]);
  });

  it("bakes onto a clip edited while the bake was in flight", async () => {
    const { store, track, target } = seedStore();
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () => resolve(serverSequence(track, target));
        })
    );

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    // The user edits the very clip the bake is writing to — a rename, and a
    // curve of their own that no bake owns.
    store.getState().patchClip("target-1", { name: "User rename" });
    store.getState().setClipAnimations("target-1", [HAND_ANIMATION]);

    releaseGet();
    const result = await pending;

    const clip = store.getState().clips.find((c) => c.id === "target-1");
    expect(clip?.name).toBe("User rename");
    // The bake replaces only the curve it owns; the hand-made one stays.
    expect(clip?.animations).toEqual([HAND_ANIMATION, BAKED_ANIMATION]);
    expect(result.pendingUserResolution).toBeUndefined();
    expect(listedConflicts()).toEqual([]);
    // The next merge base and the next autosave's baseline hold what the
    // server now has, curve included — nothing left to overwrite it with.
    expect(store.getState().baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(
      store
        .getState()
        .syncedDocument?.clips.find((c) => c.id === "target-1")?.animations
    ).toEqual([BAKED_ANIMATION]);
  });

  it("offers the baked curve in the banner when the draft deleted it", async () => {
    // A re-bake: the clip already carries the curve this bake owns, so the
    // user deleting it during the request is a change to the same field. A
    // replace keeps the earlier curve's id, which is the id the route reports.
    const { store, track, target } = seedStore([EARLIER_BAKE]);
    const rebaked: ClipAnimation = { ...BAKED_ANIMATION, id: EARLIER_BAKE.id };
    postBake.mockResolvedValue({
      timeline_id: SEQUENCE_ID,
      updated_at: "2026-01-01T00:05:00.000Z",
      clip_id: "target-1",
      property: "scale",
      mode: "envelope",
      animationId: EARLIER_BAKE.id,
      keyframeCount: 2,
      analyzed: { fromMs: 0, toMs: 2000 },
      truncated: false,
      replaced: true
    });
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () =>
            resolve({
              id: SEQUENCE_ID,
              updatedAt: "2026-01-01T00:05:00.000Z",
              tracks: [track],
              clips: [{ ...target, animations: [rebaked] }],
              markers: []
            });
        })
    );

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    store.getState().setClipAnimations("target-1", []);

    releaseGet();
    const result = await pending;

    // The draft stands …
    expect(
      store.getState().clips.find((c) => c.id === "target-1")?.animations
    ).toEqual([]);
    // … the bake's result is offered rather than dropped …
    const conflicts = listedConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].unit).toMatchObject({ kind: "clip", id: "target-1" });
    expect((conflicts[0].external as TimelineClip).animations).toEqual([
      rebaked
    ]);
    // … and the caller is told the bake has not landed.
    expect(result.pendingUserResolution).toBe(true);

    // Accepting takes only the baked curve, through a normal store mutation.
    store.getState().patchClip("target-1", { name: "User rename" });
    useConflictStore.getState().accept(CONFLICT_KEY, "target-1");
    const clip = store.getState().clips.find((c) => c.id === "target-1");
    expect(clip?.animations).toEqual([rebaked]);
    expect(clip?.name).toBe("User rename");
    expect(listedConflicts()).toEqual([]);
  });

  it("adopts a bake a live sync already applied, without a conflict", async () => {
    // The document sync loads the finished curve into the store while this
    // action's own GET is still in flight; the action still holds the
    // pre-run base, which has no curve at all.
    const { store, track, target } = seedStore();
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () => resolve(serverSequence(track, target));
        })
    );

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    store.getState().setClipAnimations("target-1", [BAKED_ANIMATION]);

    releaseGet();
    const result = await pending;

    // The value is already on the clip, so there is nothing to resolve …
    expect(
      store.getState().clips.find((c) => c.id === "target-1")?.animations
    ).toEqual([BAKED_ANIMATION]);
    expect(listedConflicts()).toEqual([]);
    expect(result.pendingUserResolution).toBeUndefined();
    // … and the base carries it, so the next autosave writes nothing back.
    expect(
      store
        .getState()
        .syncedDocument?.clips.find((c) => c.id === "target-1")?.animations
    ).toEqual([BAKED_ANIMATION]);
  });

  it("appends the curve THIS bake wrote beside an earlier bake of the same property", async () => {
    // `replace: false`: the server keeps anim-0 and adds anim-1, and reports
    // which one it wrote.
    const { store, track, target } = seedStore([EARLIER_BAKE]);
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
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () =>
            resolve({
              id: SEQUENCE_ID,
              updatedAt: "2026-01-01T00:05:00.000Z",
              tracks: [track],
              clips: [
                { ...target, animations: [EARLIER_BAKE, BAKED_ANIMATION] }
              ],
              markers: []
            });
        })
    );

    const pending = store
      .getState()
      .bakeAudioAnimation({ ...BODY, replace: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    // The user renames the target while the bake runs.
    store.getState().patchClip("target-1", { name: "User rename" });

    releaseGet();
    const result = await pending;

    const clip = store.getState().clips.find((c) => c.id === "target-1");
    expect(clip?.name).toBe("User rename");
    expect(clip?.animations).toEqual([EARLIER_BAKE, BAKED_ANIMATION]);
    expect(listedConflicts()).toEqual([]);
    expect(result.pendingUserResolution).toBeUndefined();
    expect(
      store
        .getState()
        .syncedDocument?.clips.find((c) => c.id === "target-1")?.animations
    ).toEqual([EARLIER_BAKE, BAKED_ANIMATION]);
  });

  it("replaces the earlier bake when the target is renamed mid-request", async () => {
    // `replace: true`: the server overwrites anim-0 in place and reports its
    // id back as the curve this bake wrote.
    const { store, track, target } = seedStore([EARLIER_BAKE]);
    const rebaked = { ...BAKED_ANIMATION, id: "anim-0" };
    postBake.mockResolvedValue({
      timeline_id: SEQUENCE_ID,
      updated_at: "2026-01-01T00:05:00.000Z",
      clip_id: "target-1",
      property: "scale",
      mode: "envelope",
      animationId: "anim-0",
      keyframeCount: 2,
      analyzed: { fromMs: 0, toMs: 2000 },
      truncated: false,
      replaced: true
    });
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () =>
            resolve({
              id: SEQUENCE_ID,
              updatedAt: "2026-01-01T00:05:00.000Z",
              tracks: [track],
              clips: [{ ...target, animations: [rebaked] }],
              markers: []
            });
        })
    );

    const pending = store.getState().bakeAudioAnimation(BODY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    store.getState().patchClip("target-1", { name: "User rename" });

    releaseGet();
    const result = await pending;

    const clip = store.getState().clips.find((c) => c.id === "target-1");
    expect(clip?.name).toBe("User rename");
    expect(clip?.animations).toEqual([rebaked]);
    expect(listedConflicts()).toEqual([]);
    expect(result.pendingUserResolution).toBeUndefined();
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
