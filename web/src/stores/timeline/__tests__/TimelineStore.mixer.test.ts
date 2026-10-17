/**
 * The mixer half of the document: track faders and pan, and the master
 * channel. The master lives in a document field Zod strips when the schema or
 * the payload forgets it, so it gets the same round-trip, merge and undo
 * cases as the tempo.
 */
import { describe, it, expect } from "@jest/globals";
import { timeline } from "@nodetool-ai/protocol/api-schemas";
import type { TimelineSequence, TrackEffect } from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { mergeTimelineDocuments, type TimelineMergeDoc } from "../merge";
import { buildTimelineDocumentPayload } from "../../../hooks/timeline/timelineDocumentPayload";

function seed() {
  const store = createTimelineStore();
  store.getState().addTrack("audio", "Vox");
  const trackId = store.getState().tracks[0].id;
  return { store, trackId };
}

function reload(payload: unknown) {
  const parsed = timeline.timelineDocument.parse(
    JSON.parse(JSON.stringify(payload))
  );
  const reloaded = createTimelineStore();
  reloaded.getState().loadSequence({
    id: "seq-1",
    projectId: "proj-1",
    name: "Test",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 10_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...parsed
  } as TimelineSequence);
  return reloaded;
}

const docOf = (master?: TimelineMergeDoc["master"]): TimelineMergeDoc => ({
  tracks: [],
  trackFolders: [],
  clips: [],
  markers: [],
  mediaTracks: [],
  transcript: [],
  scriptEnabled: false,
  fps: 30,
  width: 1920,
  height: 1080,
  master
});

describe("TimelineStore — mixer", () => {
  it("sets and clamps a track's fader and pan", () => {
    const { store, trackId } = seed();
    store.getState().setTrackVolume(trackId, -6);
    store.getState().setTrackPan(trackId, -0.25);
    expect(store.getState().tracks[0].volumeDb).toBe(-6);
    expect(store.getState().tracks[0].pan).toBe(-0.25);
    store.getState().setTrackVolume(trackId, 99);
    store.getState().setTrackPan(trackId, -4);
    expect(store.getState().tracks[0].volumeDb).toBe(24);
    expect(store.getState().tracks[0].pan).toBe(-1);
    store.getState().setTrackVolume(trackId, Number.NEGATIVE_INFINITY);
    expect(store.getState().tracks[0].volumeDb).toBe(-120);
  });

  it("records one undo entry per fader change and none for a repeat", () => {
    const { store, trackId } = seed();
    const depth = timelineTemporalOf(store).pastStates.length;
    store.getState().setTrackVolume(trackId, -3);
    store.getState().setTrackVolume(trackId, -3);
    store.getState().setMasterVolume(-2);
    store.getState().setMasterVolume(-2);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(depth + 2);
    timelineTemporalOf(store).undo();
    expect(store.getState().master).toBeUndefined();
    timelineTemporalOf(store).undo();
    expect(store.getState().tracks[0].volumeDb).toBeUndefined();
  });

  it("adds, edits, moves and removes master effects", () => {
    const { store } = seed();
    store.getState().addMasterEffect("compressor");
    store.getState().addMasterEffect("gain");
    const [comp, gain] = store.getState().master!.effects!;
    expect(store.getState().master!.volumeDb).toBe(0);
    store
      .getState()
      .updateMasterEffect(gain.id, { gainDb: -4 } as Partial<TrackEffect>);
    expect(store.getState().master!.effects![1]).toMatchObject({ gainDb: -4 });
    store.getState().moveMasterEffect(1, 0);
    expect(store.getState().master!.effects!.map((e) => e.id)).toEqual([
      gain.id,
      comp.id
    ]);
    store.getState().removeMasterEffect(gain.id);
    expect(store.getState().master!.effects!.map((e) => e.id)).toEqual([
      comp.id
    ]);
    timelineTemporalOf(store).undo();
    expect(store.getState().master!.effects).toHaveLength(2);
  });

  it("adds a ready-made effect to the master as given", () => {
    const { store } = seed();
    const effect: TrackEffect = {
      id: "fx-ready",
      type: "gain",
      enabled: true,
      gainDb: 3
    };
    store.getState().addMasterEffect(effect);
    expect(store.getState().master!.effects).toEqual([effect]);
  });

  it("round-trips the master, track fader and pan through the save payload", () => {
    const { store, trackId } = seed();
    store.getState().setTrackVolume(trackId, -9);
    store.getState().setTrackPan(trackId, 0.5);
    store.getState().setMasterVolume(-1.5);
    store.getState().addMasterEffect("eq3");
    const reloaded = reload(buildTimelineDocumentPayload(store.getState()));
    expect(reloaded.getState().master).toEqual(store.getState().master);
    expect(reloaded.getState().tracks[0].volumeDb).toBe(-9);
    expect(reloaded.getState().tracks[0].pan).toBe(0.5);
    expect(reloaded.getState().syncedDocument?.master).toEqual(
      store.getState().master
    );
  });

  it("would notice a payload that dropped the master", () => {
    const { store } = seed();
    store.getState().setMasterVolume(-6);
    const { master: _dropped, ...withoutMaster } = buildTimelineDocumentPayload(
      store.getState()
    );
    expect(reload(withoutMaster).getState().master).toBeUndefined();
  });

  it("clears the master on reset", () => {
    const { store } = seed();
    store.getState().setMasterVolume(-6);
    store.getState().reset();
    expect(store.getState().master).toBeUndefined();
  });

  it("applies an external master through applyExternalMerge", () => {
    const { store } = seed();
    store.getState().applyExternalMerge({ master: { volumeDb: -12 } });
    expect(store.getState().master).toEqual({ volumeDb: -12 });
  });

  it("merges an external master change into a draft that left it alone", () => {
    const base = docOf({ volumeDb: 0 });
    const server = docOf({ volumeDb: -5 });
    const { doc, conflicts } = mergeTimelineDocuments(base, base, server, undefined, {
      mergeWithoutOps: true
    });
    expect(doc.master).toEqual({ volumeDb: -5 });
    expect(conflicts).toEqual([]);
  });

  it("keeps the draft's master when only the draft changed it", () => {
    const base = docOf({ volumeDb: 0 });
    const draft = docOf({ volumeDb: -3 });
    const { doc } = mergeTimelineDocuments(base, draft, base, undefined, {
      mergeWithoutOps: true
    });
    expect(doc.master).toEqual({ volumeDb: -3 });
  });
});
