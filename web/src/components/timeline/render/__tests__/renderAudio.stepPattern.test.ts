/**
 * SQ1 Fix Round Wave 5 — renderTimelineAudio step-pattern defects (F1 web export, F5 web export).
 */
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  normalizePattern,
  normalizeRow,
  type StepPattern,
  type TimelineClip,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { clearSamplerAudioCache } from "../../preview/samplerAudio";
import { renderTimelineAudio } from "../renderAudio";

interface CapturedCall {
  clips: Array<{ clip: TimelineClip; buffer?: { channel: Float32Array } }>;
  tracks: TimelineTrack[];
}

const scheduleCalls: CapturedCall[] = [];

jest.mock("../../preview/AudioGraph", () => ({
  AudioGraph: class {
    setMaster(): void {}
    setTempo(): void {}
    preloadLiveDevices(): Promise<Set<string>> {
      return Promise.resolve(new Set());
    }
    scheduleClips(
      clips: Array<{ clip: TimelineClip; buffer?: { channel: Float32Array } }>,
      tracks: TimelineTrack[]
    ) {
      scheduleCalls.push({ clips, tracks });
      return Promise.resolve();
    }
  }
}));

class MockOfflineAudioContext {
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number
  ) {}
  createBuffer(_channels: number, length: number) {
    const channel = new Float32Array(length);
    return { length, getChannelData: () => channel, channel };
  }
  startRendering() {
    return Promise.resolve({ length: this.length } as AudioBuffer);
  }
}

function hfEnergyWindow(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = Math.max(1, start); i < Math.min(samples.length, end); i += 1) {
    const diff = samples[i]! - samples[i - 1]!;
    sum += diff * diff;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

describe("SQ1 Fix Round — renderTimelineAudio step patterns (Wave 5)", () => {
  beforeEach(() => {
    clearSamplerAudioCache();
    scheduleCalls.length = 0;
    (
      globalThis as unknown as { OfflineAudioContext: unknown }
    ).OfflineAudioContext = MockOfflineAudioContext;
  });

  it("F1 (web export): derives pattern device automation onto tracks passed to AudioGraph and sweeps subtractive cutoffHz", async () => {
    const track: TimelineTrack = makeTrack({
      id: "t-synth",
      name: "Synth",
      type: "midi",
      index: 0,
      instrument: {
        ...DEFAULT_MIDI_INSTRUMENT,
        waveform: "saw",
        cutoffHz: 2000,
        resonance: 1,
        attackMs: 5,
        decayMs: 50,
        sustain: 1,
        releaseMs: 50
      },
      effects: [
        {
          id: "fx-flt",
          type: "filter",
          mode: "lowpass",
          frequency: 2000,
          q: 1,
          enabled: true
        }
      ]
    });

    const pattern: StepPattern = normalizePattern({
      name: "Filter Sweep",
      lengthSteps: 4,
      stepRate: "1/4",
      seed: 1,
      rows: [
        normalizeRow(
          {
            id: "r-note",
            assignment: { type: "note", pitch: 36 },
            steps: [
              { on: true, velocity: 120, gate: 100 },
              { on: false, tie: true },
              { on: false, tie: true },
              { on: false, tie: true }
            ]
          },
          {
            lengthSteps: 4,
            stepRate: "1/4",
            playback: "forward",
            midiChannel: 1,
            automationMode: "latch"
          }
        ),
        normalizeRow(
          {
            id: "r-fx",
            assignment: {
              type: "automation",
              target: { kind: "device", deviceId: "fx-flt", param: "cutoffHz" }
            },
            automationMode: "slide",
            steps: [
              { on: true, value: 400 },
              { on: true, value: 1600 },
              { on: true, value: 2800 },
              { on: true, value: 4000 }
            ]
          },
          {
            lengthSteps: 4,
            stepRate: "1/4",
            playback: "forward",
            midiChannel: 1,
            automationMode: "latch"
          }
        ),
        normalizeRow(
          {
            id: "r-inst",
            assignment: {
              type: "automation",
              target: { kind: "device", deviceId: "instrument", param: "cutoffHz" }
            },
            automationMode: "latch",
            steps: [
              { on: true, value: 120 },
              { on: true, value: 120 },
              { on: true, value: 5000 },
              { on: true, value: 5000 }
            ]
          },
          {
            lengthSteps: 4,
            stepRate: "1/4",
            playback: "forward",
            midiChannel: 1,
            automationMode: "latch"
          }
        )
      ]
    });

    const clip: TimelineClip = makeClip({
      id: "c-sweep",
      trackId: "t-synth",
      name: "Sweep",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern
    });

    await renderTimelineAudio({
      clips: [clip],
      tracks: [track],
      tempo: DEFAULT_TEMPO,
      durationMs: 2000,
      sampleRate: 24_000,
      resolveUrl: async () => undefined
    });

    expect(scheduleCalls).toHaveLength(1);
    const scheduledTrack = scheduleCalls[0]!.tracks.find((t) => t.id === "t-synth")!;
    const fxLane = (scheduledTrack.automation ?? []).find(
      (l) =>
        l.target.kind === "device" &&
        l.target.deviceId === "fx-flt" &&
        l.target.param === "cutoffHz"
    );
    expect(fxLane).toBeDefined();
    expect(fxLane!.points.some((p) => p.value === 400)).toBe(true);
    expect(fxLane!.points.some((p) => p.value === 4000)).toBe(true);

    // Subtractive instrument cutoffHz sweep also affects rendered PCM directly.
    const pcm = scheduleCalls[0]!.clips[0]!.buffer!.channel;
    const lowHf = hfEnergyWindow(pcm, 2400, 18000);
    const highHf = hfEnergyWindow(pcm, 28000, 44000);
    expect(highHf).toBeGreaterThan(lowHf * 4);
  });

  it("F5 (web export): retains a CC-only pattern clip with zero notes", async () => {
    const track = makeTrack({
      id: "t-midi",
      name: "Synth",
      type: "midi",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const ccOnlyPattern: StepPattern = normalizePattern({
      name: "CC Sweep",
      lengthSteps: 4,
      stepRate: "1/4",
      seed: 1,
      rows: [
        normalizeRow(
          {
            id: "r-cc",
            assignment: { type: "automation", target: { kind: "cc", cc: 74 } },
            automationMode: "slide",
            steps: [
              { on: true, value: 20 },
              { on: true, value: 60 },
              { on: true, value: 100 },
              { on: true, value: 127 }
            ]
          },
          {
            lengthSteps: 4,
            stepRate: "1/4",
            playback: "forward",
            midiChannel: 1,
            automationMode: "latch"
          }
        )
      ]
    });
    const clip = makeClip({
      id: "c-cc-only",
      trackId: "t-midi",
      name: "CC Sweep",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: ccOnlyPattern
    });

    const rendered = await renderTimelineAudio({
      clips: [clip],
      tracks: [track],
      tempo: DEFAULT_TEMPO,
      durationMs: 2000,
      resolveUrl: async () => undefined
    });

    expect(rendered).not.toBeNull();
    expect(scheduleCalls).toHaveLength(1);
    expect(scheduleCalls[0]!.clips.map((c) => c.clip.id)).toContain("c-cc-only");
  });

  it("F5 (round 2 web export): overlapping controller-only pitch-bend pattern clip audibly bends note clip PCM", async () => {
    const sampleRate = 24_000;
    const track = makeTrack({
      id: "t-pb",
      name: "Lead",
      type: "midi",
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
      trackId: "t-pb",
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
    const pbPattern: StepPattern = normalizePattern({
      name: "PB Only",
      lengthSteps: 4,
      stepRate: "1/4",
      seed: 1,
      rows: [
        normalizeRow(
          {
            id: "r-pb",
            assignment: { type: "automation", target: { kind: "pitchBend" } },
            automationMode: "latch",
            steps: [{ on: true, value: 8191 }, {}, {}, {}]
          },
          {
            lengthSteps: 4,
            stepRate: "1/4",
            playback: "forward",
            midiChannel: 1,
            automationMode: "latch"
          }
        )
      ]
    });
    const pbClip = makeClip({
      id: "c-pb",
      trackId: "t-pb",
      name: "Pitch Bend",
      startMs: 0,
      durationMs: 1000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: pbPattern
    });

    await renderTimelineAudio({
      clips: [noteClip, pbClip],
      tracks: [track],
      tempo: DEFAULT_TEMPO,
      durationMs: 1000,
      sampleRate,
      resolveUrl: async () => undefined
    });

    expect(scheduleCalls).toHaveLength(1);
    const renderedNote = scheduleCalls[0]!.clips.find((c) => c.clip.id === "c-note")!;
    const pcm = renderedNote.buffer!.channel;
    const from = Math.round(0.2 * sampleRate);
    const to = Math.round(0.8 * sampleRate);
    let crossings = 0;
    for (let i = from + 1; i < to; i++) {
      if (pcm[i - 1]! <= 0 && pcm[i]! > 0) crossings++;
    }
    const freqHz = crossings / 0.6;
    // Unbent A4 is 440 Hz; +8191 (+2 semitones) bends it to B4 (~493.88 Hz).
    expect(freqHz).toBeGreaterThan(480);
    expect(freqHz).toBeLessThan(510);
  });
});
