/**
 * The midi half of the document: tempo, the track's instrument, and a clip's
 * notes — plus the one rule that ties them together, that changing the tempo
 * rescales the midi clips and nothing else.
 *
 * The round-trip case is the load-bearing one: notes, instrument and tempo all
 * live in fields Zod would strip if the payload or the schema forgot them, and
 * a silent strip only shows up as "my part came back at the wrong speed after
 * a save".
 */
import { describe, it, expect } from "@jest/globals";
import { timeline } from "@nodetool-ai/protocol/api-schemas";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  resolveTempo
} from "@nodetool-ai/timeline";
import type { TimelineSequence, TimelineTempo } from "@nodetool-ai/timeline";
import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { buildTimelineDocumentPayload } from "../../../hooks/timeline/timelineDocumentPayload";

const tempoAt = (bpm: number): TimelineTempo => ({
  bpm,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
});

/** A store with one midi track holding one two-note clip. */
function seed() {
  const store = createTimelineStore();
  store.getState().addTrack("midi", "Bass");
  const trackId = store.getState().tracks[0].id;
  const clipId = store.getState().addMidiClip({
    trackId,
    startMs: 1000,
    durationMs: 2000,
    name: "Riff",
    notes: [
      { pitch: 60, startTick: 0, durationTick: 480 },
      { pitch: 64, startTick: 480, durationTick: 480 }
    ]
  });
  return { store, trackId, clipId };
}

describe("TimelineStore — midi tracks", () => {
  it("gives a new midi track the default instrument", () => {
    const { store } = seed();
    expect(store.getState().tracks[0].instrument).toEqual(
      DEFAULT_MIDI_INSTRUMENT
    );
  });

  it("adds a midi clip that no generation path can pick up", () => {
    const { store, clipId } = seed();
    const clip = store.getState().clips.find((c) => c.id === clipId)!;
    expect(clip.mediaType).toBe("midi");
    expect(clip.sourceType).toBe("imported");
    expect(clip.status).toBe("generated");
    expect(clip.currentAssetId).toBeUndefined();
    expect(clip.notes).toHaveLength(2);
  });

  it("mints ids and the default velocity for notes that lack them", () => {
    const { store, clipId } = seed();
    const notes = store.getState().clips.find((c) => c.id === clipId)!.notes!;
    expect(notes.every((n) => n.id.length > 0)).toBe(true);
    expect(new Set(notes.map((n) => n.id)).size).toBe(2);
    expect(notes.every((n) => n.velocity === 100)).toBe(true);
  });

  it("orders the notes a clip stores by onset", () => {
    const { store, clipId } = seed();
    store.getState().setClipNotes(clipId, [
      { pitch: 67, startTick: 960, durationTick: 240 },
      { pitch: 62, startTick: 240, durationTick: 240 }
    ]);
    const notes = store.getState().clips.find((c) => c.id === clipId)!.notes!;
    expect(notes.map((n) => n.startTick)).toEqual([240, 960]);
  });

  it("reads a document with no tempo at the default", () => {
    const { store } = seed();
    expect(store.getState().tempo).toBeUndefined();
    expect(resolveTempo(store.getState())).toEqual(DEFAULT_TEMPO);
  });

  it("halving the BPM doubles a midi clip's start and length", () => {
    const { store, clipId } = seed();
    store.getState().setTempo(tempoAt(60));
    const clip = store.getState().clips.find((c) => c.id === clipId)!;
    expect(clip.startMs).toBe(2000);
    expect(clip.durationMs).toBe(4000);
    // The notes keep their tick positions: the beat grid stretched, not the part.
    expect(clip.notes!.map((n) => n.startTick)).toEqual([0, 480]);
  });

  it("leaves clips that are not midi where the editor put them", () => {
    const { store } = seed();
    store.getState().addTrack("video", "V1");
    const videoTrackId = store.getState().tracks[1].id;
    store.getState().addClip(
      makeClip({
        id: "shot-1",
        trackId: videoTrackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 1000,
        durationMs: 2000
      })
    );

    store.getState().setTempo(tempoAt(60));

    const shot = store.getState().clips.find((c) => c.id === "shot-1")!;
    expect(shot.startMs).toBe(1000);
    expect(shot.durationMs).toBe(2000);
  });

  it("records one undo entry per tempo change and none for a repeat", () => {
    const { store } = seed();
    timelineTemporalOf(store).clear();

    store.getState().setTempo(tempoAt(90));
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    store.getState().setTempo(tempoAt(90));
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    timelineTemporalOf(store).undo();
    expect(store.getState().tempo).toBeUndefined();
    expect(store.getState().clips[0].startMs).toBe(1000);
  });

  it("stores 120 BPM explicitly on a document that had no tempo", () => {
    // Not a no-op: nothing about playback changes, but the tempo the part was
    // written at is now recorded, and that is what a later change rescales from.
    const { store, clipId } = seed();
    store.getState().setTempo(tempoAt(120));
    expect(store.getState().tempo).toEqual(tempoAt(120));
    expect(store.getState().clips.find((c) => c.id === clipId)!.startMs).toBe(
      1000
    );
  });

  it("sets the instrument on the named track only", () => {
    const { store, trackId } = seed();
    store.getState().addTrack("midi", "Lead");
    const other = store.getState().tracks[1].id;

    store
      .getState()
      .setTrackInstrument(trackId, {
        ...DEFAULT_MIDI_INSTRUMENT,
        waveform: "square"
      });

    expect(store.getState().tracks[0].instrument?.waveform).toBe("square");
    expect(store.getState().tracks[1].id).toBe(other);
    expect(store.getState().tracks[1].instrument?.waveform).toBe("saw");
  });

  it("round-trips tempo, instrument and notes through the save payload", () => {
    const { store, clipId } = seed();
    store.getState().setTempo(tempoAt(90));
    store
      .getState()
      .setTrackInstrument(store.getState().tracks[0].id, {
        ...DEFAULT_MIDI_INSTRUMENT,
        waveform: "triangle",
        cutoffHz: 800
      });

    // What autosave PATCHes, through the schema the server validates it with.
    const payload = buildTimelineDocumentPayload(store.getState());
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

    expect(reloaded.getState().tempo).toEqual(tempoAt(90));
    expect(reloaded.getState().tracks[0].instrument).toEqual({
      ...DEFAULT_MIDI_INSTRUMENT,
      waveform: "triangle",
      cutoffHz: 800
    });
    const clip = reloaded.getState().clips.find((c) => c.id === clipId)!;
    expect(clip.notes).toEqual(
      store.getState().clips.find((c) => c.id === clipId)!.notes
    );
  });

  it("would notice a payload that dropped tempo", () => {
    // The inverse of the round trip above: a payload without `tempo` must not
    // read back as the tempo that was set, or the test above passes on a
    // helper that silently drops it.
    const { store } = seed();
    store.getState().setTempo(tempoAt(90));
    const { tempo: _dropped, ...withoutTempo } = buildTimelineDocumentPayload(
      store.getState()
    );
    const parsed = timeline.timelineDocument.parse(
      JSON.parse(JSON.stringify(withoutTempo))
    );
    expect(parsed.tempo).toBeUndefined();
  });
});
