/**
 * The mixer in the graph: each channel runs mute/solo gain → inserts → fader
 * (volumeDb) → panner into the mix bus, and the mix bus runs the master
 * inserts → master fader into the listener volume. Meters tap the panner and
 * the master fader.
 */
import type { TimelineTrack, TrackEffect } from "@nodetool-ai/timeline";
import { AudioGraph, dbToGain } from "../AudioGraph";

function mockParam(value = 1) {
  return {
    value,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    cancelAndHoldAtTime: jest.fn()
  };
}

type Param = ReturnType<typeof mockParam>;

interface FakeNode {
  kind: string;
  connect: jest.Mock;
  disconnect: jest.Mock;
  [key: string]: unknown;
}

class FakeContext {
  currentTime = 5;
  sampleRate = 48_000;
  destination: FakeNode = {
    kind: "destination",
    connect: jest.fn(),
    disconnect: jest.fn()
  };
  nodes: FakeNode[] = [];

  private node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const node: FakeNode = {
      kind,
      connect: jest.fn((next: unknown) => next),
      disconnect: jest.fn(),
      ...extra
    };
    this.nodes.push(node);
    return node;
  }

  createGain = jest.fn(() => this.node("gain", { gain: mockParam() }));
  createStereoPanner = jest.fn(() => this.node("panner", { pan: mockParam(0) }));
  createAnalyser = jest.fn(() => this.node("analyser", { fftSize: 0 }));
  createChannelSplitter = jest.fn(() => this.node("splitter"));
  createBiquadFilter = jest.fn(() =>
    this.node("biquad", {
      type: "lowpass",
      frequency: mockParam(),
      Q: mockParam(),
      gain: mockParam()
    })
  );
  createDynamicsCompressor = jest.fn(() =>
    this.node("compressor", {
      threshold: mockParam(),
      ratio: mockParam(),
      attack: mockParam(),
      release: mockParam(),
      knee: mockParam()
    })
  );

  of(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }
}

const gainOf = (node: FakeNode): Param => node.gain as Param;
const lastTarget = (param: Param): number =>
  param.setTargetAtTime.mock.calls.at(-1)?.[0] as number;
const feeds = (from: FakeNode, to: unknown): boolean =>
  from.connect.mock.calls.some(([target]) => target === to);

const track = (id: string, extra: Partial<TimelineTrack> = {}): TimelineTrack => ({
  id,
  name: id,
  type: "audio",
  index: 0,
  visible: true,
  locked: false,
  ...extra
});

function setup() {
  const ctx = new FakeContext();
  const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
  graph.getContext();
  // Listener volume, mix bus, master fader: made with the context.
  const [listener, mixBus, masterFader] = ctx.of("gain");
  return { ctx, graph, listener, mixBus, masterFader };
}

/** The four nodes of one track channel, in creation order. */
function channelOf(ctx: FakeContext, trackIndex: number) {
  const gains = ctx.of("gain").slice(3);
  return {
    trackGain: gains[trackIndex * 2],
    fader: gains[trackIndex * 2 + 1],
    panner: ctx.of("panner")[trackIndex],
    // The master analyser comes first.
    analyser: ctx.of("analyser")[trackIndex + 1]
  };
}

describe("AudioGraph mixer", () => {
  it("dbToGain maps decibels to linear gain", () => {
    expect(dbToGain(undefined)).toBe(1);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(-120)).toBeCloseTo(1e-6, 9);
  });

  it("wires a channel into the mix bus and taps its meter after the panner", () => {
    const { ctx, graph, mixBus } = setup();
    graph.updateTracks([track("a")]);
    const { trackGain, fader, panner, analyser } = channelOf(ctx, 0);
    expect(feeds(trackGain, fader)).toBe(true);
    expect(feeds(fader, panner)).toBe(true);
    expect(feeds(panner, mixBus)).toBe(true);
    expect(feeds(panner, analyser)).toBe(true);
    expect(graph.getTrackAnalyser("a")).toBe(analyser);
  });

  it("sets each fader from the track's volumeDb and each panner from its pan", () => {
    const { ctx, graph } = setup();
    graph.updateTracks([
      track("a", { volumeDb: -6, pan: -0.5 }),
      track("b", { type: "midi", volumeDb: 3, pan: 1 })
    ]);
    const a = channelOf(ctx, 0);
    const b = channelOf(ctx, 1);
    expect(lastTarget(gainOf(a.fader))).toBeCloseTo(dbToGain(-6), 9);
    expect(lastTarget(a.panner.pan as Param)).toBe(-0.5);
    expect(lastTarget(gainOf(b.fader))).toBeCloseTo(dbToGain(3), 9);
    expect(lastTarget(b.panner.pan as Param)).toBe(1);
  });

  it("follows a fader move without rebuilding the channel", () => {
    const { ctx, graph } = setup();
    graph.updateTracks([track("a", { volumeDb: 0 })]);
    const before = ctx.nodes.length;
    graph.updateTracks([track("a", { volumeDb: -12, pan: 0.25 })]);
    expect(ctx.nodes.length).toBe(before);
    const a = channelOf(ctx, 0);
    expect(lastTarget(gainOf(a.fader))).toBeCloseTo(dbToGain(-12), 9);
    expect(lastTarget(a.panner.pan as Param)).toBe(0.25);
  });

  it("silences non-solo tracks on the mute gain and leaves their faders alone", () => {
    const { ctx, graph } = setup();
    graph.updateTracks([
      track("a", { volumeDb: -3 }),
      track("b", { solo: true, volumeDb: -9 }),
      track("c", { type: "midi", muted: true, solo: true })
    ]);
    const [a, b, c] = [0, 1, 2].map((i) => channelOf(ctx, i));
    expect(lastTarget(gainOf(a.trackGain))).toBe(0);
    expect(lastTarget(gainOf(b.trackGain))).toBe(1);
    // Mute wins over solo.
    expect(lastTarget(gainOf(c.trackGain))).toBe(0);
    expect(lastTarget(gainOf(a.fader))).toBeCloseTo(dbToGain(-3), 9);
    expect(lastTarget(gainOf(b.fader))).toBeCloseTo(dbToGain(-9), 9);
  });

  it("upmixes a channel to stereo before its panner", () => {
    const { ctx, graph } = setup();
    graph.updateTracks([track("a")]);
    const { panner } = channelOf(ctx, 0);
    expect(panner.channelCount).toBe(2);
    expect(panner.channelCountMode).toBe("explicit");
  });

  it("makes a stereo meter tap on demand, once per channel", () => {
    const { ctx, graph, masterFader } = setup();
    expect(graph.getTrackMeter("a")).toBeNull();
    graph.updateTracks([track("a")]);
    expect(ctx.of("splitter")).toHaveLength(0);
    const tap = graph.getTrackMeter("a")!;
    expect(graph.getTrackMeter("a")).toBe(tap);
    const { panner } = channelOf(ctx, 0);
    const splitter = tap.splitter as unknown as FakeNode;
    expect(feeds(panner, splitter)).toBe(true);
    expect(splitter.connect).toHaveBeenCalledWith(tap.left, 0);
    expect(splitter.connect).toHaveBeenCalledWith(tap.right, 1);

    const master = graph.getMasterMeter()!;
    expect(feeds(masterFader, master.splitter)).toBe(true);

    graph.updateTracks([]);
    expect(splitter.disconnect).toHaveBeenCalled();
    expect(graph.getTrackMeter("a")).toBeNull();
  });

  it("runs the mix bus through the master fader into the listener volume", () => {
    const { ctx, graph, listener, mixBus, masterFader } = setup();
    expect(feeds(mixBus, masterFader)).toBe(true);
    expect(feeds(masterFader, listener)).toBe(true);
    expect(feeds(listener, ctx.destination)).toBe(true);
    // The master meter is post-fader.
    const [masterAnalyser] = ctx.of("analyser");
    expect(feeds(masterFader, masterAnalyser)).toBe(true);
    expect(graph.getMasterAnalyser()).toBe(masterAnalyser);
  });

  it("applies a master channel set before the context exists", () => {
    const ctx = new FakeContext();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
    graph.setMaster({ volumeDb: -6 });
    graph.getContext();
    const masterFader = ctx.of("gain")[2];
    expect(gainOf(masterFader).value).toBeCloseTo(dbToGain(-6), 9);
  });

  it("glides the master fader to a new volumeDb, separate from the listener", () => {
    const { graph, listener, masterFader } = setup();
    graph.setMaster({ volumeDb: -10 });
    expect(lastTarget(gainOf(masterFader))).toBeCloseTo(dbToGain(-10), 9);
    expect(gainOf(listener).setTargetAtTime).not.toHaveBeenCalled();
    graph.setMaster(undefined);
    expect(lastTarget(gainOf(masterFader))).toBe(1);
  });

  it("inserts master effects between the mix bus and the master fader", () => {
    const { ctx, graph, mixBus, masterFader } = setup();
    const compressor: TrackEffect = {
      id: "comp",
      type: "compressor",
      enabled: true,
      thresholdDb: -18,
      ratio: 4,
      attackMs: 3,
      releaseMs: 250,
      kneeDb: 6
    };
    const gain: TrackEffect = { id: "trim", type: "gain", enabled: true, gainDb: -3 };
    graph.setMaster({ volumeDb: 0, effects: [compressor, gain] });
    const [comp] = ctx.of("compressor");
    const trim = ctx.of("gain")[3];
    expect(mixBus.disconnect).toHaveBeenCalled();
    expect(feeds(mixBus, comp)).toBe(true);
    expect(feeds(comp, trim)).toBe(true);
    expect(feeds(trim, masterFader)).toBe(true);
    expect((comp.threshold as Param).value).toBe(-18);

    // Same structure: parameters change in place, no new nodes.
    const before = ctx.nodes.length;
    graph.setMaster({
      volumeDb: 0,
      effects: [{ ...compressor, thresholdDb: -30 }, gain]
    });
    expect(ctx.nodes.length).toBe(before);
    expect((comp.threshold as Param).value).toBe(-30);

    // A disabled insert leaves the chain.
    graph.setMaster({
      volumeDb: 0,
      effects: [{ ...compressor, enabled: false }, gain]
    });
    const trimAfter = ctx.of("gain").at(-1)!;
    expect(feeds(mixBus, trimAfter)).toBe(true);
    expect(feeds(trimAfter, masterFader)).toBe(true);
  });
});
