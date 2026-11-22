/**
 * SQ1 Fix Round Wave 5 — AudioGraph built-in filter cutoffHz automation (F1).
 */
import {
  DEFAULT_TEMPO,
  applyClipHarmony,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  normalizePattern,
  normalizeRow,
  tracksWithPatternAutomation,
  type DrumMidiInstrument,
  type StepPattern,
  type WavetableMidiInstrument
} from "@nodetool-ai/timeline";
import { AudioGraph } from "../AudioGraph";
import {
  registerLiveDevice,
  type LiveDeviceOptions,
  type LiveInstrumentDevice,
  type LiveNoteEvent
} from "../../daw/devices/liveDevice";

type Call = [string, ...number[]];

function makeParam(initial = 1) {
  const calls: Call[] = [];
  const record = (name: string) => (...args: number[]) => {
    calls.push([name, ...args]);
  };
  return {
    value: initial,
    calls,
    setTargetAtTime: jest.fn(record("target")),
    setValueAtTime: jest.fn(record("set")),
    linearRampToValueAtTime: jest.fn(record("ramp")),
    cancelScheduledValues: jest.fn(record("cancel"))
  };
}

class FakeFilterContext {
  currentTime = 5;
  sampleRate = 48_000;
  destination = { connect: jest.fn(), disconnect: jest.fn() };
  filters: Array<{
    type: string;
    frequency: ReturnType<typeof makeParam>;
    Q: ReturnType<typeof makeParam>;
    gain: ReturnType<typeof makeParam>;
  }> = [];

  private node(extra: Record<string, unknown> = {}) {
    return { connect: jest.fn(), disconnect: jest.fn(), ...extra };
  }
  createGain = jest.fn(() => this.node({ gain: makeParam(1) }));
  createStereoPanner = jest.fn(() => this.node({ pan: makeParam(0) }));
  createAnalyser = jest.fn(() => this.node({ fftSize: 0 }));
  createChannelSplitter = jest.fn(() => this.node());
  createBiquadFilter = jest.fn(() => {
    const f = {
      type: "lowpass",
      frequency: makeParam(1000),
      Q: makeParam(1),
      gain: makeParam(0)
    };
    this.filters.push(f);
    return this.node(f);
  });
}

describe("SQ1 Fix Round — AudioGraph filter cutoffHz automation (Wave 5)", () => {
  it("F1: automates built-in filter frequency via cutoffHz param and restores filter.frequency on stop", async () => {
    const ctx = new FakeFilterContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const track = makeTrack({
      id: "t-1",
      name: "Synth",
      type: "midi",
      index: 0,
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
    const clip = makeClip({
      id: "c-1",
      trackId: "t-1",
      name: "Sweep",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern
    });

    const effectiveTracks = tracksWithPatternAutomation([track], [clip], {
      tracks: [track],
      tempo: DEFAULT_TEMPO
    });
    await graph.scheduleClips([], effectiveTracks, 0);

    expect(ctx.filters.length).toBeGreaterThanOrEqual(1);
    const filterFreq = ctx.filters[0]!.frequency;
    const setValues = filterFreq.calls
      .filter(([op]) => op === "set" || op === "ramp")
      .map(([, v]) => v);
    expect(setValues.some((v) => Math.abs(v - 400) < 1)).toBe(true);
    expect(setValues.some((v) => Math.abs(v - 4000) < 1)).toBe(true);

    // Stopping restores the filter's own 2000 Hz value rather than 0.
    graph.stopAll();
    const lastCall = filterFreq.calls[filterFreq.calls.length - 1];
    expect(lastCall?.[0]).toBe("target");
    expect(lastCall?.[1]).toBe(2000);
  });

  it("F5 (round 2 live): AudioGraph schedules controller-only pitch-bend clips onto the live device in preview and preloadLiveDevices", async () => {
    const scheduledNotes: Array<{ tag: string; events: LiveNoteEvent[] }> = [];
    const scheduledControllers: Array<{
      tag: string;
      events: Array<{ timeSec: number; kind: string; value: number }>;
    }> = [];
    const preloadedOptions: Array<LiveDeviceOptions & { controllers?: Array<{ kind: string; value: number }> }> = [];

    registerLiveDevice("wavetable", async (_ctx, _inst, opts) => {
      preloadedOptions.push((opts ?? {}) as LiveDeviceOptions & { controllers?: Array<{ kind: string; value: number }> });
      return {
        output: { connect: jest.fn(), disconnect: jest.fn() } as unknown as AudioNode,
        setInstrument: jest.fn(),
        schedule: (events: LiveNoteEvent[], tag: string) => {
          scheduledNotes.push({ tag, events });
        },
        scheduleControllers: (
          events: Array<{ timeSec: number; kind: string; value: number }>,
          tag: string
        ) => {
          scheduledControllers.push({ tag, events });
        },
        clear: jest.fn(),
        noteOn: jest.fn(),
        noteOff: jest.fn(),
        setTempo: jest.fn(),
        dispose: jest.fn()
      } as LiveInstrumentDevice;
    });

    const wt1 = findInstrumentPreset("wt1-init")!.instrument as WavetableMidiInstrument;
    const track = makeTrack({
      id: "t-wt",
      name: "Lead",
      type: "midi",
      index: 0,
      instrument: wt1
    });
    const noteClip = makeClip({
      id: "c-note",
      trackId: "t-wt",
      name: "A4",
      startMs: 0,
      durationMs: 1000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [{ id: "n1", pitch: 69, velocity: 100, startTick: 0, durationTick: 1920 }]
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
    const pbClip = applyClipHarmony(
      makeClip({
        id: "c-pb",
        trackId: "t-wt",
        name: "PB Only",
        startMs: 0,
        durationMs: 1000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pbPattern
      }),
      { tracks: [track], tempo: DEFAULT_TEMPO }
    );

    // 1. Live playback (scheduleClips)
    const liveCtx = new FakeFilterContext();
    const liveGraph = new AudioGraph(liveCtx as unknown as BaseAudioContext);
    await liveGraph.scheduleClips(
      [
        { clip: noteClip, live: { bpm: 120, gridOffsetMs: 0 } },
        { clip: pbClip, live: { bpm: 120, gridOffsetMs: 0 } }
      ],
      [track],
      0
    );
    expect(scheduledControllers.length).toBeGreaterThanOrEqual(1);
    const pbEvents = scheduledControllers.flatMap((c) => c.events);
    expect(pbEvents.some((e) => e.kind === "pitchBend" && e.value === 8191)).toBe(true);

    // 2. Offline browser export (preloadLiveDevices)
    const offCtx = new FakeFilterContext();
    const offGraph = new AudioGraph(offCtx as unknown as BaseAudioContext);
    await offGraph.preloadLiveDevices([track], [noteClip, pbClip], 120, 0);
    const lastPreload = preloadedOptions[preloadedOptions.length - 1]!;
    expect(
      (lastPreload.controllers ?? []).some((e) => e.kind === "pitchBend" && e.value === 8191)
    ).toBe(true);
  });

  it("F38: AudioGraph preserves note expression.pitch (DR-1 kit Note +3) on live events in scheduleClips and preloadLiveDevices", async () => {
    const scheduledLive: Array<{ tag: string; events: Array<LiveNoteEvent & { pitchOffset?: number }> }> = [];
    const preloadedEvents: Array<Array<LiveNoteEvent & { pitchOffset?: number }>> = [];

    registerLiveDevice("drum", async (_ctx, _inst, opts) => {
      if (opts?.events) {
        preloadedEvents.push(opts.events as Array<LiveNoteEvent & { pitchOffset?: number }>);
      }
      return {
        output: { connect: jest.fn(), disconnect: jest.fn() } as unknown as AudioNode,
        setInstrument: jest.fn(),
        schedule: (events: LiveNoteEvent[], tag: string) => {
          scheduledLive.push({
            tag,
            events: events as Array<LiveNoteEvent & { pitchOffset?: number }>
          });
        },
        clear: jest.fn(),
        noteOn: jest.fn(),
        noteOff: jest.fn(),
        setTempo: jest.fn(),
        dispose: jest.fn()
      };
    });

    const dr1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;
    const track = makeTrack({
      id: "t-dr1",
      name: "Drums",
      type: "midi",
      index: 0,
      instrument: dr1
    });
    const kitPattern: StepPattern = normalizePattern({
      name: "Pitched Kick",
      lengthSteps: 4,
      stepRate: "1/4",
      seed: 1,
      rows: [
        normalizeRow(
          {
            id: "r-kick",
            assignment: { type: "kit", pad: 0 },
            steps: [{ on: true, note: 3, velocity: 110 }, {}, {}, {}]
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
    const harmonizedClip = applyClipHarmony(
      makeClip({
        id: "c-kick",
        trackId: "t-dr1",
        name: "Pitched Kick",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: kitPattern
      }),
      { tracks: [track], tempo: DEFAULT_TEMPO }
    );
    expect(harmonizedClip.notes?.[0]?.pitch).toBe(dr1.baseNote);
    expect(harmonizedClip.notes?.[0]?.expression?.pitch?.[0]?.value).toBe(3);

    // 1. Live preview (scheduleClips)
    const liveCtx = new FakeFilterContext();
    const liveGraph = new AudioGraph(liveCtx as unknown as BaseAudioContext);
    await liveGraph.scheduleClips(
      [{ clip: harmonizedClip, live: { bpm: 120, gridOffsetMs: 0 } }],
      [track],
      0
    );
    const liveOn = scheduledLive.flatMap((s) => s.events).find((e) => e.on);
    expect(liveOn?.pitch).toBe(dr1.baseNote);
    expect(liveOn?.pitchOffset).toBe(3);

    // 2. Offline browser export (preloadLiveDevices)
    const offCtx = new FakeFilterContext();
    const offGraph = new AudioGraph(offCtx as unknown as BaseAudioContext);
    await offGraph.preloadLiveDevices([track], [harmonizedClip], 120, 0);
    const offOn = preloadedEvents.flat().find((e) => e.on);
    expect(offOn?.pitch).toBe(dr1.baseNote);
    expect(offOn?.pitchOffset).toBe(3);
  });
});
