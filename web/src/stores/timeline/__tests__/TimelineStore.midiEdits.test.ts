/**
 * The note edits A2 added: transpose, quantize and velocity scaling.
 *
 * Each is one store action over the clip's whole note list, and each has to be
 * one undo entry — the point of the buttons in the inspector is that a bad
 * quantize is undone in one keystroke, not note by note.
 */
import { describe, it, expect } from "@jest/globals";
import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import type { MidiNote } from "@nodetool-ai/timeline";

/** A store with one midi track holding one clip with the given notes. */
function seed(
  notes: Array<Pick<MidiNote, "pitch" | "startTick" | "durationTick"> &
    Partial<MidiNote>>
) {
  const store = createTimelineStore();
  store.getState().addTrack("midi", "Bass");
  const trackId = store.getState().tracks[0].id;
  const clipId = store.getState().addMidiClip({
    trackId,
    startMs: 0,
    durationMs: 4000,
    name: "Riff",
    notes
  });
  const read = () => store.getState().clips.find((c) => c.id === clipId)!;
  return { store, trackId, clipId, read };
}

describe("TimelineStore — transposeClip", () => {
  it("moves every note and keeps its id", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 0, durationTick: 480 },
      { pitch: 64, startTick: 480, durationTick: 480 }
    ]);
    const idsBefore = read().notes!.map((n) => n.id);

    store.getState().transposeClip(clipId, 12);

    expect(read().notes!.map((n) => n.pitch)).toEqual([72, 76]);
    expect(read().notes!.map((n) => n.id)).toEqual(idsBefore);
  });

  it("holds a note at the end of the MIDI range instead of dropping it", () => {
    const { store, clipId, read } = seed([
      { pitch: 120, startTick: 0, durationTick: 480 },
      { pitch: 4, startTick: 480, durationTick: 480 }
    ]);

    store.getState().transposeClip(clipId, 24);
    expect(read().notes!.map((n) => n.pitch)).toEqual([127, 28]);

    store.getState().transposeClip(clipId, -48);
    expect(read().notes!.map((n) => n.pitch)).toEqual([79, 0]);
  });

  it("is one undo entry, and a zero shift is none", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 0, durationTick: 480 }
    ]);
    timelineTemporalOf(store).clear();

    store.getState().transposeClip(clipId, 5);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    store.getState().transposeClip(clipId, 0);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    timelineTemporalOf(store).undo();
    expect(read().notes!.map((n) => n.pitch)).toEqual([60]);
  });

  it("ignores a clip that carries no notes", () => {
    const { store } = seed([{ pitch: 60, startTick: 0, durationTick: 480 }]);
    store.getState().addTrack("video", "V1");
    const videoTrackId = store.getState().tracks[1].id;
    const shotId = store.getState().addMidiClip({
      trackId: videoTrackId,
      startMs: 0,
      durationMs: 1000
    });
    store.getState().patchClip(shotId, { mediaType: "video" });
    timelineTemporalOf(store).clear();

    store.getState().transposeClip(shotId, 3);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(0);
  });
});

describe("TimelineStore — quantizeClip", () => {
  it("snaps onsets to the grid whatever the document tempo is", () => {
    // 1/8 is 480 ticks at PPQ 960. Ticks are the grid, so the result must not
    // move when the tempo does.
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 20, durationTick: 200 },
      { pitch: 62, startTick: 500, durationTick: 200 }
    ]);
    store.getState().setTempo({
      bpm: 90,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    });

    store.getState().quantizeClip(clipId, { division: "1/8" });

    expect(read().notes!.map((n) => n.startTick)).toEqual([0, 480]);
    expect(read().notes!.map((n) => n.durationTick)).toEqual([200, 200]);
  });

  it("moves a note part of the way at half strength", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 100, durationTick: 200 }
    ]);

    store.getState().quantizeClip(clipId, { division: "1/4", strength: 0.5 });

    expect(read().notes![0].startTick).toBe(50);
  });

  it("rounds held lengths too when asked, and is one undo entry", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 20, durationTick: 200 }
    ]);
    timelineTemporalOf(store).clear();

    store
      .getState()
      .quantizeClip(clipId, { division: "1/8", target: "start_and_length" });

    expect(read().notes![0]).toMatchObject({ startTick: 0, durationTick: 480 });
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);
  });

  it("writes nothing when the notes already sit on the grid", () => {
    const { store, clipId } = seed([
      { pitch: 60, startTick: 480, durationTick: 480 }
    ]);
    timelineTemporalOf(store).clear();

    store.getState().quantizeClip(clipId, { division: "1/8" });

    expect(timelineTemporalOf(store).pastStates).toHaveLength(0);
  });
});

describe("TimelineStore — scaleClipVelocity", () => {
  it("scales every velocity, clamped to 1..127", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 0, durationTick: 240, velocity: 100 },
      { pitch: 62, startTick: 240, durationTick: 240, velocity: 2 }
    ]);

    store.getState().scaleClipVelocity(clipId, 2);
    expect(read().notes!.map((n) => n.velocity)).toEqual([127, 4]);

    store.getState().scaleClipVelocity(clipId, 0.1);
    expect(read().notes!.map((n) => n.velocity)).toEqual([13, 1]);
  });

  it("is one undo entry", () => {
    const { store, clipId, read } = seed([
      { pitch: 60, startTick: 0, durationTick: 240, velocity: 80 }
    ]);
    timelineTemporalOf(store).clear();

    store.getState().scaleClipVelocity(clipId, 0.5);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    timelineTemporalOf(store).undo();
    expect(read().notes![0].velocity).toBe(80);
  });
});
