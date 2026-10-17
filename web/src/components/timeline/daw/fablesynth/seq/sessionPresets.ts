import { copySequenceRhythm } from '../shared/sequenceRhythm';
// SQ-4 factory sessions: legacy generator plus individually authored songs.
// Legacy rules mirror SeqFactory.cpp; authored scores are compiled to native
// data with npm run songs:generate, keeping both libraries in the same order.

import MIXDOWNS from '../../shared/session-mixdowns.json';
import { resolvedPatchParams } from './sessionExport';
import { factorySession } from './factory';
import { chordTrackArp, clipChordOctave, copyClipArp, followClip } from './clipArp';
import { copyAutomation } from './clipAutomation';
import { TIDAL_MEMORY } from './songs/tidalMemory';
import { PHASE_RUNNER } from './songs/phaseRunner';
import { applyGroove } from './songs/grooves';
import { COMPING_SCENES, PAD_HOLD, PAD_HOLD_FEEL, SESSION_COMPING, SESSION_COMP_SOUNDS, compEntry, withComp } from './songs/comping';
import { wtPatch } from './songs/score';
import { bytesToB64, dr1Idx, emptyClipBytes, noteIdx, type ClipDoc, type SessionDoc, wtNoteIdx } from './protocol';
import { masterFxParams } from './masterFx';
import { cloneDrumRhythm } from '../drum/rhythm';

export interface SessionPreset {
  name: string;
  family: string;
  variation: string;
  energy: number;
  tags: string[];
  session: SessionDoc;
}

type Spec = Omit<SessionPreset, 'session'> & { programs: [number, number, number, number]; variationIndex: number };

const spec = (name: string, family: string, variation: string, energy: number, tags: string[], programs: [number, number, number, number], variationIndex: number): Spec =>
  ({ name, family, variation, energy, tags, programs, variationIndex });

// WT-1 program picks (slots 2..3) draw on the expanded factory bank: acoustic
// & classic keys (20-30), engine-showcase sound design (31-40) and the
// classic-synth homages (41-50). Leads must stay "clean" voices (no fx.drive /
// filter.drive) per the patch contract test — except songs listed in the
// test's DRIVEN_LEADS set, where the distortion is the point.
const specs: Spec[] = [
  ['NEON TALE', 'NEON', 'ORIGINAL', 3, ['bright', 'balanced', 'wide'], [13, 0, 3, 11], 0], // CRYSTAL PLUCK / FUTURE CHORD
  ['NEON CHASE', 'NEON', 'CHASE', 5, ['bright', 'driving', 'wide'], [13, 2, 3, 40], 1], // CRYSTAL PLUCK / PUMP PAD
  ['GLASS CIRCUIT', 'NEON', 'GLASS', 2, ['clean', 'glassy', 'sparse'], [12, 9, 45, 35], 2], // FANTA BELLS / TWIN SKY
  ['AFTERGLOW', 'NEON', 'SOFT', 2, ['warm', 'soft', 'wide'], [3, 5, 21, 24], 3], // DYNO EPIANO / ANALOG STRINGS
  ['WAREHOUSE RAW', 'ACID', 'RAW', 5, ['hard', 'dark', 'driving'], [13, 4, 33, 40], 0], // DATA STREAM / PUMP PAD
  ['ACID FLASH', 'ACID', 'FLASH', 4, ['acid', 'bright', 'punchy'], [3, 0, 49, 1], 1], // LATELY BASS / VELVET PAD
  ['STEEL PULSE', 'ACID', 'METAL', 4, ['metallic', 'tight', 'industrial'], [12, 2, 29, 17], 2], // KALIMBA PLUCK / DARK DRONE
  ['PEAK SIGNAL', 'ACID', 'PEAK', 5, ['distorted', 'wide', 'peak-time'], [13, 5, 6, 40], 3], // NEURO WOBBLE / PUMP PAD
  ['DEEP FOG', 'AMBIENT', 'FOG', 1, ['dark', 'deep', 'slow'], [15, 12, 51, 34], 0], // SOFT HORIZON · FOG LIGHT / OCEAN AIR
  ['GLASS BLOOM', 'AMBIENT', 'BLOOM', 2, ['glassy', 'clean', 'lush'], [15, 7, 52, 25], 1], // TAPE BASS · GLASS RIBBON / CINEMA STRINGS
  ['FROZEN BELL', 'AMBIENT', 'FROZEN', 2, ['cold', 'bell', 'sparse'], [15, 11, 53, 32], 2], // CLEAN SUB · NORTH WIRE / GHOST CHOIR
  ['AIR TEMPLE', 'AMBIENT', 'TEMPLE', 2, ['warm', 'ceremonial', 'wide'], [15, 12, 54, 27], 3], // SOFT HORIZON · TEMPLE BREATH / SOFT BRASS
  ['DUST HOUSE', 'HOUSE', 'DUST', 3, ['dusty', 'groovy', 'warm'], [12, 13, 36, 42], 0], // HOUSE ORGAN · TAPE KEYS / JUNO DREAM
  ['MIDNIGHT FLOOR', 'HOUSE', 'NIGHT', 4, ['club', 'round', 'wide'], [13, 4, 21, 40], 1], // WAREHOUSE · DYNO EPIANO / PUMP PAD
  ['TAPE DISCO', 'HOUSE', 'TAPE', 3, ['tape', 'soft', 'groovy'], [3, 13, 28, 27], 2], // HOUSE ORGAN · NYLON PLUCK / SOFT BRASS
  ['CLEAN CLUB', 'HOUSE', 'CLEAN', 4, ['clean', 'tight', 'bright'], [12, 5, 22, 42], 3], // ROUNDHOUSE · DRAWBAR ORGAN / JUNO DREAM
  ['VHS GARDEN', 'LO-FI', 'VHS', 2, ['tape', 'dark', 'nostalgic'], [3, 14, 36, 34], 0], // DUSTY FELT · TAPE KEYS / OCEAN AIR
  ['POCKET DUST', 'LO-FI', 'POCKET', 2, ['dusty', 'small', 'warm'], [12, 7, 20, 27], 1], // TAPE BASS · MELLOW RHODES / SOFT BRASS
  ['TOY PARADE', 'LO-FI', 'TOY', 4, ['8-bit', 'playful', 'broken'], [13, 14, 29, 42], 2], // DUSTY FELT · KALIMBA PLUCK / JUNO DREAM
  ['WORN SIGNAL', 'LO-FI', 'WORN', 3, ['distorted', 'dark', 'unstable'], [3, 4, 33, 17], 3], // WAREHOUSE · DATA STREAM / DARK DRONE
  ['CHROME CATHEDRAL', 'CINEMATIC', 'CATHEDRAL', 3, ['large', 'metallic', 'ceremonial'], [13, 15, 58, 25], 0], // CINEMA SUB · CINEMA LEAD / CINEMA STRINGS
  ['MACHINE TENSION', 'CINEMATIC', 'TENSION', 4, ['industrial', 'tense', 'dark'], [12, 10, 35, 38], 1], // DARK CURRENT · TWIN SKY / AURORA RISER
  ['VOID MARCH', 'CINEMATIC', 'MARCH', 4, ['heavy', 'dark', 'driving'], [3, 15, 44, 25], 2], // CINEMA SUB · BLADE BRASS / CINEMA STRINGS
  ['FINAL HORIZON', 'CINEMATIC', 'FINALE', 5, ['epic', 'wide', 'bright'], [13, 8, 46, 38], 3], // REESE MONO · TAURUS PEDAL / AURORA RISER
  ['GRAY ROOM', 'MINIMAL', 'ROOM', 4, ['hypnotic', 'dry', 'tight'], [9, 16, 59, 17], 0], // SUB STAB · DEEP TICK / DARK DRONE
  ['CLICK FIELD', 'MINIMAL', 'CLICK', 4, ['clicky', 'sparse', 'precise'], [9, 21, 61, 17], 1], // TECHNO SUB · CELLAR BLIP / DARK DRONE
  ['COLD ROTOR', 'MINIMAL', 'ROTOR', 5, ['dark', 'driving', 'hypnotic'], [6, 21, 60, 35], 2], // TECHNO SUB · ROOM KNOCK / TWIN SKY
  ['NIGHT GRID', 'MINIMAL', 'GRID', 4, ['deep', 'rolling', 'late'], [9, 16, 59, 34], 3], // SUB STAB · DEEP TICK / OCEAN AIR
  ['SUGAR RUSH', 'FUTURE BASS', 'RUSH', 5, ['bright', 'bouncy', 'wide'], [0, 17, 4, 11], 0], // 808 GLIDE · HYPER SAW / FUTURE CHORD
  ['PASTEL SKY', 'FUTURE BASS', 'PASTEL', 4, ['soft', 'lush', 'wide'], [2, 18, 15, 42], 1], // GROWL WIDE · TRAP BELL / JUNO DREAM
  ['STARBURST', 'FUTURE BASS', 'BURST', 5, ['euphoric', 'punchy', 'bright'], [0, 17, 45, 40], 2], // 808 GLIDE · FANTA BELLS / PUMP PAD
  ['HEART WIRE', 'FUTURE BASS', 'WIRE', 4, ['emotive', 'glassy', 'wide'], [2, 18, 52, 38], 3], // GROWL WIDE · GLASS RIBBON / AURORA RISER
  ['VELVET SMOKE', 'TRIP HOP', 'SMOKE', 2, ['smoky', 'dusty', 'slow'], [16, 19, 20, 34], 0], // UPRIGHT FELT · MELLOW RHODES / OCEAN AIR
  ['NIGHT BUS', 'TRIP HOP', 'BUS', 2, ['nocturnal', 'warm', 'tape'], [16, 19, 36, 32], 1], // UPRIGHT FELT · TAPE KEYS / GHOST CHOIR
  ['CRACKED LENS', 'TRIP HOP', 'LENS', 3, ['broken', 'eerie', 'dusty'], [8, 10, 29, 17], 2], // DARK CURRENT · KALIMBA PLUCK / DARK DRONE
  ['STONE GARDEN', 'TRIP HOP', 'STONE', 3, ['organic', 'moody', 'deep'], [16, 14, 28, 1], 3], // DUSTY FELT · NYLON PLUCK / VELVET PAD
  ['ECHO CHAMBER', 'DUB', 'ECHO', 2, ['spacious', 'deep', 'smoky'], [4, 20, 59, 56], 0], // STEPPER ROOT · DEEP TICK / DUB SKANK
  ['KING STEPPER', 'DUB', 'STEPPER', 3, ['rootsy', 'driving', 'warm'], [4, 3, 59, 22], 1], // DEEP DUB · DEEP TICK / DRAWBAR ORGAN
  ['ROOTS RADAR', 'DUB', 'RADAR', 2, ['heavy', 'hazy', 'wide'], [4, 20, 59, 56], 2], // STEPPER ROOT · DEEP TICK / DUB SKANK
  ['ZION GATE', 'DUB', 'GATE', 3, ['uplifting', 'rootsy', 'wide'], [4, 20, 59, 1], 3], // STEPPER ROOT · DEEP TICK / VELVET PAD
].map(([name, family, variation, energy, tags, programs, variationIndex]) => spec(
  name as string, family as string, variation as string, energy as number, tags as string[], programs as [number, number, number, number], variationIndex as number,
));

interface Harmony {
  roots: number[];
  minor: boolean[];
}

// Full-chain, in-context track faders — measured by
// juce/test/measure_track_levels.cpp, which renders every song's four tracks
// through their real engine+FX (incl. WT-1's leveling comp) and balances every
// track to the mean drum-bus RMS with perceptual per-role offsets (bass +4 dB,
// pad +2 dB). The fader curve is gain² × 1.4, so quieter voices need a higher
// fader value. Tables carry only currently-used programs; the ?? fallbacks
// cover future picks until the next measure_track_levels run.
const DRUM_FADERS: Record<number, number> = {
  0: 1.00, 2: 0.67, 3: 0.70, 4: 1.00, 6: 0.46, 8: 0.77, 9: 1.00, 12: 0.70, 13: 0.77, 15: 0.56, 16: 0.82,
};
const BASS_FADERS: Record<number, number> = {
  0: 0.43, 2: 0.46, 3: 0.44, 4: 0.44, 5: 0.42, 7: 0.43, 8: 0.41, 9: 0.74, 10: 0.45, 11: 0.51,
  12: 0.43, 13: 0.41, 14: 0.42, 15: 0.42, 16: 0.72, 17: 0.38, 18: 0.40, 19: 0.43, 20: 0.41, 21: 0.50,
};
const LEAD_FADERS: Record<number, number> = {
  3: 0.59, 4: 0.45, 6: 0.43, 15: 0.57, 20: 0.64, 21: 0.48, 22: 0.53, 28: 0.80, 29: 0.90,
  33: 0.45, 35: 0.47, 36: 0.68, 44: 0.43, 45: 0.70, 46: 0.31, 49: 0.48, 51: 0.43,
  52: 0.46, 53: 0.43, 54: 0.44, 58: 0.44, 59: 0.89, 60: 0.79, 61: 0.88,
};
const PAD_FADERS: Record<number, number> = {
  1: 0.59, 11: 0.47, 17: 0.76, 22: 0.48, 24: 0.56, 25: 0.55, 27: 0.56, 32: 1.00, 34: 0.53, 35: 0.53,
  38: 0.73, 40: 0.53, 42: 0.72, 56: 1.00,
};

function calibratedTrackGains(programs: Spec['programs']): [number, number, number, number] {
  return [DRUM_FADERS[programs[0]] ?? 0.78, BASS_FADERS[programs[1]] ?? 0.45, LEAD_FADERS[programs[2]] ?? 0.65, PAD_FADERS[programs[3]] ?? 0.59];
}

// Four-bar harmonic plans. Each variation starts from a recognisable cadence,
// then transposes it for the preset family — a song is now one harmonic world,
// rather than four unrelated clips selected by genre.
function harmonyFor(spec: Spec): Harmony {
  // Give every family its own tonal centre. Combined with the four variation
  // plans below, this guarantees that changing session changes BL-1, lead and
  // pad clip data too, rather than only selecting a different drum clip.
  const tonic: Record<string, number> = {
    NEON: 0, ACID: 2, AMBIENT: 9, HOUSE: 5, 'LO-FI': 7, CINEMATIC: 4,
    MINIMAL: 1, 'FUTURE BASS': 6, 'TRIP HOP': 10, DUB: 3,
  };
  const key = tonic[spec.family] ?? 0;
  if (spec.family === 'MINIMAL') {
    // AAAB, not a cadence: three bars locked on i, then one late move — the
    // hypnosis comes from the lock, and the single change lands harder for it.
    const move = [
      { root: 10, minor: false }, // …VII
      { root: 5, minor: true },   // …iv
      { root: 8, minor: false },  // …VI
      { root: 7, minor: true },   // …v
    ][spec.variationIndex]!;
    return { roots: [0, 0, 0, move.root].map((root) => (root + key) % 12), minor: [true, true, true, move.minor] };
  }
  const plans = [
    { roots: [0, 8, 3, 10], minor: [true, false, false, false] }, // i–VI–III–VII
    { roots: [0, 5, 8, 7], minor: [true, true, false, false] },  // i–iv–VI–V
    { roots: [0, 3, 10, 5], minor: [true, false, false, true] }, // i–III–VII–iv
    { roots: [0, 7, 5, 10], minor: [true, false, true, false] }, // i–V–iv–VII
  ][spec.variationIndex];
  return { roots: plans.roots.map((root) => (root + key) % 12), minor: plans.minor };
}

const putNote = (bytes: Uint8Array, offset: number, absolute: number, duration = 1, accent = false) => {
  bytes[offset] = 1 | (accent ? 2 : 0) | (Math.min(63, Math.max(1, duration)) << 2);
  bytes[offset + 1] = ((absolute % 12) + 12) % 12;
  bytes[offset + 2] = Math.max(0, Math.min(2, Math.floor(absolute / 12) + 1));
};

function bassProgression(harmony: Harmony, spec: Spec): ClipDoc {
  const bytes = emptyClipBytes('BL1', 4);
  if (spec.family === 'NEON') {
    // Synthwave engine room: staccato 16ths pumping the low root, one 16th of
    // every beat lifted an octave (rotated per variation so sibling songs pump
    // differently), accents on the quarters, and a pickup into each new bar.
    const lift = 2 + (spec.variationIndex % 2);
    harmony.roots.forEach((root, bar) => {
      const next = harmony.roots[(bar + 1) % 4]!;
      for (let step = 0; step < 16; step++) {
        const pitch = step === 15 ? next - 12 : step % 4 === lift ? root : root - 12;
        putNote(bytes, noteIdx(bar, step), pitch, 1, step % 4 === 0);
      }
    });
    return { name: `${spec.variation} DRIVE · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  if (spec.family === 'MINIMAL') {
    // Offbeat eighth stabs — the kick owns the downbeats and the bass answers
    // between them; per variation one offbeat lifts to the fifth so sibling
    // songs rock on a different beat.
    const lifted = 2 + spec.variationIndex * 4;
    harmony.roots.forEach((root, bar) => {
      for (const step of [2, 6, 10, 14]) putNote(bytes, noteIdx(bar, step), step === lifted ? root - 5 : root - 12, 1, step === 2);
    });
    return { name: `${spec.variation} PULSE · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  if (spec.family === 'FUTURE BASS') {
    // Half-time sub bed: one long low root under each chord, an octave pop on
    // beat 4, and a two-step slide into the next bar's root.
    harmony.roots.forEach((root, bar) => {
      const next = harmony.roots[(bar + 1) % 4]!;
      putNote(bytes, noteIdx(bar, 0), root - 12, 10, true);
      putNote(bytes, noteIdx(bar, 12), root, 2);
      putNote(bytes, noteIdx(bar, 14), next - 12, 2);
    });
    return { name: `${spec.variation} SUB · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  if (spec.family === 'TRIP HOP') {
    // Slow head-nod line: root anchored on the one, a late off-beat push, the
    // fifth answering on beat 3's tail, and a pickup dragging into the next bar.
    harmony.roots.forEach((root, bar) => {
      const next = harmony.roots[(bar + 1) % 4]!;
      putNote(bytes, noteIdx(bar, 0), root - 12, 6, true);
      putNote(bytes, noteIdx(bar, 7), root - 12, 2);
      putNote(bytes, noteIdx(bar, 10), root - 5, 3);
      putNote(bytes, noteIdx(bar, 14), next - 12, 2);
    });
    return { name: `${spec.variation} NOD · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  if (spec.family === 'DUB') {
    // Steppers bassline: a tight push on the one, a rest where the skank
    // breathes, then a syncopated answer through the fifth below.
    harmony.roots.forEach((root, bar) => {
      putNote(bytes, noteIdx(bar, 0), root - 12, 3, true);
      putNote(bytes, noteIdx(bar, 3), root - 12, 2);
      putNote(bytes, noteIdx(bar, 8), root - 12, 2);
      putNote(bytes, noteIdx(bar, 10), root - 5, 2);
      putNote(bytes, noteIdx(bar, 13), root - 12, 2);
    });
    return { name: `${spec.variation} STEP · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  harmony.roots.forEach((root, bar) => {
    // One low root, then one fifth: deliberate space for the drums and pad.
    putNote(bytes, noteIdx(bar, 0), root - 12, 8, true);
    putNote(bytes, noteIdx(bar, 8), root - 5, 8);
  });
  return { name: `${spec.variation} ROOTS · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
}

function padProgression(harmony: Harmony, spec: Spec): ClipDoc {
  const bytes = emptyClipBytes('WT1', 4);
  if (spec.family === 'MINIMAL') {
    // No chords at all: a bare-fifth drone (no third) so the pad is texture,
    // not harmony — it only shifts when the AAAB plan moves in bar 4.
    harmony.roots.forEach((root, bar) => {
      [root, root + 7].forEach((note, lane) => putNote(bytes, wtNoteIdx(bar, 0, lane), ((note % 12) + 12) % 12, 16));
    });
    return { name: `${spec.variation} DRONE · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
  }
  harmony.roots.forEach((root, bar) => {
    // Close-voice the triad as pitch classes inside the root octave (+0..+11):
    // the pad bed stays strictly below the +12..+23 lead band for every root.
    const chord = [root, root + (harmony.minor[bar] ? 3 : 4), root + 7];
    chord.forEach((note, lane) => putNote(bytes, wtNoteIdx(bar, 0, lane), ((note % 12) + 12) % 12, 16));
  });
  return { name: `${spec.variation} CHORDS · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
}

// Hand-composed lead phrases — one per song, since every (family, variation)
// pair names exactly one preset. Four bars separated by '|'; a note is
// `step,duration,semitones` above the session tonic, and '!' marks an accent.
// Each bar opens on a tone of that bar's chord (see harmonyFor()) and stays in
// natural minor — 11 appears only as the leading tone over the major V. The
// phrases are written to breathe rather than fill a grid: dense question bars
// answered by sparser ones, rests before entrances, and a long held tone to
// close bar 4. The same strings are transcribed verbatim in SeqFactory.cpp.
const LEAD_PHRASES: Record<string, [string, string, string, string]> = {
  NEON: [ // gliding synthwave lines that bloom upward, then settle. Variations
    // 0 and 1 deliberately avoid running the chord straight up and back down in
    // even eighths — that symmetry is what makes a synth line read as a nursery
    // tune. They open on a held colour tone instead of the root, break the note
    // lengths up, and land their turns off the beat.
    '0,3,7! 3,1,8 5,3,10 10,2,7 13,3,3 | 0,5,0! 6,2,3 9,1,2 11,3,8 15,1,10 | 0,6,10! 7,2,7 10,3,5 14,2,3 | 0,3,10! 4,2,8 7,2,5 10,6,2',
    '0,2,3! 2,1,3 4,2,7 7,1,10 9,3,7 13,3,8 | 0,4,5! 5,2,3 8,1,5 10,2,8 13,3,10 | 0,3,8! 4,1,7 6,2,5 9,1,3 11,2,0 14,2,3 | 0,3,7! 4,2,11 7,1,2 9,7,7',
    '0,3,7! 4,3,3 8,2,5 12,4,7 | 0,3,10! 4,2,7 7,2,5 10,2,3 12,4,2 | 0,2,2! 2,2,5 5,2,7 8,3,10 12,4,7 | 0,4,8! 6,2,7 8,8,5',
    '0,4,3! 4,3,2 8,4,0 13,3,7 | 0,4,2! 4,2,11 6,2,7 8,4,2 12,4,11 | 0,3,0! 3,3,8 8,2,5 10,2,3 12,4,5 | 0,4,2! 4,2,3 6,2,2 8,8,0',
  ],
  ACID: [ // coiling sixteenth cells that wind tight, then release
    '0,1,0! 1,1,0 3,1,3 4,2,0 8,2,10 11,1,8! 12,4,7 | 0,2,8! 3,1,7 4,2,8 8,2,0 10,1,10 12,3,8 | 0,1,3! 1,1,3 3,1,5 4,2,7 8,2,10 10,2,7 13,3,3 | 0,2,10! 4,2,7 8,2,5 12,4,2',
    '0,1,0! 2,1,3 4,1,0 6,2,7 8,1,5 10,2,3 13,3,0 | 0,2,8! 2,2,5 5,1,3 8,2,8 10,2,10 13,3,5 | 0,1,0! 1,1,0 4,2,8 6,2,10 8,2,8 12,4,3 | 0,2,11! 3,2,7 8,2,2 10,6,7',
    '0,2,7! 3,1,5 4,2,7 8,2,3 10,2,0 14,2,7 | 0,1,10! 1,1,10 4,2,7 6,2,3 8,3,10 12,4,7 | 0,2,5! 2,2,7 4,1,5 8,2,2 10,2,0 12,2,10 14,2,5 | 0,3,8! 4,2,5 8,8,0',
    '0,1,7! 1,1,7 3,1,10 4,2,7 8,2,0 10,2,10 13,3,7 | 0,2,2! 2,1,0 4,2,11 8,2,7 10,2,2 13,3,11 | 0,1,8! 2,1,8 4,2,5 6,2,8 8,2,10 12,4,5 | 0,2,10! 4,2,5 6,2,7 8,8,10',
  ],
  AMBIENT: [ // gapless winding tones for the glide leads — each note starts as
    // the last one ends, so the portamento snakes continuously through the bar
    '0,8,0! 8,4,3 12,4,5 | 0,6,3! 6,6,2 12,4,0 | 0,8,10! 8,4,7 12,4,8 | 0,6,2! 6,10,0',
    '0,4,7! 4,4,8 8,4,7 12,4,10 | 0,6,8! 6,4,7 10,6,5 | 0,4,0! 4,4,10 8,8,8 | 0,4,11! 4,4,7 8,8,2',
    '0,4,7! 4,4,3 8,8,10 | 0,6,10! 6,10,7 | 0,8,2! 8,8,0 | 0,4,5! 4,12,3',
    '0,6,0! 6,4,2 10,6,3 | 0,4,7! 4,4,8 8,8,11 | 0,6,8! 6,4,7 10,6,5 | 0,4,10! 4,12,7',
  ],
  HOUSE: [ // off-beat stabs that skip across the bar line
    '0,2,0! 3,2,3 7,2,7 10,2,3 14,2,0 | 0,2,8! 3,2,10 7,2,8 11,2,7 14,2,5 | 0,2,3! 3,2,7 7,3,10 11,2,7 14,2,10 | 0,2,2! 3,2,5 7,6,0',
    '0,2,7! 3,2,10 6,1,7 8,2,3 11,2,5 14,2,7 | 0,2,8! 3,2,7 7,2,5 10,2,8 14,2,10 | 0,2,0! 3,2,10 7,2,8 10,2,7 14,2,8 | 0,2,11! 3,2,7 7,3,2 12,4,7',
    '0,2,3! 4,2,0 7,2,3 10,2,7 13,3,5 | 0,2,7! 4,2,10 7,2,0 10,2,10 13,3,7 | 0,2,10! 4,2,2 7,2,10 10,2,8 13,3,7 | 0,2,8! 4,2,7 7,2,5 10,6,3',
    '0,1,0! 3,1,0 6,2,7 8,1,5 11,2,3 14,2,0 | 0,1,2! 3,1,2 6,2,11 8,2,7 11,2,2 14,2,11 | 0,1,5! 3,1,5 6,2,8 8,2,0 11,2,8 14,2,5 | 0,2,2! 3,2,5 6,2,7 8,8,10',
  ],
  'LO-FI': [ // unhurried, nostalgic lines that trail off mid-bar
    '0,3,3! 4,3,7 9,2,5 12,4,3 | 0,3,0! 4,3,10 9,5,8 | 0,3,7! 4,3,5 9,2,7 12,4,10 | 0,3,5! 4,2,3 7,2,2 9,7,0',
    '0,2,0! 3,3,3 8,2,2 10,2,3 13,3,0 | 0,3,8! 4,2,5 8,3,3 12,4,5 | 0,3,3! 4,2,0 8,4,10 13,3,8 | 0,3,7! 4,2,5 7,2,3 9,7,2',
    '0,1,0! 2,1,3 4,1,7 6,1,3 8,2,10 11,1,7 13,3,0 | 0,1,7! 2,1,10 4,1,7 6,1,3 8,3,2 12,4,3 | 0,1,10! 2,1,2 4,1,5 6,1,2 8,2,7 11,1,5 13,3,10 | 0,2,8! 3,1,7 5,2,5 8,8,0',
    '0,4,0! 5,2,10 8,3,8 12,4,7 | 0,4,11! 5,2,7 8,4,2 13,3,7 | 0,4,8! 5,2,7 8,3,5 12,4,8 | 0,4,5! 5,2,3 8,8,2',
  ],
  CINEMATIC: [ // whole and half notes only — the melody moves at one or two
    // events per bar so each note is an event, not a phrase. Written for
    // sustaining voices (CINEMA LEAD, the brasses); a plucked patch would just
    // decay into the gap.
    '0,16,0! | 0,8,8! 8,8,3 | 0,16,7! | 0,8,10! 8,8,5',
    '0,8,0! 8,8,3 | 0,16,5! | 0,8,8! 8,8,0 | 0,16,7!',
    '0,16,0! | 0,8,3! 8,8,7 | 0,8,10! 8,8,2 | 0,16,5!',
    '0,8,0! 8,8,7 | 0,16,7! | 0,8,5! 8,8,8 | 0,16,10!',
  ],
  MINIMAL: [ // deliberately not melodies: one pitch, repeated. The interest is
    // rhythmic placement and the bar-4 shift to the AAAB move — nothing hums.
    '0,1,0! 4,1,0 8,1,0 12,1,0 | 0,1,0! 4,1,0 8,1,0 | 0,1,0! 4,1,0 8,1,0 12,1,0 | 0,1,10! 4,1,10 8,8,10',
    '0,1,0! 2,1,0 8,1,0 10,1,0 | 0,1,0! 2,1,0 8,1,0 | 0,1,0! 2,1,0 8,1,0 10,1,0 14,1,0 | 0,1,5! 2,1,5 8,8,5',
    '0,1,7! 4,1,7 8,1,7 12,1,7 | 0,1,7! 4,1,7 12,1,7 | 0,1,7! 4,1,7 8,1,7 12,1,7 | 0,1,8! 4,1,8 8,8,8',
    '0,1,0! 4,1,0 8,1,0 12,1,0 | 0,1,0! 4,1,0 8,1,0 12,1,0 14,1,0 | 0,1,0! 4,1,0 8,1,0 12,1,0 | 0,1,7! 4,1,7 8,8,7',
  ],
  'FUTURE BASS': [ // wide syncopated chord-tone leaps that land on long drops
    '0,2,0! 3,2,3 6,2,7 10,3,10 14,2,7 | 0,2,8! 3,2,7 6,4,3 11,2,5 14,2,8 | 0,2,7! 3,2,10 6,4,7 12,4,3 | 0,3,10! 4,2,7 6,2,5 8,8,2',
    '0,2,0! 3,2,3 6,2,5 8,3,7 12,4,3 | 0,2,5! 3,2,8 6,4,5 12,4,0 | 0,2,8! 3,2,10 6,2,8 8,4,7 13,3,5 | 0,2,7! 3,2,10 6,2,7 8,8,2',
    '0,2,3! 3,2,7 6,4,10 11,2,7 14,2,5 | 0,2,10! 3,2,7 6,4,3 12,4,7 | 0,2,2! 3,2,5 6,2,10 8,4,7 13,3,5 | 0,2,8! 4,2,5 8,8,0',
    '0,2,7! 3,2,3 6,4,0 11,2,3 14,2,7 | 0,2,11! 3,2,7 6,4,2 12,4,7 | 0,2,5! 3,2,8 6,2,0 8,4,10 13,3,8 | 0,2,10! 4,2,7 8,8,5',
  ],
  'TRIP HOP': [ // behind-the-beat fragments that trail into smoke
    '0,3,0! 5,2,3 8,3,5 13,3,3 | 0,3,8! 5,2,7 9,4,5 | 0,3,3! 5,2,5 8,3,7 13,3,10 | 0,3,5! 5,2,3 9,7,2',
    '0,3,3! 4,2,2 8,3,0 13,3,3 | 0,3,5! 5,2,8 9,4,7 | 0,3,0! 4,2,10 8,3,8 13,3,5 | 0,3,7! 5,2,5 9,7,2',
    '0,2,0! 3,2,3 8,2,5 11,2,3 14,2,0 | 0,3,10! 5,2,7 9,4,3 | 0,2,2! 3,2,5 8,2,7 11,2,5 14,2,2 | 0,3,8! 5,2,7 9,7,5',
    '0,3,7! 5,2,8 8,3,7 13,3,5 | 0,3,2! 5,2,0 9,4,10 | 0,3,5! 4,2,3 8,3,2 13,3,0 | 0,3,10! 5,2,8 9,7,7',
  ],
  DUB: [ // unhurried melodica calls with space for the echo to answer
    '0,4,0! 6,2,10 8,4,7 14,2,5 | 0,4,8! 6,2,7 8,6,5 | 0,4,7! 6,2,5 8,4,3 13,3,2 | 0,3,5! 4,2,3 8,8,2',
    '0,4,3! 6,2,5 8,4,7 14,2,10 | 0,4,5! 6,2,3 8,6,0 | 0,4,8! 6,2,10 8,4,8 13,3,7 | 0,3,7! 4,2,5 8,8,3',
    '0,4,7! 6,2,8 8,4,10 14,2,7 | 0,4,10! 6,2,8 8,6,7 | 0,4,5! 6,2,3 8,4,2 13,3,0 | 0,3,8! 4,2,7 8,8,5',
    '0,4,0! 6,2,2 8,4,3 14,2,5 | 0,4,7! 6,2,5 8,6,2 | 0,4,5! 6,2,7 8,4,8 13,3,7 | 0,3,2! 4,2,3 8,8,10',
  ],
};

interface LeadNote { step: number; duration: number; pitch: number; accent: boolean }

function parseLeadPhrase(phrase: string): LeadNote[][] {
  return phrase.split('|').map((bar) => bar.trim().split(/\s+/).map((token) => {
    const accent = token.endsWith('!');
    const [step, duration, pitch] = (accent ? token.slice(0, -1) : token).split(',').map(Number);
    return { step: step!, duration: duration!, pitch: pitch!, accent };
  }));
}

function leadProgression(harmony: Harmony, spec: Spec): ClipDoc {
  const bytes = emptyClipBytes('WT1', 4);
  const tonic = harmony.roots[0];
  const phrase = (LEAD_PHRASES[spec.family] ?? LEAD_PHRASES.NEON!)[spec.variationIndex]!;
  parseLeadPhrase(phrase).forEach((barNotes, bar) => {
    for (const note of barNotes) {
      // Voice the melody strictly one octave above the pad bed (+12..+23):
      // the authored phrases carry the contour, so no octave search is needed.
      putNote(bytes, wtNoteIdx(bar, note.step, 0), ((tonic + note.pitch) % 12) + 12, note.duration, note.accent);
    }
  });
  return { name: `${spec.variation} MELODY · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
}

// ---------- procedural drums ----------
// Every song gets its own kit patterns: a per-family groove archetype,
// mutated deterministically by variation and energy, then masked per scene
// role. No preset references a shared library clip.

const DRUM = { KICK: 0, SNARE: 2, CLAP: 3, RIM: 4, CH: 5, OH: 6, TOM_LO: 8, TOM_MID: 9, TOM_HI: 10, PERC_A: 12, PERC_B: 13 } as const;

interface DrumVoice { pad: number; steps: number[]; accents: number[] }
interface DrumArchetype { kick: DrumVoice; back: DrumVoice; hat: DrumVoice; open: DrumVoice; perc: DrumVoice[] }

const DRUM_ARCHETYPES: Record<string, DrumArchetype> = {
  NEON: { // driving synthwave: four-on-floor, clap backbeat, offbeat hats
    kick: { pad: DRUM.KICK, steps: [0, 4, 8, 12], accents: [0] },
    back: { pad: DRUM.CLAP, steps: [4, 12], accents: [] },
    hat: { pad: DRUM.CH, steps: [2, 6, 10, 14], accents: [2, 10] },
    open: { pad: DRUM.OH, steps: [2, 10], accents: [] },
    perc: [],
  },
  ACID: { // warehouse: relentless floor + ghost kick, rolling 16th hats
    kick: { pad: DRUM.KICK, steps: [0, 4, 8, 12, 14], accents: [0] },
    back: { pad: DRUM.SNARE, steps: [4, 12], accents: [4, 12] },
    hat: { pad: DRUM.CH, steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], accents: [2, 6, 10, 14] },
    open: { pad: DRUM.OH, steps: [7], accents: [] },
    perc: [],
  },
  AMBIENT: { // deep: minimal kick, soft rim, airy hats, lots of space
    kick: { pad: DRUM.KICK, steps: [0, 8], accents: [] },
    back: { pad: DRUM.RIM, steps: [8], accents: [] },
    hat: { pad: DRUM.CH, steps: [4, 12], accents: [] },
    open: { pad: DRUM.OH, steps: [], accents: [] },
    perc: [],
  },
  HOUSE: { // club: swung floor (global swing 0.12), open-hat offbeat "tss"
    kick: { pad: DRUM.KICK, steps: [0, 4, 8, 12], accents: [] },
    back: { pad: DRUM.CLAP, steps: [4, 12], accents: [] },
    hat: { pad: DRUM.CH, steps: [2, 6, 10, 14], accents: [] },
    open: { pad: DRUM.OH, steps: [2, 6, 10, 14], accents: [6, 14] },
    perc: [],
  },
  'LO-FI': { // dusty boom-bap: broken kick, laid-back snare, swung hats
    kick: { pad: DRUM.KICK, steps: [0, 7, 10], accents: [0] },
    back: { pad: DRUM.SNARE, steps: [4, 12], accents: [] },
    hat: { pad: DRUM.CH, steps: [0, 3, 6, 8, 11, 14], accents: [] },
    open: { pad: DRUM.OH, steps: [14], accents: [] },
    perc: [{ pad: DRUM.TOM_LO, steps: [6], accents: [] }],
  },
  CINEMATIC: { // epic half-time: sparse kick, big snare on 3, tom colour
    kick: { pad: DRUM.KICK, steps: [0, 10], accents: [0] },
    back: { pad: DRUM.SNARE, steps: [8], accents: [8] },
    hat: { pad: DRUM.CH, steps: [], accents: [] },
    open: { pad: DRUM.OH, steps: [], accents: [] },
    perc: [{ pad: DRUM.TOM_LO, steps: [13], accents: [] }],
  },
  MINIMAL: { // clicking techno: strict floor, rim backbeat, one late open hat
    kick: { pad: DRUM.KICK, steps: [0, 4, 8, 12], accents: [0] },
    back: { pad: DRUM.RIM, steps: [4, 12], accents: [] },
    hat: { pad: DRUM.CH, steps: [2, 6, 10, 14], accents: [2, 10] },
    open: { pad: DRUM.OH, steps: [10], accents: [] },
    perc: [{ pad: DRUM.TOM_LO, steps: [7], accents: [] }],
  },
  'FUTURE BASS': { // half-time bounce: tumbling kick, snare on 3, hat rolls
    kick: { pad: DRUM.KICK, steps: [0, 6, 10], accents: [0] },
    back: { pad: DRUM.SNARE, steps: [8], accents: [8] },
    hat: { pad: DRUM.CH, steps: [0, 2, 4, 6, 8, 10, 12, 14], accents: [4, 12] },
    open: { pad: DRUM.OH, steps: [6], accents: [] },
    perc: [],
  },
  'TRIP HOP': { // slow boom bap: dragging kick, heavy backbeat, loose hats
    kick: { pad: DRUM.KICK, steps: [0, 3, 10], accents: [0] },
    back: { pad: DRUM.SNARE, steps: [4, 12], accents: [12] },
    hat: { pad: DRUM.CH, steps: [0, 4, 6, 10, 14], accents: [6, 14] },
    open: { pad: DRUM.OH, steps: [7], accents: [] },
    perc: [{ pad: DRUM.TOM_LO, steps: [11], accents: [] }],
  },
  DUB: { // one drop: kick and snare share beat 3, offbeat skank hats
    kick: { pad: DRUM.KICK, steps: [8], accents: [8] },
    back: { pad: DRUM.SNARE, steps: [8], accents: [] },
    hat: { pad: DRUM.CH, steps: [2, 6, 10, 14], accents: [6, 14] },
    open: { pad: DRUM.OH, steps: [12], accents: [] },
    perc: [{ pad: DRUM.TOM_MID, steps: [3, 11], accents: [] }],
  },
};

// Family-flavoured bar-4 fills: [pad, step, accent].
const DRUM_FILLS: Record<string, Array<[number, number, boolean]>> = {
  NEON: [[DRUM.TOM_HI, 10, false], [DRUM.TOM_MID, 12, false], [DRUM.TOM_LO, 14, true]],
  ACID: [[DRUM.SNARE, 13, false], [DRUM.SNARE, 14, false], [DRUM.SNARE, 15, true]],
  AMBIENT: [[DRUM.OH, 12, false]],
  HOUSE: [[DRUM.CLAP, 13, false], [DRUM.CLAP, 15, true]],
  'LO-FI': [[DRUM.TOM_MID, 13, false], [DRUM.TOM_LO, 15, false]],
  CINEMATIC: [[DRUM.TOM_HI, 8, false], [DRUM.TOM_MID, 10, false], [DRUM.TOM_LO, 12, true], [DRUM.TOM_LO, 14, true]],
  MINIMAL: [[DRUM.TOM_LO, 12, false], [DRUM.TOM_LO, 14, true]],
  'FUTURE BASS': [[DRUM.SNARE, 10, false], [DRUM.SNARE, 12, false], [DRUM.SNARE, 14, true]],
  'TRIP HOP': [[DRUM.SNARE, 10, false], [DRUM.RIM, 13, false], [DRUM.SNARE, 15, true]],
  DUB: [[DRUM.TOM_MID, 11, false], [DRUM.TOM_LO, 13, false], [DRUM.SNARE, 15, true]],
};

// One ghost hit per variation (index 0 adds none): [pad, step].
const DRUM_GHOSTS: Array<[number, number] | null> = [null, [DRUM.KICK, 14], [DRUM.SNARE, 11], [DRUM.TOM_LO, 3]];
// AMBIENT keeps its ghosts on the eighth grid with soft voices — off-grid
// kick/snare pokes read as glitches in so sparse a field. Each variation still
// gets a distinct hit so sibling songs stay unique.
const AMBIENT_GHOSTS: Array<[number, number] | null> = [null, [DRUM.CH, 10], [DRUM.RIM, 12], [DRUM.TOM_MID, 6]];

function drumProgression(spec: Spec, scene: number): ClipDoc {
  const family = DRUM_ARCHETYPES[spec.family] ?? DRUM_ARCHETYPES.NEON!;
  const bytes = new Uint8Array(4 * 256);
  const hit = (bar: number, pad: number, step: number, accent = false) => { bytes[dr1Idx(bar, pad, step)] = accent ? 2 : 1; };
  const intro = scene === 0, build = scene === 1, outro = scene === 5;

  // Energy scales hat density; variation (plus one extra for DROP B) rotates
  // which hat steps carry the accents, so sibling songs land differently.
  const hatSteps = spec.energy >= 4 ? Array.from({ length: 16 }, (_, s) => s)
    : spec.energy <= 2 ? family.hat.steps.filter((_, i) => i % 2 === 0)
      : family.hat.steps;
  const shift = spec.variationIndex + (scene === 3 ? 1 : 0);
  const hatAccents = family.hat.accents.map((_, k) => (hatSteps.length ? hatSteps[(k * 2 + shift) % hatSteps.length]! : -1));
  const ghost = (spec.family === 'AMBIENT' ? AMBIENT_GHOSTS : DRUM_GHOSTS)[spec.variationIndex] ?? null;

  for (let bar = 0; bar < 4; bar++) {
    const lastBar = bar === 3;
    const kickSteps = intro || outro ? family.kick.steps.filter((step) => step % 8 === 0) : family.kick.steps;
    for (const step of kickSteps) hit(bar, family.kick.pad, step, family.kick.accents.includes(step));
    if (!intro && !outro) {
      for (const step of family.back.steps) hit(bar, family.back.pad, step, family.back.accents.includes(step));
      if (!build && ghost) hit(bar, ghost[0], ghost[1]);
    }
    if (!outro) {
      // Intros thin the hats and stagger the picks by variation, so each
      // song opens with its own sparse figure instead of a shared "ticks" loop.
      const steps = intro ? family.hat.steps.filter((_, i) => (i + spec.variationIndex) % 2 === 0) : hatSteps;
      for (const step of steps) hit(bar, family.hat.pad, step, !intro && hatAccents.includes(step));
      if (!intro) for (const step of family.open.steps) hit(bar, family.open.pad, step, family.open.accents.includes(step));
    }
    if (!intro) for (const voice of family.perc) for (const step of voice.steps) hit(bar, voice.pad, step, voice.accents.includes(step));
    if ((intro || outro) && lastBar && ghost && spec.variationIndex >= 2) hit(bar, ghost[0], ghost[1]);
    // Builds climb into the drop on their own backbeat voice (snare/clap/rim)
    // rather than a perc pad — perc voices vary too wildly across kits.
    if (build && lastBar) for (const step of [12, 13, 14, 15]) hit(bar, family.back.pad, step, step === 15);
    if (!intro && !build && !outro && (lastBar || (scene === 3 && bar === 1))) {
      for (const [pad, step, accent] of DRUM_FILLS[spec.family] ?? []) hit(bar, pad, step, accent);
    }
  }
  const role = intro ? 'INTRO' : build ? 'BUILD' : outro ? 'TAIL' : scene === 3 ? 'DRIVE II' : 'DRIVE';
  return { name: `${spec.variation} ${role} · 4 BAR`, bars: 4, pattern: bytesToB64(bytes) };
}

function buildSession(spec: Spec): SessionDoc {
  const session = factorySession();
  session.name = spec.name;
  // Slow families anchor below the shared 96 base so energy still spreads the
  // tempo without pushing trip hop or dub into house territory.
  const bpmBase: Record<string, number> = { 'TRIP HOP': 62, DUB: 56 };
  const swing: Record<string, number> = { HOUSE: 0.12, 'LO-FI': 0.18, 'TRIP HOP': 0.16, DUB: 0.08 };
  session.bpm = (bpmBase[spec.family] ?? 96) + spec.energy * 7 + spec.variationIndex;
  session.swing = swing[spec.family] ?? 0;
  const gains = calibratedTrackGains(spec.programs);
  session.tracks.forEach((track, t) => {
    track.patch = { kind: 'factory', index: spec.programs[t] };
    track.gain = gains[t];
  });
  const compSound = SESSION_COMP_SOUNDS[spec.name];
  if (compSound) session.tracks[3]!.patch = wtPatch(spec.programs[3], compSound);
  const harmony = harmonyFor(spec);
  // Each note clip carries the song's progression as its arp chord track (ARP
  // off), in the clip's register. MINIMAL's drone pad keeps its bare fifths.
  const chordTrack = (machine: 'BL1' | 'WT1', clip: ClipDoc, drone = false): ClipDoc => ({ ...clip,
    arp: chordTrackArp(machine, harmony.roots.map((root, bar) => ({ start: bar * 16, length: 16, root,
      quality: drone ? 'five' : harmony.minor[bar] ? 'min' : 'maj', inversion: 0 })), harmony.roots[0]!, clipChordOctave(machine, clip), !drone) });
  // Bass and lead FOLLOW the chord track, so a new scene progression moves them too.
  const bass = followClip(chordTrack('BL1', bassProgression(harmony, spec)));
  const lead = followClip(chordTrack('WT1', leadProgression(harmony, spec)));
  const chordPads = chordTrack('WT1', padProgression(harmony, spec), spec.family === 'MINIMAL');
  // Pads play the chord track in CHORDS mode: held chords, and in some
  // sessions a comp groove between the intro and the tail (songs/comping.ts).
  const comping = SESSION_COMPING[spec.name] ? compEntry(SESSION_COMPING[spec.name]!) : null;
  const held = { ...chordPads, arp: withComp(chordPads.arp!, compEntry(PAD_HOLD), true, PAD_HOLD_FEEL) };
  const comped = comping && { ...chordPads, arp: withComp(chordPads.arp!, comping, true) };
  session.scenes.forEach((scene, s) => {
    const drums = drumProgression(spec, s);
    const pads = comped && COMPING_SCENES.includes(s) ? comped : held;
    // Arrange density intentionally; the three tonal parts retain the same
    // progression whenever they enter, so every scene belongs to one song.
    scene.clips = s === 0 ? [drums, null, null, pads]
      : s === 1 ? [drums, bass, null, pads]
        : s === 4 ? [null, bass, lead, pads]
          : s === 5 ? [drums, null, null, pads]
            : [drums, bass, lead, pads];
  });
  return session;
}

/** The presets as composed, before the generated mixdowns (for the extractor). */
export const BASE_GENERATED_SESSION_PRESETS: SessionPreset[] = specs.map((spec) => ({
  ...spec,
  // Scored POLY lanes and micro-timing (songs/grooves.ts) for a few sessions.
  session: applyGroove(buildSession(spec)),
}));
// Append authored songs to preserve existing host program numbers.
export const BASE_AUTHORED_SESSION_PRESETS: SessionPreset[] = [TIDAL_MEMORY, PHASE_RUNNER];

interface Mixdown {
  name: string;
  masterVol: number;
  masterFx: Record<string, number>;
  tracks: { gain: number; params: Record<string, number> }[];
}

/**
 * Applies a session's generated mixdown (auto-EQ, auto-comp and ASSIST
 * results, shared/session-mixdowns.json): track gains, device EQ/comp
 * overrides on a fully resolved inline patch (keeping its factory base),
 * the master section and the master fader. The plugin applies the same
 * table (SessionMixdowns.gen.h).
 */
function applyMixdown(preset: SessionPreset): SessionPreset {
  const mix = (MIXDOWNS.sessions as Mixdown[]).find((m) => m.name === preset.name);
  if (!mix) return preset;
  const session = preset.session;
  return {
    ...preset,
    session: {
      ...session,
      masterFx: masterFxParams(mix.masterFx),
      masterVol: mix.masterVol,
      tracks: session.tracks.map((track, t) => {
        const m = mix.tracks[t];
        if (!m) return track;
        if (!Object.keys(m.params).length) return { ...track, gain: m.gain };
        const base = track.patch.kind === 'factory' ? track.patch.index : track.patch.base;
        const data = track.patch.kind === 'inline' ? track.patch.data as Record<string, unknown> : {};
        return {
          ...track, gain: m.gain,
          patch: { kind: 'inline', base, data: { ...data, params: { ...resolvedPatchParams(track.machine, track.patch), ...m.params } } },
        };
      }),
    },
  };
}

export const GENERATED_SESSION_PRESETS: SessionPreset[] = BASE_GENERATED_SESSION_PRESETS.map(applyMixdown);
export const AUTHORED_SESSION_PRESETS: SessionPreset[] = BASE_AUTHORED_SESSION_PRESETS.map(applyMixdown);
export const FACTORY_SESSION_PRESETS: SessionPreset[] = [...GENERATED_SESSION_PRESETS, ...AUTHORED_SESSION_PRESETS];

/**
 * The session SQ-4 opens with. `factorySession()` stays the NEON TALE base
 * every preset is built from; this is only which preset the instrument boots
 * into. Keep it in step with SeqFactory.cpp's defaultSession().
 */
export const DEFAULT_SESSION_NAME = 'GLASS BLOOM';

/** A fresh copy of the boot session, ready to hand to the store. */
export function defaultSession(): SessionDoc {
  const preset = FACTORY_SESSION_PRESETS.find((p) => p.name === DEFAULT_SESSION_NAME);
  return copySession((preset ?? FACTORY_SESSION_PRESETS[0]).session);
}

/** Session data is edited in the store, so preset recall always needs a copy. */
export function copySession(session: SessionDoc): SessionDoc {
  return {
    ...session,
    masterFx: masterFxParams(session.masterFx),
    tracks: session.tracks.map((track) => ({ ...track, patch: track.patch.kind === 'inline'
      ? { ...track.patch, data: structuredClone(track.patch.data) } : { ...track.patch } })),
    scenes: session.scenes.map((scene) => ({ ...scene, pass: scene.pass ? [...scene.pass] : undefined, clips: scene.clips.map((clip) => clip && { ...clip,
      ...(clip.sequenceRhythm ? { sequenceRhythm: copySequenceRhythm(clip.sequenceRhythm) } : {}),
      ...(clip.arp ? { arp: copyClipArp(clip.arp) } : {}),
      ...(clip.automation ? { automation: copyAutomation(clip.automation) } : {}),
      ...(clip.drumRhythm ? { drumRhythm: cloneDrumRhythm(clip.drumRhythm, clip.bars) } : {}),
    }) })),
  };
}
