/**
 * The six midi rules, each with the fixture that fires it and the control it
 * must stay quiet on (I12).
 *
 * The split follows the rest of the catalog. Placement, an unplayable note
 * list and a retimed midi clip are errors — each is silence, or a document no
 * reader can honour. A clip whose window plays nothing and a document with
 * midi but no stored tempo are warnings: both load and both play, just not the
 * way their author meant.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const PPQ = 960;

const track = (over: Json): Json => ({
  name: "Track",
  type: "video",
  index: 0,
  visible: true,
  locked: false,
  ...over
});

const clip = (over: Json): Json => ({
  name: "Clip",
  startMs: 0,
  durationMs: 2000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const note = (over: Json = {}): Json => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: PPQ,
  ...over
});

const tempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};

const doc = (tracks: Json[], clips: Json[], over: Json = {}): Json => ({
  tracks,
  clips,
  markers: [],
  ...over
});

/** A midi track, a midi clip on it, and a stored tempo — nothing to report. */
const soundDoc = (clipOver: Json = {}, docOver: Json = {}): Json =>
  doc(
    [track({ id: "t-midi", name: "Lead", type: "midi", index: 1 })],
    [
      clip({
        id: "c-midi",
        trackId: "t-midi",
        name: "Walk",
        mediaType: "midi",
        notes: [note()],
        ...clipOver
      })
    ],
    { tempo, ...docOver }
  );

const codesOf = (issues: ReadonlyArray<{ code: string }>): string[] =>
  issues.map((issue) => issue.code);

describe("validateTimelineSequence — midi placement", () => {
  it("passes a midi clip on a midi track with a stored tempo", () => {
    const result = validateTimelineSequence(soundDoc());
    expect(codesOf(result.errors)).toEqual([]);
    expect(codesOf(result.warnings)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports midi_clip_off_midi_track for notes on an audio track", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t-audio", name: "Music", type: "audio" })],
        [
          clip({
            id: "c",
            trackId: "t-audio",
            name: "Walk",
            mediaType: "midi",
            notes: [note()]
          })
        ],
        { tempo }
      )
    );
    const issue = result.errors.find(
      (e) => e.code === "midi_clip_off_midi_track"
    );
    expect(issue?.message).toContain("audio track");
    expect(issue?.clipId).toBe("c");
    expect(issue?.path).toBe("trackId");
    expect(result.ok).toBe(false);
  });

  it("stays quiet about a track the document does not declare", () => {
    // Already `clip_track_missing`; naming it twice helps nobody.
    const result = validateTimelineSequence(
      doc(
        [],
        [
          clip({
            id: "c",
            trackId: "gone",
            mediaType: "midi",
            notes: [note()]
          })
        ],
        { tempo }
      )
    );
    expect(codesOf(result.errors)).toContain("clip_track_missing");
    expect(codesOf(result.errors)).not.toContain("midi_clip_off_midi_track");
  });

  it("reports non_midi_clip_on_midi_track for picture on a midi track", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t-midi", name: "Lead", type: "midi" })],
        [clip({ id: "c", trackId: "t-midi", name: "Shot", mediaType: "video" })],
        { tempo }
      )
    );
    const issue = result.errors.find(
      (e) => e.code === "non_midi_clip_on_midi_track"
    );
    expect(issue?.message).toContain("video clip on a midi track");
    expect(issue?.clipId).toBe("c");
    expect(result.ok).toBe(false);
  });
});

describe("validateTimelineSequence — midi notes", () => {
  it("reports midi_notes_invalid once per problem, naming the note", () => {
    const result = validateTimelineSequence(
      soundDoc({
        notes: [
          note({ id: "dup", startTick: 0 }),
          note({ id: "dup", startTick: PPQ }),
          note({ id: "also", startTick: PPQ * 2 }),
          note({ id: "also", startTick: PPQ * 3 })
        ]
      })
    );
    const found = result.errors.filter((e) => e.code === "midi_notes_invalid");
    expect(found).toHaveLength(2);
    expect(found[0].message).toContain('note "dup"');
    expect(found[0].path).toBe("notes[1]");
    expect(found[1].message).toContain('note "also"');
    expect(found[1].path).toBe("notes[3]");
    expect(result.ok).toBe(false);
  });

  it("catches a fractional tick at the schema, before the note rules run", () => {
    // The per-field bounds — pitch, velocity, integer ticks, the note cap —
    // are all on the schema, so a document carrying one fails to parse and
    // `midi_notes_invalid` never sees it. Duplicate ids are the problem only a
    // whole-list check can find, which is why the rule exists at all.
    const result = validateTimelineSequence(
      soundDoc({ notes: [note({ startTick: 12.5 })] })
    );
    expect(codesOf(result.errors)).toEqual(["schema_invalid"]);
    expect(result.errors[0].message).toContain("startTick");
  });

  it("stays quiet on a note list every rule accepts", () => {
    const result = validateTimelineSequence(
      soundDoc({
        durationMs: 2000,
        notes: [0, 1, 2, 3].map((i) =>
          note({ id: `n${i}`, pitch: 60 + i, startTick: i * PPQ })
        )
      })
    );
    expect(codesOf(result.errors)).toEqual([]);
    expect(codesOf(result.warnings)).toEqual([]);
  });
});

describe("validateTimelineSequence — midi retiming", () => {
  it.each([
    ["speedMultiplier", { speedMultiplier: 2 }],
    ["speedBaked", { speedBaked: true }],
    [
      "timeRemap",
      {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 2000 }
          ]
        }
      }
    ]
  ])("reports midi_clip_retimed for %s", (_name, over) => {
    const result = validateTimelineSequence(soundDoc(over));
    const issue = result.errors.find((e) => e.code === "midi_clip_retimed");
    expect(issue?.clipId).toBe("c-midi");
    expect(issue?.message).toContain("set_tempo");
    expect(result.ok).toBe(false);
  });

  it("accepts speedMultiplier 1, which is what an untouched clip carries", () => {
    const result = validateTimelineSequence(soundDoc({ speedMultiplier: 1 }));
    expect(codesOf(result.errors)).not.toContain("midi_clip_retimed");
  });

  it("leaves a retimed clip that is not midi alone", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t", name: "Picture", type: "video" })],
        [clip({ id: "c", trackId: "t", speedMultiplier: 2 })]
      )
    );
    expect(codesOf(result.errors)).not.toContain("midi_clip_retimed");
  });
});

describe("validateTimelineSequence — silence and tempo", () => {
  it("warns midi_clip_silent when no note starts inside the window", () => {
    // The window is the second bar of content; the only note is in the first.
    const result = validateTimelineSequence(
      soundDoc({ inPointMs: 2000, durationMs: 2000, notes: [note()] })
    );
    const issue = result.warnings.find((w) => w.code === "midi_clip_silent");
    expect(issue?.message).toContain("2000–4000ms");
    expect(issue?.clipId).toBe("c-midi");
    // A warning: the document still loads and everything else still plays.
    expect(result.ok).toBe(true);
  });

  it("warns midi_clip_silent for a clip carrying no notes at all", () => {
    const result = validateTimelineSequence(soundDoc({ notes: [] }));
    const issue = result.warnings.find((w) => w.code === "midi_clip_silent");
    expect(issue?.message).toContain("carries no notes");
  });

  it("stays quiet when a note starts inside the window", () => {
    const result = validateTimelineSequence(
      soundDoc({ inPointMs: 0, durationMs: 500, notes: [note()] })
    );
    expect(codesOf(result.warnings)).not.toContain("midi_clip_silent");
  });

  it("warns midi_tempo_missing when a midi track has no stored tempo", () => {
    const result = validateTimelineSequence(soundDoc({}, { tempo: undefined }));
    const issue = result.warnings.find((w) => w.code === "midi_tempo_missing");
    expect(issue?.message).toContain("120 BPM");
    expect(issue?.path).toBe("tempo");
    expect(result.ok).toBe(true);
  });

  it("warns midi_tempo_missing for a midi clip even with no midi track", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t-audio", name: "Music", type: "audio" })],
        [
          clip({
            id: "c",
            trackId: "t-audio",
            mediaType: "midi",
            notes: [note()]
          })
        ]
      )
    );
    expect(codesOf(result.warnings)).toContain("midi_tempo_missing");
  });

  it("stays quiet about tempo on a document with no midi in it", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t", name: "Picture", type: "video" })],
        [clip({ id: "c", trackId: "t" })]
      )
    );
    expect(codesOf(result.warnings)).not.toContain("midi_tempo_missing");
  });
});

describe("validateTimelineSequence — visual checks skip midi tracks", () => {
  it("does not contest z-order between a midi track and a visual one", () => {
    const result = validateTimelineSequence(
      doc(
        [
          track({ id: "t-video", name: "Picture", type: "video", index: 0 }),
          track({ id: "t-midi", name: "Lead", type: "midi", index: 0 })
        ],
        [
          clip({ id: "c-video", trackId: "t-video" }),
          clip({
            id: "c-midi",
            trackId: "t-midi",
            mediaType: "midi",
            notes: [note()]
          })
        ],
        { tempo }
      )
    );
    expect(codesOf(result.warnings)).not.toContain("duplicate_track_index");
  });

  it("says overlapping midi phrases sum rather than cross-fade", () => {
    const result = validateTimelineSequence(
      doc(
        [track({ id: "t-midi", name: "Lead", type: "midi" })],
        [
          clip({
            id: "a",
            trackId: "t-midi",
            name: "A",
            mediaType: "midi",
            startMs: 0,
            durationMs: 2000,
            notes: [note()]
          }),
          clip({
            id: "b",
            trackId: "t-midi",
            name: "B",
            mediaType: "midi",
            startMs: 1000,
            durationMs: 2000,
            notes: [note({ id: "n2" })]
          })
        ],
        { tempo }
      )
    );
    const issue = result.warnings.find((w) => w.code === "clips_overlap");
    expect(issue?.message).toContain("notes sum");
    expect(issue?.message).not.toContain("cross-fade");
  });

  it("never counts a midi clip against the video layer cap", () => {
    // Twelve overlapping midi clips: not one of them reaches the compositor.
    const clips = Array.from({ length: 12 }, (_, i) =>
      clip({
        id: `c${i}`,
        trackId: "t-midi",
        name: `P${i}`,
        mediaType: "midi",
        startMs: 0,
        durationMs: 2000,
        notes: [note({ id: `n${i}` })]
      })
    );
    const result = validateTimelineSequence(
      doc([track({ id: "t-midi", name: "Lead", type: "midi" })], clips, {
        tempo
      })
    );
    expect(codesOf(result.warnings)).not.toContain("layer_cap_exceeded");
  });
});
