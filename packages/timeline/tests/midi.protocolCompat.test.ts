/**
 * `types.ts` spells the midi types out rather than importing them, for the
 * same reason it spells every other document type out: the package root has no
 * runtime dependencies and `@nodetool-ai/protocol`'s schemas are values.
 *
 * That leaves nothing to stop the two from drifting, so this file assigns each
 * type to the other in both directions — a field added to one and not the
 * other fails to compile here.
 */

import { describe, expect, it } from "vitest";
import { QUANTIZE_DIVISION_VALUES } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  MIDI_MAX_NOTES_PER_CLIP as PROTOCOL_MAX_NOTES,
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP as PROTOCOL_MAX_LANES,
  MIDI_MAX_POINTS_PER_LANE as PROTOCOL_MAX_POINTS,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE as PROTOCOL_MAX_EXPRESSION_POINTS,
  MIDI_PITCH_BEND_RANGE_SEMITONES as PROTOCOL_BEND_RANGE,
  midiControllerLane,
  type MidiControllerLane as ProtocolMidiControllerLane,
  chordQuality,
  clipHarmony,
  timelineChord,
  timelineClip,
  timelineTrack,
  type ClipHarmony as ProtocolClipHarmony,
  type TimelineChord as ProtocolTimelineChord,
  midiInstrument,
  midiNote,
  timelineTempo,
  type MidiInstrument as ProtocolMidiInstrument,
  type MidiNote as ProtocolMidiNote,
  type TimelineTempo as ProtocolTimelineTempo
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import { MIDI_INSTRUMENT_PRESETS } from "../src/midi/presets.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { MIDI_MAX_NOTES_PER_CLIP } from "../src/midi/notes.js";
import {
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  MIDI_MAX_POINTS_PER_LANE,
  MIDI_PITCH_BEND_RANGE_SEMITONES
} from "../src/midi/controllers.js";
import { QUANTIZE_DIVISIONS } from "../src/midi/edit.js";
import { CHORD_QUALITY_IDS } from "../src/harmony/chords.js";
import { DEFAULT_CLIP_HARMONY } from "../src/harmony/expand.js";
import { SCALE_IDS } from "../src/harmony/scales.js";
import type {
  ClipHarmony,
  MidiControllerLane,
  MidiInstrument,
  MidiNote,
  TimelineChord,
  TimelineTempo
} from "../src/types.js";

// Both directions: a field on one side and not the other breaks compilation.
const noteThere: ProtocolMidiNote = {
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 960
} satisfies MidiNote;
const noteBack: MidiNote = noteThere;

const fullNoteThere: ProtocolMidiNote = {
  ...noteThere,
  muted: true,
  channel: 15,
  releaseVelocity: 0,
  expression: {
    pitch: [{ tick: 0, value: -48 }],
    volume: [{ tick: 960, value: 4 }],
    pan: [{ tick: 0, value: -1 }],
    brightness: [{ tick: 0, value: 0.5 }]
  }
} satisfies MidiNote;
const fullNoteBack: MidiNote = fullNoteThere;

const laneThere: ProtocolMidiControllerLane = {
  id: "l1",
  kind: "pitchBend",
  channel: 2,
  interpolation: "step",
  points: [{ id: "p1", tick: 0, value: -8192 }]
} satisfies MidiControllerLane;
const laneBack: MidiControllerLane = laneThere;

const instrumentThere: ProtocolMidiInstrument =
  DEFAULT_MIDI_INSTRUMENT satisfies MidiInstrument;
const instrumentBack: MidiInstrument = instrumentThere;

const tempoThere: ProtocolTimelineTempo = DEFAULT_TEMPO satisfies TimelineTempo;
const tempoBack: TimelineTempo = tempoThere;

const chordThere: ProtocolTimelineChord = {
  id: "ch1",
  startTick: 0,
  durationTick: 3840,
  root: 9,
  quality: "m7",
  inversion: 1
} satisfies TimelineChord;
const chordBack: TimelineChord = chordThere;

const harmonyThere: ProtocolClipHarmony = {
  ...DEFAULT_CLIP_HARMONY,
  chordTrackId: "chords",
  scaleKey: 9
} satisfies ClipHarmony;
const harmonyBack: ClipHarmony = harmonyThere;

describe("midi types match the protocol schemas", () => {
  it("parses the engine's own values through the protocol schemas", () => {
    expect(midiNote.parse(noteBack)).toEqual(noteThere);
    expect(midiInstrument.parse(instrumentBack)).toEqual(instrumentThere);
    expect(timelineTempo.parse(tempoBack)).toEqual(tempoThere);
  });

  // The presets are the only place every branch of the instrument union is
  // spelled out, so parsing them is what keeps the instrument variants in step with
  // the schema that stores and validates them.
  it.each(MIDI_INSTRUMENT_PRESETS.map((p) => [p.id, p] as const))(
    "parses the %s preset through the protocol schema",
    (_id, presetEntry) => {
      const there: ProtocolMidiInstrument =
        presetEntry.instrument satisfies MidiInstrument;
      expect(midiInstrument.parse(there)).toEqual(presetEntry.instrument);
    }
  );

  it("covers every instrument type with a preset", () => {
    expect(
      new Set(MIDI_INSTRUMENT_PRESETS.map((p) => p.instrument.type))
    ).toEqual(new Set(["subtractive", "wavetable", "bass", "drum", "sampler", "vst"]));
  });

  it("parses chord tracks and clip harmony through the protocol schemas", () => {
    expect(timelineChord.parse(chordBack)).toEqual(chordThere);
    expect(clipHarmony.parse(harmonyBack)).toEqual(harmonyThere);
    expect(clipHarmony.parse({ style: "comp", input: "notes" })).toEqual({ style: "comp", input: "notes" });
    const track = timelineTrack.parse({
      id: "chords", name: "Chords", type: "chord", index: 0, visible: true, locked: false, chords: [chordBack]
    });
    expect(track.chords).toEqual([chordThere]);
    const clip = timelineClip.parse({
      id: "c", trackId: "m", name: "Arp", startMs: 0, durationMs: 2000, mediaType: "midi",
      sourceType: "imported", status: "draft", versions: [], locked: false, harmony: harmonyBack
    });
    expect(clip.harmony).toEqual(harmonyThere);
  });

  it("keeps the chord qualities and scales the same on both sides", () => {
    expect([...chordQuality.options]).toEqual(CHORD_QUALITY_IDS);
    expect(clipHarmony.shape.scaleType.unwrap().options).toEqual(["auto", ...SCALE_IDS]);
  });

  it("parses the controller lanes and the new note fields", () => {
    expect(midiNote.parse(fullNoteBack)).toEqual(fullNoteThere);
    expect(midiControllerLane.parse(laneBack)).toEqual(laneThere);
  });

  it("keeps the controller limits the same on both sides", () => {
    expect(MIDI_MAX_CONTROLLER_LANES_PER_CLIP).toBe(PROTOCOL_MAX_LANES);
    expect(MIDI_MAX_POINTS_PER_LANE).toBe(PROTOCOL_MAX_POINTS);
    expect(MIDI_MAX_EXPRESSION_POINTS_PER_NOTE).toBe(PROTOCOL_MAX_EXPRESSION_POINTS);
    expect(MIDI_PITCH_BEND_RANGE_SEMITONES).toBe(PROTOCOL_BEND_RANGE);
  });

  it("keeps the note cap the same on both sides", () => {
    expect(MIDI_MAX_NOTES_PER_CLIP).toBe(PROTOCOL_MAX_NOTES);
  });

  // The quantize grids are duplicated in protocol for the same reason the
  // types are: this package depends on that one, not the other way round.
  it("keeps the quantize divisions the same on both sides", () => {
    expect([...QUANTIZE_DIVISIONS]).toEqual([...QUANTIZE_DIVISION_VALUES]);
  });
});
