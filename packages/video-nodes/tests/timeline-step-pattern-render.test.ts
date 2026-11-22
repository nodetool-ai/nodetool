/**
 * Web preview vs server export parity for Step Sequencer pattern regions (SQ9, SQ60).
 * Both paths consume the same `harmonizeClips` + `renderMidiClip` contract and
 * must produce identical note lists and identical PCM samples across all 12
 * oracle patterns.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  findInstrumentPreset,
  harmonizeClips,
  makeClip,
  makeTrack,
  midiClipNoteEvents,
  normalizePattern,
  patternFromText,
  renderMidiClip,
  type DrumMidiInstrument,
  type StepPattern,
  type StepRow,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import { mixableAudioClips } from "../src/nodes/timeline.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;
const SAMPLE_RATE = 24000;

function row(overrides: Partial<StepRow>): StepRow {
  const lengthSteps = overrides.lengthSteps ?? 4;
  return {
    id: overrides.id ?? "r1",
    assignment: overrides.assignment ?? { type: "note", pitch: 60 },
    mute: false,
    solo: false,
    lengthSteps,
    loopStart: 0,
    loopEnd: lengthSteps,
    stepRate: "1/16",
    playback: "forward",
    midiChannel: 1,
    automationMode: "latch",
    subrows: ["velocity", "gate"],
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

const ORACLE_PATTERNS: ReadonlyArray<{
  name: string;
  pattern: StepPattern;
  durationMs?: number;
  instrument?: typeof DEFAULT_MIDI_INSTRUMENT | DrumMidiInstrument;
}> = [
  { name: "four-on-the-floor", pattern: patternFromText("Kick: x... x... x... x...") },
  {
    name: "ties-and-gate",
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [row({ steps: [{ on: true }, { tie: true }, { tie: true, gate: 100 }, { on: true, gate: 50 }] })]
    })
  },
  {
    name: "legato",
    pattern: normalizePattern({
      lengthSteps: 4,
      legato: true,
      rows: [row({ steps: [{ on: true, gate: 100 }, {}, {}, {}] })]
    })
  },
  {
    name: "swing-16th",
    pattern: normalizePattern({
      lengthSteps: 4,
      swing: 50,
      swingDivision: "1/16",
      rows: [row({ steps: [{ on: true }, { on: true }, { on: true }, {}] })]
    })
  },
  {
    name: "offset-at-clip-start",
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [row({ steps: [{ on: true, offset: -40 }, {}, {}, {}] })]
    })
  },
  {
    name: "repeat-distribution",
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [row({ steps: [{ on: true, repeat: 4, velocityRamp: -80, distribution: 40 }, {}, {}, {}] })]
    })
  },
  {
    name: "chance-50-seed-7",
    pattern: normalizePattern({
      seed: 7,
      lengthSteps: 4,
      rows: [row({ steps: [{ on: true, chance: 50 }, { on: true, chance: 50 }, { on: true, chance: 50 }, { on: true, chance: 50 }] })]
    })
  },
  {
    name: "recurrence-2-of-3",
    durationMs: 3000,
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [row({ steps: [{ on: true, condition: { type: "recurrence", iteration: 2, cycles: 3 } }, {}, {}, {}] })]
    })
  },
  {
    name: "ping-pong",
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [
        row({
          assignment: { type: "melodic", pitch: 60 },
          playback: "pingPong",
          steps: [{ on: true, note: 0 }, { on: true, note: 2 }, { on: true, note: 4 }, { on: true, note: 7 }]
        })
      ]
    })
  },
  {
    name: "polymeter-16-vs-12",
    durationMs: 4000,
    pattern: normalizePattern({
      lengthSteps: 16,
      rows: [
        row({ id: "r16", assignment: { type: "note", pitch: 36 }, lengthSteps: 16, loopEnd: 16, steps: Array.from({ length: 16 }, (_, i) => (i === 0 ? { on: true } : {})) }),
        row({ id: "r12", assignment: { type: "note", pitch: 42 }, lengthSteps: 12, loopEnd: 12, steps: Array.from({ length: 12 }, (_, i) => (i === 0 ? { on: true } : {})) })
      ]
    })
  },
  {
    name: "kit-note-plus-3",
    instrument: DR1,
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [row({ id: "k0", assignment: { type: "kit", pad: 0 }, steps: [{ on: true, note: 3 }, {}, {}, {}] })]
    })
  },
  {
    name: "cc-latch-and-slide",
    pattern: normalizePattern({
      lengthSteps: 4,
      rows: [
        row({ id: "n1", steps: [{ on: true }, {}, { on: true }, {}] }),
        row({
          id: "cc74",
          assignment: { type: "automation", target: { kind: "cc", cc: 74 } },
          automationMode: "latch",
          steps: [{ on: true, value: 0 }, {}, { on: true, value: 127 }, {}]
        }),
        row({
          id: "cc1",
          assignment: { type: "automation", target: { kind: "cc", cc: 1 } },
          automationMode: "slide",
          steps: [{ on: true, value: 10 }, {}, { on: true, value: 110 }, {}]
        })
      ]
    })
  }
];

describe("SQ9: web preview and server export render parity across all 12 oracle patterns", () => {
  it.each(ORACLE_PATTERNS)("$name matches note events and PCM sample-for-sample", (fixture) => {
    const instrument = fixture.instrument ?? DEFAULT_MIDI_INSTRUMENT;
    const durationMs = fixture.durationMs ?? 2000;
    const track = makeTrack({ id: "t1", type: "midi", name: "Part", index: 0, instrument });
    const clip = makeClip({
      id: "c1",
      trackId: "t1",
      name: fixture.name,
      startMs: 0,
      durationMs,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: fixture.pattern
    });
    const seq: TimelineSequence = {
      id: "seq1",
      projectId: "p1",
      name: "Parity",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs,
      tracks: [track],
      clips: [clip],
      markers: [],
      tempo: DEFAULT_TEMPO,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    // Web preview path: harmonizeClips (called by auditionedClips / renderAudio) -> renderMidiClip
    const webClip = harmonizeClips(seq.clips, seq)[0]!;
    // Server export path: mixableAudioClips (packages/video-nodes) -> renderMidiClip
    const serverClips = mixableAudioClips(seq);
    expect(serverClips).toHaveLength(1);
    const serverClip = serverClips[0]!;

    expect(midiClipNoteEvents(serverClip, 120)).toEqual(midiClipNoteEvents(webClip, 120));

    const webPcm = renderMidiClip({ clip: webClip, bpm: 120, instrument, sampleRate: SAMPLE_RATE });
    const serverPcm = renderMidiClip({ clip: serverClip, bpm: 120, instrument, sampleRate: SAMPLE_RATE });
    expect(serverPcm).toEqual(webPcm);
  });
});
