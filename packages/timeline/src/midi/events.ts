/**
 * Note on/off events on the timeline clock, for hosts that play a midi clip
 * through a live instrument instead of a pre-rendered buffer.
 */

import type { MidiInstrument, TimelineClip } from "../types.js";
import type { MidiRegionKeys } from "./regionParams.js";
import { expandMidiLoop, type ExpandMidiPatternDoc } from "../clipLoop.js";
import { expressionValueAt } from "./controllers.js";
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
  /** Initial per-note pitch bend in semitones from `note.expression.pitch` (SQ42, D90). */
  pitchOffset?: number;
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
    "notes" | "inPointMs" | "durationMs" | "startMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "pattern" | "patternPhaseTicks" | "patternRowCycles">,
  bpm: number,
  fromMs = Number.NEGATIVE_INFINITY,
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. */
  gridOffsetMs = 0,
  instrument?: MidiInstrument,
  patternDoc?: ExpandMidiPatternDoc
): MidiClipNoteEvent[] {
  const clip = expandMidiLoop(source, bpm, gridOffsetMs, instrument, patternDoc);
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
    // A note with no length inside the clip (it starts on the last instant)
    // sounds nothing, and an off before its on would leave it held.
    if (offMs <= onMs) continue;
    const channel = note.channel ?? 0;
    const pitchOffset = expressionValueAt(note.expression?.pitch, 0, 0);
    const onEvent: MidiClipNoteEvent = {
      timeMs: onMs,
      pitch: note.pitch,
      velocity: note.velocity,
      on: true,
      channel
    };
    if (pitchOffset !== 0) onEvent.pitchOffset = pitchOffset;
    events.push(onEvent);
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
