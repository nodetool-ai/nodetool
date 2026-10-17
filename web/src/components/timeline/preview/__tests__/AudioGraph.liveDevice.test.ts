/**
 * Midi tracks with a live instrument: the graph creates one device per track,
 * sends it each clip's notes on the context clock, withdraws a stopped clip's
 * notes, forwards the tempo, and applies an instrument edit made while the
 * device was still loading.
 */
import type { MidiInstrument, TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { AudioGraph } from "../AudioGraph";
import {
  registerLiveDevice,
  type LiveInstrumentDevice,
  type LiveNoteEvent
} from "../../daw/devices/liveDevice";

function param() {
  return { value: 1, setTargetAtTime: jest.fn(), setValueAtTime: jest.fn(), cancelScheduledValues: jest.fn() };
}

class FakeContext {
  currentTime = 10;
  sampleRate = 48_000;
  destination = { connect: jest.fn(), disconnect: jest.fn() };
  private node(extra: Record<string, unknown> = {}) {
    return { connect: jest.fn(), disconnect: jest.fn(), ...extra };
  }
  createGain = jest.fn(() => this.node({ gain: param() }));
  createStereoPanner = jest.fn(() => this.node({ pan: param() }));
  createAnalyser = jest.fn(() => this.node({ fftSize: 0 }));
  createChannelSplitter = jest.fn(() => this.node());
}

class FakeDevice implements LiveInstrumentDevice {
  output = { connect: jest.fn(), disconnect: jest.fn() } as unknown as AudioNode;
  scheduled: Array<{ tag: string; events: LiveNoteEvent[] }> = [];
  cleared: Array<string | undefined> = [];
  tempo: Array<[number, number]> = [];
  instruments: MidiInstrument[] = [];
  setInstrument = (instrument: MidiInstrument) => {
    this.instruments.push(instrument);
  };
  schedule = (events: LiveNoteEvent[], tag: string) => {
    this.scheduled.push({ tag, events });
  };
  clear = (tag?: string) => {
    this.cleared.push(tag);
  };
  noteOn = jest.fn();
  noteOff = jest.fn();
  setTempo = (bpm: number, beatZeroSec: number) => {
    this.tempo.push([bpm, beatZeroSec]);
  };
  dispose = jest.fn();
}

let devices: FakeDevice[] = [];
let release: (() => void) | null = null;
registerLiveDevice("drum", async () => {
  const device = new FakeDevice();
  devices.push(device);
  if (release === null) return device;
  await new Promise<void>((resolve) => {
    const prev = release;
    release = () => {
      prev?.();
      resolve();
    };
  });
  return device;
});

const drum = (gainDb: number): MidiInstrument =>
  ({ type: "drum", baseNote: 36, pads: [], gainDb }) as MidiInstrument;

const track = (instrument: MidiInstrument): TimelineTrack => ({
  id: "t1",
  name: "Drums",
  type: "midi",
  index: 0,
  visible: true,
  locked: false,
  instrument
});

const clip = {
  id: "c1",
  trackId: "t1",
  name: "Beat",
  startMs: 1000,
  durationMs: 2000,
  mediaType: "midi",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  // 120 BPM: beat two of the clip sits at 1500 ms.
  notes: [
    { id: "n1", pitch: 36, velocity: 100, startTick: 0, durationTick: 480 },
    { id: "n2", pitch: 38, velocity: 90, startTick: 960, durationTick: 480 }
  ]
} as TimelineClip;

beforeEach(() => {
  devices = [];
  release = null;
});

describe("AudioGraph live devices", () => {
  it("schedules a clip's notes on the context clock from the playhead", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    await graph.scheduleClips([{ clip, live: { bpm: 120 } }], [track(drum(0))], 500);
    expect(devices).toHaveLength(1);
    const [{ tag, events }] = devices[0].scheduled;
    expect(tag).toBe("c1");
    // Clip starts 500 ms after the playhead, at context time 10.
    expect(events.map((e) => [e.timeSec, e.pitch, e.on])).toEqual([
      [10.5, 36, true],
      [10.75, 36, false],
      [11, 38, true],
      [11.25, 38, false]
    ]);
    expect(devices[0].tempo.at(-1)).toEqual([120, 9.5]);
  });

  it("withdraws a stopped clip's notes and clears everything on stopAll", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    await graph.scheduleClips([{ clip, live: { bpm: 120 } }], [track(drum(0))], 0);
    graph.stopClips(["c1"]);
    expect(devices[0].cleared).toEqual(["c1"]);
    await graph.scheduleClips([{ clip, live: { bpm: 120 } }], [track(drum(0))], 0);
    graph.stopAll();
    expect(devices[0].cleared).toEqual(["c1", undefined]);
  });

  it("forwards tempo changes to running devices", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    await graph.ensureTrackDevice(track(drum(0)));
    graph.setTempo(90);
    expect(devices[0].tempo.at(-1)?.[0]).toBe(90);
  });

  it("applies an instrument edited while the device was loading", async () => {
    release = () => undefined;
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const pending = graph.ensureTrackDevice(track(drum(0)));
    graph.updateTracks([track(drum(-6))]);
    release();
    await pending;
    expect(devices).toHaveLength(1);
    expect(devices[0].instruments.at(-1)).toEqual(drum(-6));
  });
});
