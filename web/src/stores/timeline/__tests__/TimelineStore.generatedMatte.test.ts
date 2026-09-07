/**
 * The store's side of a generated matte (D2): the three local edits — knobs,
 * version, remove — and `isolateSubject`, which runs on the server.
 *
 * The local three go through the package's pure helpers, so what is asserted
 * here is what the store owns: one undo entry per edit, and a no-op returning
 * the same state. `isolateSubject` has four jobs — persist the open document,
 * post, wait for the run to settle, take back what the server wrote — and each
 * is asserted, including the failure path, which must not reject.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  ClipGeneratedMatte,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { mockTimelineGet, trpcClient } from "../../../__mocks__/trpcClientMock";
import { isolateSubject } from "../../../utils/timelineIsolateSubject";
import { useNotificationStore } from "../../NotificationStore";
import { useConflictStore, clearAllConflicts } from "../../ConflictStore";

jest.mock("../../../utils/timelineIsolateSubject", () => ({
  ...(jest.requireActual(
    "../../../utils/timelineIsolateSubject"
  ) as Record<string, unknown>),
  isolateSubject: jest.fn()
}));

const postIsolate = isolateSubject as jest.MockedFunction<
  typeof isolateSubject
>;
const updateMutate = trpcClient.timeline.update.mutate as unknown as jest.Mock<
  (input: unknown) => Promise<{ updatedAt: string }>
>;

const SEQUENCE_ID = "tl-1";
const CLIP_ID = "shot-1";

const MATTE: ClipGeneratedMatte = {
  assetId: "mask-2",
  sourceAssetId: "asset-1",
  sourceRange: { fromMs: 0, toMs: 4000 },
  settings: { model: "General Use (Light)" },
  status: "ready",
  versions: [
    {
      assetId: "mask-1",
      sourceAssetId: "asset-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      settings: { model: "Portrait" }
    }
  ]
};

function seedStore(matte?: ClipGeneratedMatte) {
  const store = createTimelineStore();
  const track: TimelineTrack = makeTrack({ type: "video", name: "V1" });
  const clip: TimelineClip = makeClip({
    id: CLIP_ID,
    trackId: track.id,
    name: "Shot 1",
    mediaType: "video",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    currentAssetId: "asset-1",
    generatedMatte: matte
  });
  store.setState({
    sequenceId: SEQUENCE_ID,
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    tracks: [track],
    clips: [clip]
  });
  timelineTemporalOf(store).clear();
  return { store, track, clip };
}

/** What the server answers `timeline.get` with, with the clip's matte at `status`. */
function serverSequence(
  track: TimelineTrack,
  clip: TimelineClip,
  matte: ClipGeneratedMatte
) {
  return {
    id: SEQUENCE_ID,
    updatedAt: "2026-01-01T00:05:00.000Z",
    tracks: [track],
    clips: [{ ...clip, generatedMatte: matte }],
    markers: []
  };
}

/** The conflict-banner key the store reports this sequence's refusals under. */
const CONFLICT_KEY = `timelinesequence:${SEQUENCE_ID}`;

const listedConflicts = () =>
  useConflictStore.getState().byKey[CONFLICT_KEY]?.conflicts ?? [];

beforeEach(() => {
  postIsolate.mockReset();
  updateMutate.mockReset();
  mockTimelineGet.mockReset();
  updateMutate.mockResolvedValue({ updatedAt: "2026-01-01T00:01:00.000Z" });
  useNotificationStore.getState().clearNotifications();
  clearAllConflicts();
});

describe("setGeneratedMatteKnobs", () => {
  it("writes invert, strength and feather, one undo entry each", () => {
    const { store } = seedStore(MATTE);
    const before = timelineTemporalOf(store).pastStates.length;

    store.getState().setGeneratedMatteKnobs(CLIP_ID, { invert: true });
    store.getState().setGeneratedMatteKnobs(CLIP_ID, { strength: 0.4 });
    store.getState().setGeneratedMatteKnobs(CLIP_ID, { featherPx: 3 });

    expect(store.getState().clips[0].generatedMatte).toMatchObject({
      assetId: "mask-2",
      invert: true,
      strength: 0.4,
      featherPx: 3
    });
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 3);
  });

  it("clamps strength to 0..1 and feather to non-negative", () => {
    const { store } = seedStore(MATTE);
    store.getState().setGeneratedMatteKnobs(CLIP_ID, { strength: 2 });
    store.getState().setGeneratedMatteKnobs(CLIP_ID, { featherPx: -5 });
    expect(store.getState().clips[0].generatedMatte?.strength).toBe(1);
    expect(store.getState().clips[0].generatedMatte?.featherPx).toBe(0);
  });

  it("is a no-op on an unchanged value and on a clip with no matte", () => {
    const { store } = seedStore(MATTE);
    store.getState().setGeneratedMatteKnobs(CLIP_ID, { invert: true });
    const after = timelineTemporalOf(store).pastStates.length;
    const clips = store.getState().clips;

    store.getState().setGeneratedMatteKnobs(CLIP_ID, { invert: true });
    expect(store.getState().clips).toBe(clips);
    expect(timelineTemporalOf(store).pastStates.length).toBe(after);

    const bare = seedStore();
    bare.store.getState().setGeneratedMatteKnobs(CLIP_ID, { invert: true });
    expect(bare.store.getState().clips[0].generatedMatte).toBeUndefined();
  });
});

describe("selectGeneratedMatteVersion", () => {
  it("makes a stored version current and puts the displaced one in the list", () => {
    const { store } = seedStore(MATTE);
    const before = timelineTemporalOf(store).pastStates.length;

    store.getState().selectGeneratedMatteVersion(CLIP_ID, "mask-1");

    const matte = store.getState().clips[0].generatedMatte;
    expect(matte?.assetId).toBe("mask-1");
    expect(matte?.versions?.map((v) => v.assetId)).toEqual(["mask-2"]);
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
  });

  it("is a no-op for an asset no version carries", () => {
    const { store } = seedStore(MATTE);
    const clips = store.getState().clips;
    store.getState().selectGeneratedMatteVersion(CLIP_ID, "mask-99");
    expect(store.getState().clips).toBe(clips);
  });
});

describe("clearGeneratedMatte", () => {
  it("drops the matte in one undo entry, and undo brings it back", () => {
    const { store } = seedStore(MATTE);
    const before = timelineTemporalOf(store).pastStates.length;

    store.getState().clearGeneratedMatte(CLIP_ID);
    expect(store.getState().clips[0].generatedMatte).toBeUndefined();
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);

    timelineTemporalOf(store).undo();
    expect(store.getState().clips[0].generatedMatte).toMatchObject({
      assetId: "mask-2"
    });
  });

  it("is a no-op on a clip with no matte", () => {
    const { store } = seedStore();
    const clips = store.getState().clips;
    store.getState().clearGeneratedMatte(CLIP_ID);
    expect(store.getState().clips).toBe(clips);
  });
});

describe("isolateSubject", () => {
  it("saves the document, posts, and reloads a run that came back ready", async () => {
    const { store, track, clip } = seedStore();
    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "mask-2",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    mockTimelineGet.mockResolvedValue(serverSequence(track, clip, MATTE));

    const result = await store
      .getState()
      .isolateSubject(CLIP_ID, { model: "Portrait" });

    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      id: SEQUENCE_ID,
      baseUpdatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(postIsolate).toHaveBeenCalledWith(SEQUENCE_ID, {
      clip_id: CLIP_ID,
      model: "Portrait",
      regenerate: undefined
    });
    expect(result?.status).toBe("ready");
    expect(store.getState().clips[0].generatedMatte).toMatchObject({
      assetId: "mask-2",
      status: "ready"
    });
    expect(store.getState().baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("marks the clip generating, then polls until the document settles", async () => {
    const { store, track, clip } = seedStore();
    postIsolate.mockImplementation(async () => {
      // The mark lands before the request is answered — that is what the
      // inspector's spinner reads.
      expect(store.getState().clips[0].generatedMatte?.status).toBe(
        "generating"
      );
      return {
        status: "generating" as const,
        generationId: "gen-1",
        sourceRange: { fromMs: 0, toMs: 4000 },
        reused: false
      };
    });
    mockTimelineGet
      .mockResolvedValueOnce(
        serverSequence(track, clip, { ...MATTE, status: "generating" })
      )
      .mockResolvedValueOnce(serverSequence(track, clip, MATTE));

    await store
      .getState()
      .isolateSubject(CLIP_ID, { pollIntervalMs: 0, timeoutMs: 1000 });

    expect(mockTimelineGet).toHaveBeenCalledTimes(2);
    expect(store.getState().clips[0].generatedMatte?.status).toBe("ready");
  });

  it("keeps edits made while the matte was in flight", async () => {
    const { store, track, clip } = seedStore();
    // A second track with nothing on it, and a clip the run never touches:
    // the two things the user is about to change while the request runs.
    const spare: TimelineTrack = makeTrack({ type: "video", name: "V2" });
    const other: TimelineClip = makeClip({
      id: "other-1",
      trackId: track.id,
      name: "Shot 2",
      startMs: 4000,
      durationMs: 2000,
      mediaType: "video"
    });
    store.setState({ tracks: [track, spare], clips: [clip, other] });
    timelineTemporalOf(store).clear();

    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "mask-2",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    // The server answers with the document as it was SAVED plus the matte —
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
              clips: [{ ...clip, generatedMatte: MATTE }, other],
              markers: []
            });
        })
    );

    const pending = store.getState().isolateSubject(CLIP_ID);
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
    // …and the run's own write still arrived.
    expect(
      state.clips.find((c) => c.id === CLIP_ID)?.generatedMatte
    ).toMatchObject({ assetId: "mask-2", status: "ready" });
    expect(state.baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
  });

  it("reports a refusal as a notification and puts the previous result back", async () => {
    const { store } = seedStore(MATTE);
    postIsolate.mockRejectedValue(new Error("Clip carries a time remap"));

    const result = await store.getState().isolateSubject(CLIP_ID);

    expect(result).toBeNull();
    // A run that never landed costs the clip nothing.
    expect(store.getState().clips[0].generatedMatte).toEqual(MATTE);
    expect(
      useNotificationStore
        .getState()
        .notifications.some(
          (n) => n.type === "error" && n.content.includes("time remap")
        )
    ).toBe(true);
  });

  it("leaves a failed marker only on a clip that had no matte at all", async () => {
    const { store } = seedStore();
    postIsolate.mockRejectedValue(new Error("Provider is down"));

    await store.getState().isolateSubject(CLIP_ID);

    expect(store.getState().clips[0].generatedMatte).toMatchObject({
      assetId: "",
      status: "failed"
    });
  });

  it("refuses when no timeline is open", async () => {
    const { store } = seedStore();
    store.setState({ sequenceId: null });
    await expect(store.getState().isolateSubject(CLIP_ID)).rejects.toThrow(
      "No timeline is open."
    );
    expect(postIsolate).not.toHaveBeenCalled();
  });

  it("leaves the document alone when the editor moved to another sequence", async () => {
    const { store, track, clip } = seedStore();
    postIsolate.mockResolvedValue({
      status: "ready",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    mockTimelineGet.mockImplementation(async () => {
      store.setState({ sequenceId: "tl-2" });
      return serverSequence(track, clip, MATTE);
    });

    await store.getState().isolateSubject(CLIP_ID);

    expect(store.getState().clips[0].generatedMatte?.assetId).toBe("");
  });

  it("keeps a rename made while the INITIAL SAVE was in flight", async () => {
    const { store, track, clip } = seedStore();
    let releaseSave: () => void = () => {};
    updateMutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSave = () =>
            resolve({ updatedAt: "2026-01-01T00:01:00.000Z" });
        })
    );
    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "mask-2",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    // The server never saw the rename: it started from the document the save
    // carried, and answers with that document plus the matte.
    mockTimelineGet.mockResolvedValue(serverSequence(track, clip, MATTE));

    const pending = store.getState().isolateSubject(CLIP_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateMutate).toHaveBeenCalledTimes(1);

    // Inside the save's own window — the edit is not in what was sent, so the
    // optimistic base must not claim it was.
    store.getState().patchClip(CLIP_ID, { name: "User rename" });
    releaseSave();
    await pending;

    const target = store.getState().clips.find((c) => c.id === CLIP_ID);
    expect(target?.name).toBe("User rename");
    expect(target?.generatedMatte).toMatchObject({
      assetId: "mask-2",
      status: "ready"
    });
    expect(listedConflicts()).toEqual([]);
  });

  it("takes the matte onto a clip renamed while the run was in flight", async () => {
    const { store, track, clip } = seedStore();
    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "mask-2",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () => resolve(serverSequence(track, clip, MATTE));
        })
    );

    const pending = store.getState().isolateSubject(CLIP_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    // The user renames the very clip the run is writing to. The rename and
    // the matte are different fields of one clip, so neither costs the other.
    store.getState().patchClip(CLIP_ID, { name: "User rename" });

    releaseGet();
    const result = await pending;

    const target = store.getState().clips.find((c) => c.id === CLIP_ID);
    expect(target?.name).toBe("User rename");
    expect(target?.generatedMatte).toMatchObject({
      assetId: "mask-2",
      status: "ready"
    });
    expect(result?.pendingUserResolution).toBeUndefined();
    expect(listedConflicts()).toEqual([]);
    // The next merge base and the next autosave's baseline hold what the
    // server now has, matte included — nothing left to overwrite it with.
    expect(store.getState().baseUpdatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(
      store
        .getState()
        .syncedDocument?.clips.find((c) => c.id === CLIP_ID)?.generatedMatte
    ).toMatchObject({ assetId: "mask-2", status: "ready" });
  });

  it("offers the finished matte in the banner when the draft cleared it", async () => {
    const { store, track, clip } = seedStore(MATTE);
    const generated = { ...MATTE, assetId: "paid-mask" };
    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "paid-mask",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () => resolve(serverSequence(track, clip, generated));
        })
    );

    const pending = store.getState().isolateSubject(CLIP_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Both sides changed the matte itself: the user threw it away while the
    // run was cutting a new one. That is a real contest, not a merge.
    store.getState().clearGeneratedMatte(CLIP_ID);

    releaseGet();
    const result = await pending;

    // The draft stands …
    expect(
      store.getState().clips.find((c) => c.id === CLIP_ID)?.generatedMatte
    ).toBeUndefined();
    // … the run's result is offered rather than dropped …
    const conflicts = listedConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].unit).toMatchObject({ kind: "clip", id: CLIP_ID });
    expect(
      (conflicts[0].external as TimelineClip).generatedMatte
    ).toMatchObject({ assetId: "paid-mask" });
    // … and the caller is told the run has not landed.
    expect(result?.pendingUserResolution).toBe(true);

    // Accepting takes only the matte, through a normal store mutation.
    store.getState().patchClip(CLIP_ID, { name: "User rename" });
    useConflictStore.getState().accept(CONFLICT_KEY, CLIP_ID);
    const target = store.getState().clips.find((c) => c.id === CLIP_ID);
    expect(target?.generatedMatte).toMatchObject({ assetId: "paid-mask" });
    expect(target?.name).toBe("User rename");
    expect(listedConflicts()).toEqual([]);
  });

  it("adopts a matte a live sync already applied, without a conflict", async () => {
    // The document sync loads the finished matte into the store while this
    // action's own GET is still in flight; the action still holds the base it
    // sent, whose matte is its own "generating" placeholder.
    const { store, track, clip } = seedStore();
    postIsolate.mockResolvedValue({
      status: "ready",
      assetId: "mask-2",
      sourceRange: { fromMs: 0, toMs: 4000 },
      reused: false
    });
    let releaseGet: () => void = () => {};
    mockTimelineGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGet = () => resolve(serverSequence(track, clip, MATTE));
        })
    );

    const pending = store.getState().isolateSubject(CLIP_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTimelineGet).toHaveBeenCalledTimes(1);

    store.getState().patchClip(CLIP_ID, { generatedMatte: MATTE });

    releaseGet();
    const result = await pending;

    // The result is already on the clip, so there is nothing to resolve …
    expect(
      store.getState().clips.find((c) => c.id === CLIP_ID)?.generatedMatte
    ).toEqual(MATTE);
    expect(listedConflicts()).toEqual([]);
    expect(result?.pendingUserResolution).toBeUndefined();
    // … and the base carries it, so the next autosave writes nothing back.
    expect(
      store
        .getState()
        .syncedDocument?.clips.find((c) => c.id === CLIP_ID)?.generatedMatte
    ).toEqual(MATTE);
  });
});
