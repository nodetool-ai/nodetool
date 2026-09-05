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
import {
  MIDI_MAX_NOTES_PER_CLIP as PROTOCOL_MAX_NOTES,
  midiInstrument,
  midiNote,
  timelineTempo,
  type MidiInstrument as ProtocolMidiInstrument,
  type MidiNote as ProtocolMidiNote,
  type TimelineTempo as ProtocolTimelineTempo
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { MIDI_MAX_NOTES_PER_CLIP } from "../src/midi/notes.js";
import type { MidiInstrument, MidiNote, TimelineTempo } from "../src/types.js";

// Both directions: a field on one side and not the other breaks compilation.
const noteThere: ProtocolMidiNote = {
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 960
} satisfies MidiNote;
const noteBack: MidiNote = noteThere;

const instrumentThere: ProtocolMidiInstrument =
  DEFAULT_MIDI_INSTRUMENT satisfies MidiInstrument;
const instrumentBack: MidiInstrument = instrumentThere;

const tempoThere: ProtocolTimelineTempo = DEFAULT_TEMPO satisfies TimelineTempo;
const tempoBack: TimelineTempo = tempoThere;

describe("midi types match the protocol schemas", () => {
  it("parses the engine's own values through the protocol schemas", () => {
    expect(midiNote.parse(noteBack)).toEqual(noteThere);
    expect(midiInstrument.parse(instrumentBack)).toEqual(instrumentThere);
    expect(timelineTempo.parse(tempoBack)).toEqual(tempoThere);
  });

  it("keeps the note cap the same on both sides", () => {
    expect(MIDI_MAX_NOTES_PER_CLIP).toBe(PROTOCOL_MAX_NOTES);
  });
});
