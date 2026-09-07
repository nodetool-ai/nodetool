/**
 * BL-1 — the acid bassline voice, ported from FableSynth's
 * `src/bass/engine/worklet-bass.js` (github.com/georgi/fablesynth).
 *
 * One wavetable oscillator and a sub through a resonant filter with its own
 * decay envelope. Monophonic on purpose: that is what makes the two things a
 * 303 line is written with work — an accented note (velocity at or above
 * `accentVelocity`) hits harder and opens the filter further, and a note that
 * starts before the one before it ends glides into pitch instead of
 * retriggering.
 *
 * Not ported: the plugin's sequencer, its LFO and its FX rack.
 */

import type { BassMidiInstrument } from "../../types.js";
import {
  AdEnvelope,
  Adsr,
  AdaaDrive,
  StateVariableFilter,
  TableOscillator,
  pitchHz
} from "./dsp.js";

export interface BassVoiceEvent {
  pitch: number;
  velocity: number;
  startFrame: number;
  gateOffFrame: number;
}

/** The state one BL-1 note leaves behind for the note that slides into it. */
interface BassNote {
  event: BassVoiceEvent;
  slide: boolean;
}

/**
 * Group the events into the order a mono voice plays them: sorted by onset,
 * and each note marked as sliding when it starts before its predecessor's
 * gate closes.
 *
 * "Predecessor" is the note that held the voice, not the longest note so far.
 * The voice is monophonic, so a short note takes it over from a long one and
 * releases on its own gate — measured against the longest gate seen, a later
 * note would be called a slide into an envelope that had already finished, and
 * `renderBassVoices` would render it as silence. Read this way a slide always
 * starts while its predecessor is still gated, and a gated envelope is never
 * released, so an inherited one is always live.
 */
function monoOrder(events: ReadonlyArray<BassVoiceEvent>): BassNote[] {
  const sorted = [...events].sort(
    (a, b) => a.startFrame - b.startFrame || a.pitch - b.pitch
  );
  const notes: BassNote[] = [];
  let previousGateOff = -1;
  for (const event of sorted) {
    // A note landing on the same frame as the last one is a chord the mono
    // voice cannot play: the later pitch wins, as it does on the hardware.
    if (notes.length > 0 && event.startFrame === notes[notes.length - 1].event.startFrame) {
      notes[notes.length - 1] = { event, slide: notes[notes.length - 1].slide };
      previousGateOff = event.gateOffFrame;
      continue;
    }
    notes.push({ event, slide: event.startFrame < previousGateOff });
    previousGateOff = event.gateOffFrame;
  }
  return notes;
}

/**
 * Render every note of a BL-1 part into `out`. One voice walks the whole
 * buffer, so a slide carries the oscillator's phase and the filter's state
 * across the note boundary rather than starting again.
 *
 * Returns true if the voice was still sounding at the last frame.
 */
export function renderBassVoices(
  out: Float32Array,
  events: ReadonlyArray<BassVoiceEvent>,
  instrument: BassMidiInstrument,
  sampleRate: number
): boolean {
  const notes = monoOrder(events);
  if (notes.length === 0 || out.length === 0) return false;

  const osc = new TableOscillator(instrument.table, 1, 0);
  const filter = new StateVariableFilter();
  const drive = new AdaaDrive();
  const subGain = instrument.subLevel * instrument.subLevel;
  const slideCoeff =
    instrument.slideMs > 0
      ? 1 - Math.exp(-1 / ((instrument.slideMs / 1000) * sampleRate))
      : 1;

  let subPhase = 0;
  let glidePitch = notes[0].event.pitch + instrument.semitones;
  let ampEnv = new Adsr(instrument.ampEnv, sampleRate);
  let filterEnv = new AdEnvelope(
    instrument.filterAttackMs,
    instrument.filterDecayMs,
    sampleRate
  );

  for (let i = 0; i < notes.length; i++) {
    const { event, slide } = notes[i];
    const startFrame = Math.max(0, event.startFrame);
    if (startFrame >= out.length) break;
    // The voice is mono: the next note takes it over, gate or no gate.
    const next = notes[i + 1];
    const endFrame = Math.min(
      out.length,
      next ? Math.max(startFrame, next.event.startFrame) : out.length
    );

    const accented = event.velocity >= instrument.accentVelocity;
    const accent = accented ? instrument.accentAmount : 0;
    // A slide is one long note whose pitch moves: the envelopes keep running,
    // which is what makes a slid step legato instead of a new attack.
    if (!slide) {
      ampEnv = new Adsr(instrument.ampEnv, sampleRate);
      filterEnv = new AdEnvelope(
        instrument.filterAttackMs,
        // An accent shortens the filter decay as well as deepening it, which
        // is the snap that separates an accented step from a loud one.
        instrument.filterDecayMs * (1 - 0.4 * accent),
        sampleRate
      );
      glidePitch = event.pitch + instrument.semitones;
      filter.reset();
      drive.reset();
    }
    const targetPitch = event.pitch + instrument.semitones;
    const velocity = event.velocity / 127;
    const amplitude = (0.25 + 0.75 * velocity * velocity) * (1 + 0.35 * accent);
    const keyOffset = (instrument.keyTrack * (event.pitch - 60)) / 12;
    const envAmount = instrument.filterEnvAmount * (1 + accent);

    for (let frame = startFrame; frame < endFrame; frame++) {
      const level = ampEnv.step(frame < event.gateOffFrame);
      if (ampEnv.stage === "done") break;
      const fenv = filterEnv.step();

      glidePitch += (targetPitch - glidePitch) * slideCoeff;
      const hz = pitchHz(glidePitch);
      let sample = osc.next(hz, instrument.position, sampleRate);
      if (subGain > 0) {
        const subPhaseInc =
          pitchHz(glidePitch + 12 * instrument.subOctave) / sampleRate;
        const carrier =
          instrument.subShape === "square"
            ? subPhase < 0.5
              ? 1
              : -1
            : Math.sin(2 * Math.PI * subPhase);
        sample += carrier * subGain;
        subPhase += subPhaseInc;
        if (subPhase >= 1) subPhase -= 1;
      }

      const cutoff =
        instrument.cutoffHz * Math.pow(2, envAmount * fenv + keyOffset);
      const driven = drive.process(sample * 0.5, instrument.drive);
      out[frame] +=
        filter.process(
          driven,
          instrument.filterType,
          cutoff,
          instrument.resonance,
          sampleRate
        ) *
        level *
        amplitude;
    }
    // Only the note that runs to the end of the buffer can leave a tail for the
    // caller to ramp out.
    if (endFrame >= out.length) return ampEnv.stage !== "done";
  }
  return false;
}
