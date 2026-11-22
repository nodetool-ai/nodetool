/**
 * @jest-environment jsdom
 *
 * SQ1 Fix Round Wave 5 — PreviewArea step-pattern defects (F1 preview, F5 preview).
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
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

import { installGlobal } from "../../../../test-utils/doubles";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineLayoutStore } from "../../../../stores/timeline/TimelineLayoutStore";
import { PreviewArea } from "../PreviewArea";

installGlobal("AudioContext", class AudioContext {});

jest.mock("../PreviewCompositor", () => ({
  PreviewCompositor: () =>
    React.createElement("div", { "data-testid": "preview-compositor" })
}));

const mockGetAsset = jest.fn();
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: Object.assign(
    (selector: (state: { get: typeof mockGetAsset }) => unknown) =>
      selector({ get: mockGetAsset }),
    { getState: () => ({ queryClient: null }) }
  )
}));

const mockScheduleClips = jest.fn().mockResolvedValue(1.0);
const mockUpdateTracks = jest.fn();

jest.mock("../AudioGraph", () => ({
  AudioGraph: class {
    constructor() {
      const ctx = {
        resume: jest.fn().mockResolvedValue(undefined),
        suspend: jest.fn().mockResolvedValue(undefined),
        currentTime: 1,
        state: "running" as const,
        sampleRate: 48_000,
        createBuffer: (_ch: number, length: number) => {
          const data = new Float32Array(length);
          return { length, getChannelData: () => data };
        }
      };
      const known: Record<string, unknown> = {
        context: ctx,
        scheduleClips: mockScheduleClips,
        updateTracks: mockUpdateTracks,
        addClips: jest.fn().mockResolvedValue(undefined),
        playGrain: jest.fn().mockResolvedValue(undefined),
        getMasterAnalyser: () => null,
        getContext: () => ctx
      };
      const fallbacks = new Map<string, jest.Mock>();
      return new Proxy(known, {
        get: (target, name: string) => {
          if (name in target) return target[name];
          if (!fallbacks.has(name)) fallbacks.set(name, jest.fn());
          return fallbacks.get(name);
        }
      });
    }
  }
}));

let instance: TimelineInstance;

const renderPreview = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PreviewArea audioOnly fps={30} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("SQ1 Fix Round — PreviewArea step patterns (Wave 5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTimelineLayoutStore.setState({ metronomeEnabled: false });
    instance = createTimelineInstance();
  });

  it("F1 (preview): passes derived pattern device automation tracks to AudioGraph.scheduleClips", async () => {
    const track = makeTrack({
      id: "t-synth",
      name: "Synth",
      type: "midi",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT,
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
      name: "Sweep",
      lengthSteps: 4,
      stepRate: "1/4",
      seed: 1,
      rows: [
        normalizeRow(
          {
            id: "r-note",
            assignment: { type: "note", pitch: 48 },
            steps: [
              { on: true, velocity: 100 },
              { on: true, velocity: 100 },
              { on: true, velocity: 100 },
              { on: true, velocity: 100 }
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
        )
      ]
    });
    instance.doc.setState({
      tempo: DEFAULT_TEMPO,
      tracks: [track],
      clips: [
        makeClip({
          id: "c-pat",
          trackId: "t-synth",
          name: "Sweep",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern
        })
      ]
    });

    const { unmount } = renderPreview();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Play" }));
      await waitFor(() => expect(mockScheduleClips).toHaveBeenCalled());
      const scheduledTracks = mockScheduleClips.mock.calls[0]![1] as TimelineTrack[];
      const synth = scheduledTracks.find((t) => t.id === "t-synth")!;
      const fxLane = (synth.automation ?? []).find(
        (l) =>
          l.target.kind === "device" &&
          l.target.deviceId === "fx-flt" &&
          l.target.param === "cutoffHz"
      );
      expect(fxLane).toBeDefined();
      expect(fxLane!.points.some((p) => p.value === 400)).toBe(true);
      expect(fxLane!.points.some((p) => p.value === 4000)).toBe(true);
    } finally {
      act(() => instance.playback.getState().pause());
      unmount();
    }
  });

  it("F5 (preview): schedules a CC-only pattern clip with zero notes", async () => {
    const track = makeTrack({
      id: "t-cc",
      name: "Synth",
      type: "midi",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const ccPattern: StepPattern = normalizePattern({
      name: "CC Only",
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
    instance.doc.setState({
      tempo: DEFAULT_TEMPO,
      tracks: [track],
      clips: [
        makeClip({
          id: "c-cc-preview",
          trackId: "t-cc",
          name: "CC Only",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: ccPattern
        })
      ]
    });

    const { unmount } = renderPreview();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Play" }));
      await waitFor(() => expect(mockScheduleClips).toHaveBeenCalled());
      const scheduledClips = mockScheduleClips.mock.calls[0]![0] as Array<{
        clip: TimelineClip;
      }>;
      expect(scheduledClips.map((c) => c.clip.id)).toContain("c-cc-preview");
    } finally {
      act(() => instance.playback.getState().pause());
      unmount();
    }
  });

  it("F1 (round 2 preview): subtractive preview buffer renders instrument cutoffHz automation controls", async () => {
    const hfEnergy = (samples: Float32Array, start: number, end: number): number => {
      let sum = 0;
      for (let i = Math.max(1, start); i < Math.min(samples.length, end); i++) {
        const d = samples[i]! - samples[i - 1]!;
        sum += d * d;
      }
      return Math.sqrt(sum / Math.max(1, end - start));
    };

    const track = makeTrack({
      id: "t-sub-preview",
      name: "Synth",
      type: "midi",
      index: 0,
      instrument: {
        ...DEFAULT_MIDI_INSTRUMENT,
        waveform: "saw",
        cutoffHz: 120,
        resonance: 1,
        attackMs: 5,
        decayMs: 50,
        sustain: 1,
        releaseMs: 50
      }
    });
    const pattern: StepPattern = normalizePattern({
      name: "Inst Cutoff Preview",
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
    instance.doc.setState({
      tempo: DEFAULT_TEMPO,
      tracks: [track],
      clips: [
        makeClip({
          id: "c-sub-inst",
          trackId: "t-sub-preview",
          name: "Inst Sweep",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern
        })
      ]
    });

    const { unmount } = renderPreview();
    try {
      await userEvent.click(screen.getByRole("button", { name: "Play" }));
      await waitFor(() => expect(mockScheduleClips).toHaveBeenCalled());
      const scheduledClips = mockScheduleClips.mock.calls[0]![0] as Array<{
        clip: TimelineClip;
        buffer?: { getChannelData: (ch: number) => Float32Array };
      }>;
      const pcm = scheduledClips[0]!.buffer!.getChannelData(0);
      // Sample rate is 48000 Hz; first half is 120 Hz cutoff, second half is 5000 Hz cutoff.
      const lowHf = hfEnergy(pcm, 4800, 36000);
      const highHf = hfEnergy(pcm, 56000, 88000);
      expect(highHf).toBeGreaterThan(lowHf * 4);
    } finally {
      act(() => instance.playback.getState().pause());
      unmount();
    }
  });
});
