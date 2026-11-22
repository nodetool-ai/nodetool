/**
 * Chord preview for the Edit Chord picker: the chord's notes as a short,
 * quiet sine pad through the browser's audio output.
 */

import { chordNotes, type TimelineChord } from "@nodetool-ai/timeline";

/** MIDI note the preview voicing is built up from (C3). */
const PREVIEW_BASE_NOTE = 48;
const PREVIEW_SECONDS = 0.9;
const PREVIEW_GAIN = 0.08;

let context: AudioContext | null = null;

/** Play `chord` once. A browser without Web Audio stays silent. */
export function previewChord(chord: Pick<TimelineChord, "root" | "quality" | "inversion">): void {
  if (typeof AudioContext === "undefined") return;
  context ??= new AudioContext();
  const ctx = context;
  void ctx.resume();
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(PREVIEW_GAIN, now + 0.02);
  out.gain.exponentialRampToValueAtTime(0.0001, now + PREVIEW_SECONDS);
  out.connect(ctx.destination);
  for (const note of chordNotes(chord, PREVIEW_BASE_NOTE)) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    osc.connect(out);
    osc.start(now);
    osc.stop(now + PREVIEW_SECONDS);
  }
}
