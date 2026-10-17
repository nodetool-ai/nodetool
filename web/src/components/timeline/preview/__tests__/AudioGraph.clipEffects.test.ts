/**
 * A clip's `audioEffects` run between its volume/fade gain and its track:
 * the chain is built when the clip is scheduled, an echo or reverb tail rings
 * on after the clip's sources end, and stopping playback silences that tail.
 */
import type { ClipAudioEffect } from "@nodetool-ai/timeline";
import { AudioGraph } from "../AudioGraph";

function mockParam() {
  return {
    value: 1,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    cancelAndHoldAtTime: jest.fn()
  };
}

interface FakeNode {
  kind: string;
  connect: jest.Mock;
  disconnect: jest.Mock;
  [key: string]: unknown;
}

/** Stands in for a live AudioContext, so tails are released on timers. */
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  destination = { kind: "destination" };
  nodes: FakeNode[] = [];
  sources: Array<FakeNode & { onended: (() => void) | null }> = [];

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
  createStereoPanner = jest.fn(() => this.node("panner", { pan: mockParam() }));
  createAnalyser = jest.fn(() => this.node("analyser", { fftSize: 2048 }));
  createBiquadFilter = jest.fn(() =>
    this.node("biquad", {
      type: "lowpass",
      frequency: mockParam(),
      Q: mockParam(),
      gain: mockParam()
    })
  );
  createDelay = jest.fn(() => this.node("delay", { delayTime: mockParam() }));
  createConvolver = jest.fn(() => this.node("convolver", { buffer: null }));
  createWaveShaper = jest.fn(() =>
    this.node("shaper", { curve: null, oversample: "none" })
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
  createBuffer = jest.fn((channels: number, length: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      getChannelData: (c: number) => data[c]
    };
  });
  createBufferSource = jest.fn(() => {
    const node = this.node("source", {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      stop: jest.fn(),
      start: jest.fn()
    }) as FakeNode & { onended: (() => void) | null };
    this.sources.push(node);
    return node;
  });
  resume = jest.fn(async () => undefined);
  suspend = jest.fn(async () => undefined);
  close = jest.fn(async () => undefined);
}

const ECHO: ClipAudioEffect = {
  id: "fx-echo",
  type: "echo",
  enabled: true,
  delayMs: 500,
  feedback: 0,
  mix: 0.5
};

const FILTER: ClipAudioEffect = {
  id: "fx-filter",
  type: "filter",
  enabled: true,
  mode: "highpass",
  frequency: 200,
  q: 1
};

const clipWith = (audioEffects: ClipAudioEffect[]) => ({
  id: "c1",
  currentAssetId: "asset-1",
  trackId: "t-audio",
  startMs: 0,
  durationMs: 1000,
  mediaType: "audio",
  audioEffects
});

const originalAudioContext = globalThis.AudioContext;

async function play(audioEffects: ClipAudioEffect[]) {
  const ctx = new FakeAudioContext();
  const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
  jest
    .spyOn(graph, "loadBuffer")
    .mockResolvedValue({ length: 8000 } as never);
  await graph.scheduleClips(
    [{ clip: clipWith(audioEffects), assetUrl: "/a.wav" }] as never,
    [],
    0
  );
  // Listener, mix bus and master fader come with the context; the clip gain
  // is next, then its track's chain (mute/solo gain first) on demand.
  const gains = ctx.nodes.filter((n) => n.kind === "gain");
  return { ctx, graph, clipGain: gains[3], trackGain: gains[4] };
}

describe("AudioGraph clip audio effects", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    globalThis.AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    globalThis.AudioContext = originalAudioContext;
  });

  it("routes the clip through its effects before the track", async () => {
    const { ctx, clipGain, trackGain } = await play([FILTER]);
    const filter = ctx.nodes.find((n) => n.kind === "biquad");
    expect(filter?.type).toBe("highpass");
    expect(clipGain.connect).toHaveBeenCalledWith(filter);
    expect(clipGain.connect).not.toHaveBeenCalledWith(trackGain);
    // The chain's output gain feeds the track.
    const output = ctx.nodes.find(
      (n) =>
        n.kind === "gain" &&
        n !== clipGain &&
        n.connect.mock.calls.some(([target]) => target === trackGain)
    );
    expect(output).toBeDefined();
  });

  it("connects straight to the track when every effect is disabled", async () => {
    const { ctx, clipGain, trackGain } = await play([
      { ...FILTER, enabled: false }
    ]);
    expect(ctx.nodes.some((n) => n.kind === "biquad")).toBe(false);
    expect(clipGain.connect).toHaveBeenCalledWith(trackGain);
  });

  it("lets an echo ring past the clip's end, then releases it", async () => {
    const { ctx } = await play([ECHO]);
    const delay = ctx.nodes.find((n) => n.kind === "delay");
    ctx.currentTime = 1;
    ctx.sources[0].onended?.();
    jest.advanceTimersByTime(400);
    expect(delay?.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(delay?.disconnect).toHaveBeenCalled();
  });

  it("silences a ringing tail when playback stops", async () => {
    const { ctx, graph, clipGain, trackGain } = await play([ECHO]);
    const delay = ctx.nodes.find((n) => n.kind === "delay");
    const chainOutput = ctx.nodes.find(
      (n) =>
        n.kind === "gain" &&
        n !== clipGain &&
        n.connect.mock.calls.some(([target]) => target === trackGain)
    );
    ctx.currentTime = 1;
    ctx.sources[0].onended?.();
    const outputGain = chainOutput?.gain as ReturnType<typeof mockParam>;
    expect(outputGain.cancelAndHoldAtTime).not.toHaveBeenCalled();
    graph.stopAll();
    expect(outputGain.cancelAndHoldAtTime).toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(delay?.disconnect).toHaveBeenCalled();
  });
});
