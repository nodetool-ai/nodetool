/**
 * SQ1 Fix Round Wave 4 — Server export defects (F1 server, F5 server).
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  normalizePattern,
  type StepRow,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import { generateMedia, readPcm } from "@nodetool-ai/runtime/media/testing";
import {
  mixCompositedTimelineAudio,
  mixableAudioClips
} from "../src/nodes/timeline.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

function makeRow(overrides: Partial<StepRow> = {}): StepRow {
  const lengthSteps = overrides.lengthSteps ?? 4;
  return {
    id: overrides.id ?? "r1",
    assignment: overrides.assignment ?? { type: "note", pitch: 48 },
    mute: false,
    solo: false,
    lengthSteps,
    loopStart: 0,
    loopEnd: lengthSteps,
    stepRate: "1/4",
    playback: "forward",
    midiChannel: 1,
    automationMode: "latch",
    subrows: ["velocity", "gate"],
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

function hfEnergyWindow(samples: Float32Array, channels: number, sr: number, fromSec: number, toSec: number): number {
  const from = Math.max(1, Math.round(fromSec * sr));
  const to = Math.min(Math.floor(samples.length / channels), Math.round(toSec * sr));
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const d = samples[i * channels]! - samples[(i - 1) * channels]!;
    sum += d * d;
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

describe("SQ1 Fix Round — Server audio export (Wave 4)", () => {
  it("F5 (server): mixableAudioClips retains CC-only pattern clips", () => {
    const ccOnlyPat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        makeRow({
          id: "cc74",
          assignment: { type: "automation", target: { kind: "cc", cc: 74 } },
          automationMode: "slide",
          subrows: ["value"],
          steps: [{ on: true, value: 10 }, {}, { on: true, value: 120 }, {}]
        })
      ]
    });
    const track = makeTrack({
      id: "t1",
      type: "midi",
      name: "Synth",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const clip = makeClip({
      id: "c_cc",
      trackId: "t1",
      name: "CC Sweep",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: ccOnlyPat
    });
    const seq: TimelineSequence = {
      id: "seq_cc",
      projectId: "p1",
      name: "CC Only",
      fps: 30,
      width: 32,
      height: 32,
      durationMs: 2000,
      tracks: [track],
      clips: [clip],
      markers: [],
      tempo: DEFAULT_TEMPO,
      createdAt: "",
      updatedAt: ""
    };

    const clips = mixableAudioClips(seq);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.controllers).toHaveLength(1);
    expect(clips[0]!.controllers![0]!.cc).toBe(74);
  });

  it("F1 (server): mixCompositedTimelineAudio applies pattern device automation to track filter effects and subtractive instrument cutoff", async () => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "sq1-srv-auto-"));
    dirs.push(workDir);
    const basePath = path.join(workDir, "base.mp4");
    await generateMedia({
      outPath: basePath,
      video: { source: "color=c=black:s=32x32:r=10:duration=2" }
    });

    // 1. Track insert lowpass filter automated from 120 Hz (very muted) to 6000 Hz (bright) at 1000ms.
    const filterId = "fx_lp_1";
    const sawNoteRow = makeRow({
      id: "n1",
      assignment: { type: "note", pitch: 48 }, // C2 saw (rich harmonics)
      steps: [{ on: true, velocity: 120 }, { tie: true }, { tie: true }, { tie: true }]
    });
    const filterAutoRow = makeRow({
      id: "a_fx",
      assignment: {
        type: "automation",
        target: { kind: "device", deviceId: filterId, param: "frequency" }
      },
      automationMode: "latch",
      subrows: ["value"],
      steps: [{ on: true, value: 120 }, {}, { on: true, value: 6000 }, {}]
    });
    const fxSeq: TimelineSequence = {
      id: "seq_fx",
      projectId: "p1",
      name: "FX Auto",
      fps: 10,
      width: 32,
      height: 32,
      durationMs: 2000,
      tracks: [
        makeTrack({
          id: "t1",
          type: "midi",
          name: "Synth",
          index: 0,
          instrument: { ...DEFAULT_MIDI_INSTRUMENT, waveform: "saw", cutoffHz: 12000, sustain: 1 },
          effects: [
            {
              id: filterId,
              type: "filter",
              mode: "lowpass",
              frequency: 120,
              q: 0,
              enabled: true
            }
          ]
        })
      ],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Sweep",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: normalizePattern({
            lengthSteps: 4,
            stepRate: "1/4",
            rows: [sawNoteRow, filterAutoRow]
          })
        })
      ],
      markers: [],
      tempo: DEFAULT_TEMPO,
      createdAt: "",
      updatedAt: ""
    };

    const fxOut = await mixCompositedTimelineAudio({
      sequence: fxSeq,
      basePath,
      workDir: path.join(workDir, "fx").replace(/$/, "") && (await mkdtemp(path.join(workDir, "fx-"))),
      output: resolveTimelineOutput({ format: "mp4" }),
      resolveAssetPath: async () => null
    });
    const { samples: fxSamples } = await readPcm(fxOut, { sampleRate: 48000, channels: 2 });
    const firstHalfHf = hfEnergyWindow(fxSamples, 2, 48000, 0.2, 0.8);
    const secondHalfHf = hfEnergyWindow(fxSamples, 2, 48000, 1.2, 1.8);
    // At 6000 Hz vs 120 Hz on a C2 saw, the second half carries far more high-frequency harmonic energy.
    expect(secondHalfHf).toBeGreaterThan(firstHalfHf * 4);

    // 2. Instrument cutoffHz automated from 120 Hz -> 8000 Hz via deviceId: "instrument".
    const instAutoRow = makeRow({
      id: "a_inst",
      assignment: {
        type: "automation",
        target: { kind: "device", deviceId: "instrument", param: "cutoffHz" }
      },
      automationMode: "latch",
      subrows: ["value"],
      steps: [{ on: true, value: 120 }, {}, { on: true, value: 8000 }, {}]
    });
    const instSeq: TimelineSequence = {
      ...fxSeq,
      id: "seq_inst",
      tracks: [
        makeTrack({
          id: "t1",
          type: "midi",
          name: "Synth",
          index: 0,
          instrument: { ...DEFAULT_MIDI_INSTRUMENT, waveform: "saw", cutoffHz: 120, sustain: 1 }
        })
      ],
      clips: [
        makeClip({
          id: "c2",
          trackId: "t1",
          name: "Inst Sweep",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: normalizePattern({
            lengthSteps: 4,
            stepRate: "1/4",
            rows: [sawNoteRow, instAutoRow]
          })
        })
      ]
    };
    const instOut = await mixCompositedTimelineAudio({
      sequence: instSeq,
      basePath,
      workDir: await mkdtemp(path.join(workDir, "inst-")),
      output: resolveTimelineOutput({ format: "mp4" }),
      resolveAssetPath: async () => null
    });
    const { samples: instSamples } = await readPcm(instOut, { sampleRate: 48000, channels: 2 });
    const instFirst = hfEnergyWindow(instSamples, 2, 48000, 0.2, 0.8);
    const instSecond = hfEnergyWindow(instSamples, 2, 48000, 1.2, 1.8);
    expect(instSecond).toBeGreaterThan(instFirst * 4);
  }, 30_000);

  it("F5 (round 2 server): overlapping controller-only pitch-bend pattern clip bends an overlapping note clip in server export", async () => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "sq1-srv-pb-"));
    dirs.push(workDir);
    const basePath = path.join(workDir, "base.mp4");
    await generateMedia({
      outPath: basePath,
      video: { source: "color=c=black:s=32x32:r=10:duration=1" }
    });

    const sineTrack = makeTrack({
      id: "t-sine",
      type: "midi",
      name: "Lead",
      index: 0,
      instrument: {
        ...DEFAULT_MIDI_INSTRUMENT,
        waveform: "sine",
        cutoffHz: 20000,
        attackMs: 0,
        decayMs: 0,
        sustain: 1,
        releaseMs: 10
      }
    });
    const noteClip = makeClip({
      id: "c-note",
      trackId: "t-sine",
      name: "A4 Note",
      startMs: 0,
      durationMs: 1000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [
        { id: "n1", pitch: 69, velocity: 110, startTick: 0, durationTick: 1920 }
      ]
    });
    const bendPattern = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      rows: [
        makeRow({
          id: "r-pb",
          assignment: { type: "automation", target: { kind: "pitchBend" } },
          automationMode: "latch",
          subrows: ["value"],
          steps: [{ on: true, value: 8191 }, {}, {}, {}]
        })
      ]
    });
    const bendClip = makeClip({
      id: "c-pb",
      trackId: "t-sine",
      name: "PB Only",
      startMs: 0,
      durationMs: 1000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: bendPattern
    });
    const seq: TimelineSequence = {
      id: "seq_pb_overlap",
      projectId: "p1",
      name: "PB Overlap",
      fps: 10,
      width: 32,
      height: 32,
      durationMs: 1000,
      tracks: [sineTrack],
      clips: [noteClip, bendClip],
      markers: [],
      tempo: DEFAULT_TEMPO,
      createdAt: "",
      updatedAt: ""
    };

    const outFile = await mixCompositedTimelineAudio({
      sequence: seq,
      basePath,
      workDir: await mkdtemp(path.join(workDir, "pb-")),
      output: resolveTimelineOutput({ format: "mp4" }),
      resolveAssetPath: async () => null
    });
    const { samples } = await readPcm(outFile, { sampleRate: 48000, channels: 2 });
    // Measure fundamental frequency of channel 0 between 0.2s and 0.8s via rising zero crossings.
    const from = Math.round(0.2 * 48000);
    const to = Math.round(0.8 * 48000);
    let crossings = 0;
    for (let i = from + 1; i < to; i++) {
      if (samples[(i - 1) * 2]! <= 0 && samples[i * 2]! > 0) crossings++;
    }
    const freqHz = crossings / 0.6;
    // Unbent A4 is 440 Hz; +8191 (+2 semitones) bends it to B4 (~493.88 Hz).
    expect(freqHz).toBeGreaterThan(480);
    expect(freqHz).toBeLessThan(510);
  }, 30_000);
});
