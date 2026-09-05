/**
 * audition — one note through the track's voice, for previewing an instrument.
 *
 * Same renderer as playback, so what an audition sounds like is what the clip
 * will sound like. It runs on its own short-lived context rather than the
 * preview's: an audition must be audible while the timeline is paused, and it
 * must never join the mix the export reads.
 */

import { renderAuditionNote } from "@nodetool-ai/timeline";
import type { MidiInstrument } from "@nodetool-ai/timeline";

/** How long the auditioned note is held before its release. */
export const AUDITION_NOTE_MS = 600;
/** Middle C — what an audition plays when the caller names no pitch. */
export const AUDITION_DEFAULT_PITCH = 60;
const AUDITION_DEFAULT_VELOCITY = 100;

/**
 * Play one note with `instrument`. Resolves once the note is scheduled, not
 * once it has finished sounding.
 *
 * `contextFactory` exists for tests; production passes nothing and gets a real
 * `AudioContext`.
 */
export async function playAuditionNote(
  instrument: MidiInstrument,
  pitch: number = AUDITION_DEFAULT_PITCH,
  velocity: number = AUDITION_DEFAULT_VELOCITY,
  contextFactory: () => BaseAudioContext = () => new AudioContext()
): Promise<void> {
  const ctx = contextFactory();
  // jsdom (and any host without Web Audio) defines no `AudioContext`, so the
  // constructor is checked for existence before it is used as a type guard.
  const isLive =
    typeof AudioContext !== "undefined" && ctx instanceof AudioContext;
  if (isLive) {
    await (ctx as AudioContext).resume();
  }
  const samples = renderAuditionNote({
    pitch,
    velocity,
    durationMs: AUDITION_NOTE_MS,
    instrument,
    sampleRate: ctx.sampleRate
  });
  const buffer = ctx.createBuffer(1, Math.max(1, samples.length), ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  // Close the context once the note has rung out, so repeated auditions do not
  // leak one AudioContext each (browsers cap how many a page may hold).
  source.onended = () => {
    if (isLive) void (ctx as AudioContext).close();
  };
  source.start();
}
