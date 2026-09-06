/**
 * The midi ops of `edit_timeline`, driven the way an agent reaches them: one
 * capability call per phrase, against a stored row.
 *
 * The document model is the interesting half. Milliseconds are the master
 * clock and a note's ticks are read against the tempo, so `set_tempo` has to
 * move the stored milliseconds of the midi clips and nothing else — the audio
 * clip below is the control that proves it does not. The refusals each ship
 * the call that triggers them, and assert the document was left alone: a
 * half-applied note list is worse than none.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import {
  DEFAULT_MIDI_INSTRUMENT,
  MIDI_PPQ,
  findInstrumentPreset
} from "@nodetool-ai/timeline";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const run = (userId = "u1") =>
  createCapabilityRun({ context: ctx(userId), gate: UNGATED });

/** A cut with one audio clip on it — the clip a tempo change must not move. */
const document = () =>
  JSON.stringify({
    tracks: [
      {
        id: "track-audio",
        name: "Music",
        type: "audio",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip-audio",
        trackId: "track-audio",
        name: "Bed",
        startMs: 0,
        durationMs: 4000,
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: []
      }
    ],
    markers: []
  });

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Theme",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 4000,
    document: document()
  });
}

/** Four quarter notes walking up from middle C. */
const quarterNotes = [0, 1, 2, 3].map((i) => ({
  pitch: 60 + i,
  start_tick: i * MIDI_PPQ,
  duration_tick: MIDI_PPQ
}));

interface EditResult {
  applied: number;
  failed: number;
  ops: { ok: boolean; error?: string; result?: unknown }[];
}

const edit = (timelineId: string, ops: Record<string, unknown>[]) =>
  run().invoke("edit_timeline", {
    timeline_id: timelineId,
    ops
  }) as Promise<EditResult>;

interface StateResult {
  ok: true;
  tempo?: { bpm: number; offsetMs: number };
  tracks: {
    id: string;
    name: string;
    type: string;
    instrument?: { waveform: string };
    presetId?: string;
  }[];
  clips: {
    id: string;
    name: string;
    mediaType: string;
    startMs: number;
    durationMs: number;
    noteCount?: number;
    audibleNoteCount?: number;
    startBarsBeats?: string;
  }[];
}

/** `get_state` as the op that reports it, not as a second read path. */
async function getState(timelineId: string): Promise<StateResult> {
  const result = await edit(timelineId, [{ op: "get_state" }]);
  expect(result.failed).toBe(0);
  return result.ops[0].result as StateResult;
}

/** The stored row's document, to prove a refusal wrote nothing. */
async function storedDocument(
  timelineId: string
): Promise<Record<string, unknown>> {
  const row = await TimelineSequence.findById(timelineId);
  return JSON.parse(row!.document) as Record<string, unknown>;
}

describe("edit_timeline — midi", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("adds a midi track with the default synth and gives the document a tempo", async () => {
    const row = await makeTimeline();
    const result = await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });

    const state = await getState(row.id);
    expect(state.tempo).toEqual({
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    });
    const lead = state.tracks.find((t) => t.name === "Lead");
    expect(lead?.type).toBe("midi");
    expect(lead?.instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);

    // The tempo has to reach the row, not just the in-memory session.
    const stored = await storedDocument(row.id);
    expect(stored["tempo"]).toMatchObject({ bpm: 120 });
  });

  it("places a phrase of four quarter notes and reports the count", async () => {
    const row = await makeTimeline();
    const result = await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);
    expect(result).toMatchObject({ applied: 2, failed: 0 });

    const state = await getState(row.id);
    const walk = state.clips.find((c) => c.name === "Walk");
    expect(walk?.mediaType).toBe("midi");
    // Four quarter notes at 120 BPM are exactly the 2000ms window, so every
    // one of them sounds.
    expect(walk?.noteCount).toBe(4);
    expect(walk?.audibleNoteCount).toBe(4);

    const stored = await storedDocument(row.id);
    const clips = stored["clips"] as { name: string; notes?: unknown[] }[];
    const notes = clips.find((c) => c.name === "Walk")?.notes as
      | { id: string; pitch: number; velocity: number; startTick: number }[]
      | undefined;
    expect(notes?.map((n) => n.pitch)).toEqual([60, 61, 62, 63]);
    expect(notes?.map((n) => n.startTick)).toEqual([0, 960, 1920, 2880]);
    // Ids are minted, and the default velocity comes from the timeline package.
    expect(notes?.every((n) => n.id.length > 0)).toBe(true);
    expect(notes?.every((n) => n.velocity === 100)).toBe(true);
  });

  it("refuses a midi clip on a track that is not midi", async () => {
    const row = await makeTimeline();
    const result = await edit(row.id, [
      {
        op: "add_midi_clip",
        track: "Music",
        start_ms: 0,
        duration_ms: 2000,
        notes: quarterNotes
      }
    ]);
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("audio track");
  });

  it("halving the tempo doubles the midi clip and leaves the audio clip alone", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 1000,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);

    const result = await edit(row.id, [{ op: "set_tempo", bpm: 60 }]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });

    const state = await getState(row.id);
    expect(state.tempo?.bpm).toBe(60);
    const walk = state.clips.find((c) => c.name === "Walk");
    expect(walk?.startMs).toBe(2000);
    expect(walk?.durationMs).toBe(4000);
    // Same notes, same ticks — the window grew with them, so all four still
    // sound at the slower speed.
    expect(walk?.noteCount).toBe(4);
    expect(walk?.audibleNoteCount).toBe(4);

    const bed = state.clips.find((c) => c.name === "Bed");
    expect(bed).toMatchObject({ startMs: 0, durationMs: 4000 });
  });

  it("refuses a note list with a pitch of 128 and stores nothing", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);
    const before = await storedDocument(row.id);

    const result = await edit(row.id, [
      {
        op: "set_notes",
        clip: "Walk",
        notes: [{ pitch: 128, start_tick: 0, duration_tick: MIDI_PPQ }]
      }
    ]);
    expect(result.failed).toBe(1);
    // The shared contract's own bound catches this one before the note list is
    // ever built; the message names the limit either way, so the next call is
    // a fix rather than a guess.
    expect(result.ops[0].error).toContain("127");
    expect(result.ops[0].error).toContain("pitch");

    expect(await storedDocument(row.id)).toEqual(before);
  });

  it("refuses a note list validateNotes rejects, and stores nothing", async () => {
    // Two notes under one id: a problem no per-field schema can see, which is
    // what the second gate is for.
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);
    const before = await storedDocument(row.id);

    const result = await edit(row.id, [
      {
        op: "set_notes",
        clip: "Walk",
        notes: [
          { id: "same", pitch: 60, start_tick: 0, duration_tick: MIDI_PPQ },
          { id: "same", pitch: 64, start_tick: MIDI_PPQ, duration_tick: MIDI_PPQ }
        ]
      }
    ]);
    expect(result.failed).toBe(1);
    // The offending note is named, so the caller knows which one to change.
    expect(result.ops[0].error).toContain("same");
    expect(result.ops[0].error).toContain("share the id");

    expect(await storedDocument(row.id)).toEqual(before);
  });

  it("replaces the note list, keeping the ids it was given", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);

    const result = await edit(row.id, [
      {
        op: "set_notes",
        clip: "Walk",
        notes: [
          { id: "kept", pitch: 72, start_tick: 0, duration_tick: MIDI_PPQ * 2 },
          { pitch: 76, start_tick: MIDI_PPQ * 2, duration_tick: MIDI_PPQ * 2 }
        ]
      }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });

    const stored = await storedDocument(row.id);
    const clips = stored["clips"] as { name: string; notes?: unknown[] }[];
    const notes = clips.find((c) => c.name === "Walk")?.notes as
      | { id: string; pitch: number }[]
      | undefined;
    expect(notes).toHaveLength(2);
    expect(notes?.[0]).toMatchObject({ id: "kept", pitch: 72 });
    expect(notes?.[1].id).not.toBe("kept");
  });

  it("sets a midi track's instrument and refuses one on a track that is not midi", async () => {
    const row = await makeTimeline();
    await edit(row.id, [{ op: "add_track", type: "midi", name: "Lead" }]);

    const instrument = { ...DEFAULT_MIDI_INSTRUMENT, waveform: "square" };
    const ok = await edit(row.id, [
      { op: "set_track_instrument", track: "Lead", instrument }
    ]);
    expect(ok).toMatchObject({ applied: 1, failed: 0 });
    expect(
      (await getState(row.id)).tracks.find((t) => t.name === "Lead")?.instrument
    ).toEqual(instrument);

    const refused = await edit(row.id, [
      { op: "set_track_instrument", track: "Music", instrument }
    ]);
    expect(refused.failed).toBe(1);
    expect(refused.ops[0].error).toContain("audio track");
    // The audio track has no instrument to have been given one.
    expect(
      (await getState(row.id)).tracks.find((t) => t.name === "Music")?.instrument
    ).toBeUndefined();
  });

  it("names a voice by preset id and reports which preset the track matches", async () => {
    const row = await makeTimeline();
    await edit(row.id, [{ op: "add_track", type: "midi", name: "Lead" }]);

    const result = await edit(row.id, [
      { op: "set_track_instrument", track: "Lead", instrument: { preset: "bass" } }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });

    // The preset's object is stored, not the id — so the id comes back by
    // sound, and the document plays the same voice if the table ever changes.
    const lead = (await getState(row.id)).tracks.find((t) => t.name === "Lead");
    expect(lead?.instrument).toEqual(findInstrumentPreset("bass")!.instrument);
    expect(lead?.presetId).toBe("bass");
  });

  it("refuses an unknown preset id and lists the ones that exist", async () => {
    const row = await makeTimeline();
    await edit(row.id, [{ op: "add_track", type: "midi", name: "Lead" }]);
    const before = await storedDocument(row.id);

    const result = await edit(row.id, [
      { op: "set_track_instrument", track: "Lead", instrument: { preset: "tuba" } }
    ]);
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("tuba");
    // Every shipped id is named, so the next call is a pick rather than a guess.
    for (const id of ["saw-lead", "square-lead", "soft-pad", "pluck", "bass", "bell"]) {
      expect(result.ops[0].error).toContain(id);
    }
    // The track keeps the voice it had.
    expect(await storedDocument(row.id)).toEqual(before);
  });

  it("transposes a phrase an octave up and holds the top note at 127", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: [
          { id: "low", pitch: 60, start_tick: 0, duration_tick: MIDI_PPQ },
          { id: "high", pitch: 120, start_tick: MIDI_PPQ, duration_tick: MIDI_PPQ }
        ]
      }
    ]);

    const result = await edit(row.id, [
      { op: "transpose_clip", clip: "Walk", semitones: 12 }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(result.ops[0].result).toMatchObject({ noteCount: 2 });

    const stored = await storedDocument(row.id);
    const clips = stored["clips"] as { name: string; notes?: unknown[] }[];
    const notes = clips.find((c) => c.name === "Walk")?.notes as
      | { id: string; pitch: number }[]
      | undefined;
    // 120 + 12 is past the end of the MIDI range, so it is held there rather
    // than dropped — and the ids survive the rewrite either way.
    expect(notes).toEqual([
      expect.objectContaining({ id: "low", pitch: 72 }),
      expect.objectContaining({ id: "high", pitch: 127 })
    ]);
  });

  it("refuses to transpose a clip that is not midi", async () => {
    const row = await makeTimeline();
    const before = await storedDocument(row.id);

    const result = await edit(row.id, [
      { op: "transpose_clip", clip: "Bed", semitones: 5 }
    ]);
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("audio clip");
    expect(await storedDocument(row.id)).toEqual(before);
  });

  it("quantizes to a sixteenth and reports how many notes moved", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 4000,
        name: "Walk",
        notes: [
          // Two notes played late, one already on the grid.
          { id: "a", pitch: 60, start_tick: 10, duration_tick: MIDI_PPQ / 4 },
          { id: "b", pitch: 62, start_tick: 950, duration_tick: MIDI_PPQ / 4 },
          { id: "c", pitch: 64, start_tick: 1920, duration_tick: MIDI_PPQ / 4 }
        ]
      }
    ]);

    const result = await edit(row.id, [
      { op: "quantize_notes", clip: "Walk", division: "1/16" }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(result.ops[0].result).toMatchObject({
      noteCount: 3,
      movedNoteCount: 2
    });

    const stored = await storedDocument(row.id);
    const clips = stored["clips"] as { name: string; notes?: unknown[] }[];
    const notes = clips.find((c) => c.name === "Walk")?.notes as
      | { id: string; startTick: number }[]
      | undefined;
    // 240 ticks to a sixteenth at PPQ 960.
    expect(notes?.map((n) => [n.id, n.startTick])).toEqual([
      ["a", 0],
      ["b", 960],
      ["c", 1920]
    ]);
  });

  it("scales velocities and clamps them to the 1..127 the document stores", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        start_ms: 0,
        duration_ms: 2000,
        name: "Walk",
        notes: [
          { id: "soft", pitch: 60, velocity: 20, start_tick: 0, duration_tick: MIDI_PPQ },
          { id: "loud", pitch: 62, velocity: 100, start_tick: MIDI_PPQ, duration_tick: MIDI_PPQ }
        ]
      }
    ]);

    const result = await edit(row.id, [
      { op: "scale_velocity", clip: "Walk", factor: 2 }
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(result.ops[0].result).toMatchObject({ noteCount: 2 });

    const stored = await storedDocument(row.id);
    const clips = stored["clips"] as { name: string; notes?: unknown[] }[];
    const notes = clips.find((c) => c.name === "Walk")?.notes as
      | { id: string; velocity: number }[]
      | undefined;
    // 200 is past the top of the range, so the phrase flattens rather than
    // storing a velocity no reader accepts.
    expect(notes?.map((n) => [n.id, n.velocity])).toEqual([
      ["soft", 40],
      ["loud", 127]
    ]);
  });

  it("reports each midi clip's start in bars and beats", async () => {
    const row = await makeTimeline();
    await edit(row.id, [
      { op: "add_track", type: "midi", name: "Lead" },
      {
        op: "add_midi_clip",
        track: "Lead",
        // Bar 2 beat 1 at 120 BPM in 4/4: four beats of 500ms.
        start_ms: 2000,
        duration_ms: 2000,
        name: "Walk",
        notes: quarterNotes
      }
    ]);

    const state = await getState(row.id);
    expect(state.clips.find((c) => c.name === "Walk")?.startBarsBeats).toBe("2.1.0");
    // Only a midi clip has a musical position to report.
    expect(state.clips.find((c) => c.name === "Bed")?.startBarsBeats).toBeUndefined();
  });
});

/**
 * What `nodetool timeline debug --interact` replays: the same bridge, driven
 * step by step by tool name, and the document it ends on handed to the same
 * validator the harness runs. The CLI host in `packages/cli` is the loop
 * below plus a file read and a bundle write, and its own suite fakes both the
 * bridge and the validator — so this is where the real pair meet.
 */
describe("timeline debug --interact replay", () => {
  const script = [
    { tool: "ui_timeline_add_track", input: { type: "midi", name: "Lead" } },
    {
      tool: "ui_timeline_add_midi_clip",
      input: {
        track: "Lead",
        start_ms: 0,
        duration_ms: 4000,
        name: "Riff",
        // Played by hand: nothing lands on the grid.
        notes: [
          { pitch: 60, start_tick: 12, duration_tick: 240 },
          { pitch: 63, start_tick: 474, duration_tick: 240 },
          { pitch: 67, start_tick: 951, duration_tick: 240 }
        ]
      }
    },
    {
      tool: "ui_timeline_quantize_notes",
      input: { clip: "Riff", division: "1/16" }
    },
    {
      tool: "ui_timeline_transpose_clip",
      input: { clip: "Riff", semitones: -12 }
    },
    {
      tool: "ui_timeline_set_track_instrument",
      input: { track: "Lead", instrument: { preset: "pluck" } }
    }
  ];

  it("runs the script through and leaves a document the validator passes", async () => {
    const seed = JSON.parse(document()) as {
      tracks: never[];
      clips: never[];
      markers: never[];
    };
    const bridge = createTimelineToolBridge({
      fps: 30,
      width: 1920,
      height: 1080,
      sequence: { fps: 30, width: 1920, height: 1080, ...seed }
    });
    const byName = new Map(bridge.tools.map((t) => [t.name, t]));

    const results: unknown[] = [];
    for (const step of script) {
      const tool = byName.get(step.tool);
      expect(tool, `bridge is missing ${step.tool}`).toBeDefined();
      results.push(await tool!.execute(step.input));
    }

    expect(results[2]).toMatchObject({ noteCount: 3, movedNoteCount: 3 });
    expect(results[3]).toMatchObject({ noteCount: 3 });

    const state = bridge.finalState();
    const riff = state.documentClips.find((c) => c.name === "Riff");
    expect(riff?.notes?.map((n) => [n.pitch, n.startTick])).toEqual([
      [48, 0],
      [51, 480],
      [55, 960]
    ]);
    expect(
      findInstrumentPreset("pluck")!.instrument
    ).toEqual(state.documentTracks.find((t) => t.name === "Lead")?.instrument);

    const validation = validateTimelineSequence(
      {
        tracks: state.documentTracks,
        clips: state.documentClips,
        markers: state.markers,
        tempo: state.tempo
      },
      { fps: 30, width: 1920, height: 1080 }
    );
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
    expect(validation.ok).toBe(true);
  });
});
