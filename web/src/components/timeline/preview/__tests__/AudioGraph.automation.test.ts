/**
 * Track automation lanes in the audio graph: a play gesture ramps the fader
 * and pan on the context clock from the playhead, hands instrument lanes to
 * the track's live device, follows lane edits made while playing, and returns
 * every automated control to its own value on stop.
 */
import {
  INSTRUMENT_DEVICE_ID,
  type AutomationLane,
  type MidiInstrument,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { AudioGraph, dbToGain } from "../AudioGraph";
import {
  registerLiveDevice,
  type DeviceAutomationLane,
  type LiveInstrumentDevice
} from "../../daw/devices/liveDevice";

type Call = [string, ...number[]];

function param() {
  const calls: Call[] = [];
  const record = (name: string) => (...args: number[]) => {
    calls.push([name, ...args]);
  };
  return {
    value: 1,
    calls,
    setTargetAtTime: jest.fn(record("target")),
    setValueAtTime: jest.fn(record("set")),
    linearRampToValueAtTime: jest.fn(record("ramp")),
    cancelScheduledValues: jest.fn(record("cancel"))
  };
}
type FakeParam = ReturnType<typeof param>;

class FakeContext {
  currentTime = 10;
  sampleRate = 48_000;
  destination = { connect: jest.fn(), disconnect: jest.fn() };
  gains: FakeParam[] = [];
  pans: FakeParam[] = [];
  private node(extra: Record<string, unknown> = {}) {
    return { connect: jest.fn(), disconnect: jest.fn(), ...extra };
  }
  createGain = jest.fn(() => {
    const gain = param();
    this.gains.push(gain);
    return this.node({ gain });
  });
  createStereoPanner = jest.fn(() => {
    const pan = param();
    this.pans.push(pan);
    return this.node({ pan });
  });
  createAnalyser = jest.fn(() => this.node({ fftSize: 0 }));
  createChannelSplitter = jest.fn(() => this.node());
}

class FakeDevice implements LiveInstrumentDevice {
  output = { connect: jest.fn(), disconnect: jest.fn() } as unknown as AudioNode;
  automation: DeviceAutomationLane[][] = [];
  setInstrument = jest.fn();
  schedule = jest.fn();
  clear = jest.fn();
  noteOn = jest.fn();
  noteOff = jest.fn();
  setTempo = jest.fn();
  dispose = jest.fn();
  setAutomation = (lanes: readonly DeviceAutomationLane[]) => {
    this.automation.push([...lanes]);
  };
}

let devices: FakeDevice[] = [];
registerLiveDevice("wavetable", async () => {
  const device = new FakeDevice();
  devices.push(device);
  return device;
});

beforeEach(() => {
  devices = [];
});

const lane = (target: AutomationLane["target"], points: AutomationLane["points"]): AutomationLane => ({
  id: `lane-${target.kind}`,
  target,
  points
});

const audioTrack = (automation: AutomationLane[], extra: Partial<TimelineTrack> = {}): TimelineTrack => ({
  id: "a1",
  name: "Audio",
  type: "audio",
  index: 0,
  visible: true,
  locked: false,
  volumeDb: -6,
  automation,
  ...extra
});

/** The gain param the lane ramps: the only one with ramps on it. */
const rampedGain = (ctx: FakeContext): FakeParam => {
  const found = ctx.gains.filter((g) => g.calls.some(([name]) => name === "ramp"));
  expect(found).toHaveLength(1);
  return found[0];
};

describe("AudioGraph automation", () => {
  it("ramps the fader along a volume lane from the playhead, on the context clock", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const volume = lane({ kind: "mixer", param: "volumeDb" }, [
      { timeMs: 0, value: -20 },
      { timeMs: 1000, value: 0 }
    ]);
    await graph.scheduleClips([], [audioTrack([volume])], 500);
    const fader = rampedGain(ctx);
    // The playhead (500 ms) sits mid-ramp at context time 10.
    const start = fader.calls.findIndex(([name]) => name === "cancel");
    expect(fader.calls[start]).toEqual(["cancel", 10]);
    expect(fader.calls[start + 1][0]).toBe("set");
    expect(fader.calls[start + 1][1]).toBeCloseTo(dbToGain(-10));
    expect(fader.calls[start + 1][2]).toBe(10);
    const ramps = fader.calls.filter(([name]) => name === "ramp");
    // A dB lane ramps as gain, so the straight dB segment is cut into steps.
    expect(ramps.length).toBeGreaterThan(10);
    expect(ramps.at(-1)?.[1]).toBeCloseTo(1);
    expect(ramps.at(-1)?.[2]).toBeCloseTo(10.5);
  });

  it("maps a pan lane through the playback rate", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const pan = lane({ kind: "mixer", param: "pan" }, [
      { timeMs: 0, value: -1 },
      { timeMs: 2000, value: 1 }
    ]);
    await graph.scheduleClips([], [audioTrack([pan])], 0, undefined, 2);
    const ramps = ctx.pans[0].calls.filter(([name]) => name === "ramp");
    expect(ramps).toEqual([["ramp", 1, 11]]);
  });

  it("keeps the fader on its lane through track edits and returns it on stop", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const automation = [lane({ kind: "mixer", param: "volumeDb" }, [{ timeMs: 0, value: -12 }])];
    await graph.scheduleClips([], [audioTrack(automation)], 0);
    const fader = ctx.gains.find((g) => g.calls.some(([name, value]) => name === "set" && Math.abs(value - dbToGain(-12)) < 1e-9))!;
    expect(fader).toBeDefined();
    const before = fader.calls.length;
    // A mute toggle leaves the automated fader alone.
    graph.updateTracks([audioTrack(automation, { muted: true, volumeDb: -3 })]);
    expect(fader.calls.slice(before).some(([name]) => name === "target")).toBe(false);
    graph.stopAll();
    expect(fader.calls.at(-2)).toEqual(["cancel", 0]);
    expect(fader.calls.at(-1)?.[0]).toBe("target");
    expect(fader.calls.at(-1)?.[1]).toBeCloseTo(dbToGain(-3));
  });

  it("reschedules from the playhead when a lane is edited while playing", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const pan = lane({ kind: "mixer", param: "pan" }, [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 1 }]);
    await graph.scheduleClips([], [audioTrack([pan])], 0);
    ctx.currentTime = 10.25;
    const edited = { ...pan, points: [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: -1 }] };
    graph.updateTracks([audioTrack([edited])]);
    await Promise.resolve();
    const calls = ctx.pans[0].calls;
    const lastSet = calls.filter(([name]) => name === "set").at(-1)!;
    expect(lastSet[1]).toBeCloseTo(-0.25);
    expect(lastSet[2]).toBeCloseTo(10.25);
    expect(calls.at(-1)).toEqual(["ramp", -1, 11]);
  });

  it("hands instrument lanes to the track's live device and clears them on stop", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const instrument = { type: "wavetable" } as MidiInstrument;
    const cutoff = lane({ kind: "device", deviceId: INSTRUMENT_DEVICE_ID, param: "filter.cutoff" }, [
      { timeMs: 1000, value: 200 },
      { timeMs: 3000, value: 4000 }
    ]);
    const midi: TimelineTrack = { ...audioTrack([cutoff]), id: "m1", type: "midi", instrument };
    await graph.scheduleClips([], [midi], 2000);
    expect(devices).toHaveLength(1);
    expect(devices[0].automation.at(-1)).toEqual([
      {
        param: "filter.cutoff",
        points: [
          { timeSec: 10, value: 2100 },
          { timeSec: 11, value: 4000 }
        ]
      }
    ]);
    graph.stopAll();
    expect(devices[0].automation.at(-1)).toEqual([]);
  });

  it("skips disabled and empty lanes", async () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    const off = { ...lane({ kind: "mixer", param: "pan" }, [{ timeMs: 0, value: 1 }]), enabled: false };
    const empty = lane({ kind: "mixer", param: "volumeDb" }, []);
    await graph.scheduleClips([], [audioTrack([off, empty])], 0);
    expect(ctx.pans[0].calls.some(([name]) => name === "set")).toBe(false);
    expect(ctx.gains.some((g) => g.calls.some(([name]) => name === "ramp" || name === "set"))).toBe(false);
  });
});
