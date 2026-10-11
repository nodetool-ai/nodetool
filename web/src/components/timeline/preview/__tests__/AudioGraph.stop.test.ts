/**
 * Stopping a clip ramps it out instead of cutting it mid-waveform: pause,
 * seek and live edits all go through it, and a pause suspends the context
 * only once the ramp has finished. The export's signal reaches the fetch.
 */
import { AudioGraph } from "../AudioGraph";

function mockParam() {
  return {
    value: 0.8,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    cancelAndHoldAtTime: jest.fn()
  };
}

class FakeAudioContext {
  currentTime = 2;
  state = "running";
  destination = {};
  suspend = jest.fn(async () => undefined);
  resume = jest.fn(async () => undefined);
  close = jest.fn(async () => undefined);
  gains: Array<{ gain: ReturnType<typeof mockParam>; disconnect: jest.Mock }> = [];
  sources: Array<{ stop: jest.Mock; disconnect: jest.Mock }> = [];
  createGain = jest.fn(() => {
    const node = { gain: mockParam(), connect: jest.fn(), disconnect: jest.fn() };
    this.gains.push(node);
    return node;
  });
  createBufferSource = jest.fn(() => {
    const node = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
      stop: jest.fn(),
      start: jest.fn()
    };
    this.sources.push(node);
    return node;
  });
  decodeAudioData = jest.fn(async () => ({ length: 48_000 }));
}

const clip = {
  id: "c1",
  currentAssetId: "asset-1",
  trackId: "t-audio",
  startMs: 0,
  durationMs: 10_000,
  mediaType: "audio"
};

async function playing() {
  const original = (globalThis as { AudioContext?: unknown }).AudioContext;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  const ctx = new FakeAudioContext();
  const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
  jest.spyOn(graph, "loadBuffer").mockResolvedValue({ length: 48_000 } as never);
  await graph.scheduleClips([{ clip, assetUrl: "/a.wav" }] as never, [], 0);
  const restore = () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = original;
  };
  // The master gain is made first, then the clip gain, then its track gain.
  const clipGain = ctx.gains[1];
  return { graph, ctx, clipGain, source: ctx.sources[0], restore };
}

describe("AudioGraph stopping", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("ramps a stopped clip to silence before stopping and detaching it", async () => {
    const { graph, ctx, clipGain, source, restore } = await playing();
    try {
      graph.stopAll();
      expect(clipGain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(2);
      const [value, endAt] = clipGain.gain.linearRampToValueAtTime.mock.calls.at(-1)!;
      expect(value).toBe(0);
      expect(endAt).toBeCloseTo(2.005, 9);
      expect(source.stop).toHaveBeenCalledWith(endAt);
      expect(source.disconnect).not.toHaveBeenCalled();
      expect(clipGain.disconnect).not.toHaveBeenCalled();
      jest.advanceTimersByTime(30);
      expect(source.disconnect).toHaveBeenCalled();
      expect(clipGain.disconnect).toHaveBeenCalled();
      expect(ctx.suspend).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("suspends a paused context only after the ramp", async () => {
    const { graph, ctx, restore } = await playing();
    try {
      graph.stopAll();
      graph.suspend();
      expect(ctx.suspend).not.toHaveBeenCalled();
      jest.advanceTimersByTime(30);
      expect(ctx.suspend).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it("does not suspend a context that playback took up again", async () => {
    const { graph, ctx, restore } = await playing();
    try {
      graph.stopAll();
      graph.suspend();
      graph.getContext();
      jest.advanceTimersByTime(30);
      expect(ctx.suspend).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("AudioGraph fetch cancellation", () => {
  it("hands its signal to the asset fetch", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    try {
      const graph = new AudioGraph(
        new FakeAudioContext() as unknown as BaseAudioContext,
        { signal: controller.signal }
      );
      await graph.loadBuffer("asset-1", "/a.wav");
      expect(fetchMock).toHaveBeenCalledWith("/a.wav", { signal: controller.signal });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
