/**
 * Note on/off events on the timeline clock, for hosts that play a midi clip
 * through a live instrument instead of a pre-rendered buffer.
 */

import type { TimelineClip } from "../types.js";
import { visibleNotes } from "./notes.js";
import { noteWindowMs } from "./ticks.js";

export interface MidiClipNoteEvent {
  /** Timeline position in milliseconds. */
  timeMs: number;
  pitch: number;
  /** 1..127 for a note-on, 0 for a note-off. */
  velocity: number;
  on: boolean;
}

/**
 * The note-ons and note-offs `clip` plays, in timeline milliseconds and in
 * playback order. A note is played only when its onset falls inside the
 * clip's window (as `renderMidiClip` decides) and at or after `fromMs`, so a
 * play gesture that starts mid-note does not strike it late. A note-off is
 * clamped to the clip's end. At equal times note-offs come first, so a note
 * repeated back to back is released before it is struck again.
 */
export function midiClipNoteEvents(
  clip: Pick<TimelineClip, "notes" | "inPointMs" | "durationMs" | "startMs">,
  bpm: number,
  fromMs = Number.NEGATIVE_INFINITY
): MidiClipNoteEvent[] {
  const windowStartMs = clip.inPointMs ?? 0;
  const clipEndMs = clip.startMs + clip.durationMs;
  const events: MidiClipNoteEvent[] = [];
  for (const note of visibleNotes(clip, bpm)) {
    const { startMs, endMs } = noteWindowMs(note, bpm);
    const onMs = clip.startMs + startMs - windowStartMs;
    if (onMs < fromMs) continue;
    const offMs = Math.max(
      onMs,
      Math.min(clipEndMs, clip.startMs + endMs - windowStartMs)
    );
    events.push({ timeMs: onMs, pitch: note.pitch, velocity: note.velocity, on: true });
    events.push({ timeMs: offMs, pitch: note.pitch, velocity: 0, on: false });
  }
  return events.sort(
    (a, b) => a.timeMs - b.timeMs || Number(a.on) - Number(b.on)
  );
}
