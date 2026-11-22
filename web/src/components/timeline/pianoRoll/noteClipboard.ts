import { createTimeOrderedUuid, validateNotes } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";

const FORMAT = "nodetool-midi-notes";
/** Version 2 keeps every note field. Version 1 held pitch, velocity and ticks only. */
const VERSION = 2;
type CopiedNote = Omit<MidiNote, "id">;

export function encodeNoteClipboard(notes: readonly MidiNote[]): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    notes: notes.map(({ id: _id, ...note }) => {
      void _id;
      return note;
    })
  });
}

/** Whether a pasted note is storable. The checks come from the document's own validator. */
function isValidNote(note: unknown): note is CopiedNote {
  if (!note || typeof note !== "object") return false;
  const candidate = note as CopiedNote;
  if (!Number.isSafeInteger(candidate.startTick) || !Number.isSafeInteger(candidate.durationTick)) {
    return false;
  }
  return validateNotes([{ ...candidate, id: "paste" }]).length === 0;
}

export function decodeNoteClipboard(text: string): CopiedNote[] | null {
  try {
    const value = JSON.parse(text);
    if (
      value?.format !== FORMAT ||
      (value.version !== 1 && value.version !== VERSION) ||
      !Array.isArray(value.notes) ||
      value.notes.length === 0
    ) {
      return null;
    }
    if (!value.notes.every(isValidNote)) return null;
    return value.notes.map((note: CopiedNote) => {
      const { id: _id, ...rest } = note as MidiNote;
      void _id;
      if (value.version === 1) {
        const { pitch, velocity, startTick, durationTick } = rest;
        return { pitch, velocity, startTick, durationTick };
      }
      return rest;
    });
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
