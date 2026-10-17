/**
 * A small song for the DAW lab page: WT-1 chords, a BL-1 line and a DR-1
 * beat over eight bars at 120 BPM, plus an empty audio track.
 */

import {
  findInstrumentPreset,
  MIDI_PPQ,
  type MidiInstrument,
  type MidiNote,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";

const BAR_MS = 2000;
const BAR_TICKS = MIDI_PPQ * 4;
const SIXTEENTH = MIDI_PPQ / 4;

function presetInstrument(id: string): MidiInstrument {
  const preset = findInstrumentPreset(id);
  if (!preset) throw new Error(`missing instrument preset ${id}`);
  return preset.instrument;
}

let noteSeq = 0;
const n = (pitch: number, startTick: number, durationTick: number, velocity = 100): MidiNote => ({
  id: `lab-note-${(noteSeq += 1)}`,
  pitch,
  velocity,
  startTick,
  durationTick
});

const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62]
];

function chordNotes(): MidiNote[] {
  return Array.from({ length: 8 }, (_, bar) =>
    CHORDS[bar % 4].map((pitch) => n(pitch, bar * BAR_TICKS, BAR_TICKS - SIXTEENTH, 80))
  ).flat();
}

function bassNotes(): MidiNote[] {
  const roots = [33, 29, 36, 31];
  const out: MidiNote[] = [];
  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 16; step += 2) {
      const accent = step % 8 === 0;
      out.push(n(roots[bar % 4] + (step === 6 ? 12 : 0), bar * BAR_TICKS + step * SIXTEENTH, SIXTEENTH, accent ? 120 : 90));
    }
  }
  return out;
}

function drumNotes(): MidiNote[] {
  const out: MidiNote[] = [];
  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 16; step++) {
      const at = bar * BAR_TICKS + step * SIXTEENTH;
      if (step % 4 === 0) out.push(n(36, at, SIXTEENTH, 110));
      if (step === 4 || step === 12) out.push(n(38, at, SIXTEENTH, 100));
      if (step % 2 === 0) out.push(n(42, at, SIXTEENTH, step % 4 === 2 ? 90 : 60));
    }
  }
  return out;
}

const track = (id: string, name: string, index: number, patch: Partial<TimelineTrack>): TimelineTrack => ({
  id,
  name,
  type: "midi",
  index,
  visible: true,
  locked: false,
  ...patch
});

const midiClip = (id: string, trackId: string, name: string, notes: MidiNote[]): TimelineClip => ({
  id,
  trackId,
  name,
  startMs: 0,
  durationMs: 8 * BAR_MS,
  mediaType: "midi",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  notes
});

export function labDocument(): TimelineSequence {
  const tracks: TimelineTrack[] = [
    track("lab-keys", "Keys", 0, { instrument: presetInstrument("wt1-bloom-pad"), volumeDb: -4 }),
    track("lab-bass", "Bass", 1, { instrument: presetInstrument("bl1-acid"), volumeDb: -3 }),
    track("lab-drums", "Drums", 2, { instrument: presetInstrument("dr1-tr-void") }),
    track("lab-audio", "Audio", 3, { type: "audio" })
  ];
  return {
    id: "daw-lab",
    projectId: "daw-lab",
    name: "DAW lab",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 8 * BAR_MS,
    tracks,
    clips: [
      midiClip("lab-keys-clip", "lab-keys", "Chords", chordNotes()),
      midiClip("lab-bass-clip", "lab-bass", "Bassline", bassNotes()),
      midiClip("lab-drums-clip", "lab-drums", "Beat", drumNotes())
    ],
    markers: [],
    tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
