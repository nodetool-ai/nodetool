/**
 * Note on/off events on the timeline clock, for hosts that play a midi clip
 * through a live instrument instead of a pre-rendered buffer.
 */

import type { TimelineClip } from "../types.js";
import { expandMidiLoop } from "../clipLoop.js";
import { playableNotes } from "./notes.js";
import { noteWindowMs } from "./ticks.js";

export interface MidiClipNoteEvent {
  /** Timeline position in milliseconds. */
  timeMs: number;
  pitch: number;
  /** 1..127 for a note-on. For a note-off, the note's `releaseVelocity`, or 0. */
  velocity: number;
  on: boolean;
  /** MIDI channel 0..15. */
  channel: number;
}

/**
 * The note-ons and note-offs `clip` plays, in timeline milliseconds and in
 * playback order. A note is played only when its onset falls inside the
 * clip's window (as `renderMidiClip` decides) and at or after `fromMs`, so a
 * play gesture that starts mid-note does not strike it late. A note-off is
 * clamped to the clip's end. At equal times note-offs come first, so a note
 * repeated back to back is released before it is struck again. A muted note
 * emits nothing. Controller lanes are `midiClipControllerEvents`.
 */
export function midiClipNoteEvents(
  source: Pick<
    TimelineClip,
    "notes" | "inPointMs" | "durationMs" | "startMs" | "loopLengthMs"
  >,
  bpm: number,
  fromMs = Number.NEGATIVE_INFINITY
): MidiClipNoteEvent[] {
  const clip = expandMidiLoop(source, bpm);
  const windowStartMs = clip.inPointMs ?? 0;
  const clipEndMs = clip.startMs + clip.durationMs;
  const events: MidiClipNoteEvent[] = [];
  for (const note of playableNotes(clip, bpm)) {
    const { startMs, endMs } = noteWindowMs(note, bpm);
    const onMs = clip.startMs + startMs - windowStartMs;
    if (onMs < fromMs) continue;
    const offMs = Math.max(
      onMs,
      Math.min(clipEndMs, clip.startMs + endMs - windowStartMs)
    );
    const channel = note.channel ?? 0;
    events.push({
      timeMs: onMs,
      pitch: note.pitch,
      velocity: note.velocity,
      on: true,
      channel
    });
    events.push({
      timeMs: offMs,
      pitch: note.pitch,
      velocity: note.releaseVelocity ?? 0,
      on: false,
      channel
    });
  }
  return events.sort(
    (a, b) => a.timeMs - b.timeMs || Number(a.on) - Number(b.on)
  );
}
