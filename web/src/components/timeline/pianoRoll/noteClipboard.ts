import { createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";

const FORMAT = "nodetool-midi-notes";
type CopiedNote = Omit<MidiNote, "id">;

export function encodeNoteClipboard(notes: readonly MidiNote[]): string {
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    notes: notes.map(({ pitch, velocity, startTick, durationTick }) => ({
      pitch, velocity, startTick, durationTick
    }))
  });
}

export function decodeNoteClipboard(text: string): CopiedNote[] | null {
  try {
    const value = JSON.parse(text);
    if (value?.format !== FORMAT || value.version !== 1 ||
      !Array.isArray(value.notes) || value.notes.length === 0) return null;
    if (!value.notes.every((note: CopiedNote) => note &&
      Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127 &&
      Number.isInteger(note.velocity) && note.velocity >= 1 && note.velocity <= 127 &&
      Number.isSafeInteger(note.startTick) && note.startTick >= 0 &&
      Number.isSafeInteger(note.durationTick) && note.durationTick > 0)) return null;
    return value.notes.map(({ pitch, velocity, startTick, durationTick }: CopiedNote) => ({
      pitch, velocity, startTick, durationTick
    }));
  } catch {
    return null;
  }
}

export function pasteNotes(notes: readonly CopiedNote[], atTick: number): MidiNote[] {
  const firstTick = notes.reduce((start, note) => Math.min(start, note.startTick), Infinity);
  const offset = Math.max(0, Math.round(atTick)) - firstTick;
  return notes.map(note => ({
    ...note,
    id: createTimeOrderedUuid(),
    startTick: note.startTick + offset
  }));
}
