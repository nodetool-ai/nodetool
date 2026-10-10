/**
 * A clip whose sources have all played to their end is released at once:
 * its sources and gain are disconnected and the graph forgets it, so the
 * decoded PCM it held is not kept reachable until the next pause or seek.
 */
import { AudioGraph, STREAM_MIN_BYTES } from "../AudioGraph";

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

interface FakeSource {
  onended: (() => void) | null;
  stop: jest.Mock;
  disconnect: jest.Mock;
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  gains: Array<{ gain: ReturnType<typeof mockParam>; disconnect: jest.Mock }> = [];
  sources: FakeSource[] = [];
  createGain = jest.fn(() => {
    const node = { gain: mockParam(), connect: jest.fn(), disconnect: jest.fn() };
    this.gains.push(node);
    return node;
  });
  createBufferSource = jest.fn(() => {
    const node = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      onended: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
      stop: jest.fn(),
      start: jest.fn()
    };
    this.sources.push(node);
    return node;
  });
  decodeAudioData = jest.fn(async () => ({ length: 48_000 }));
  createMediaElementSource = jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn()
  }));
}

function mockElement() {
  return {
    src: "",
    currentTime: 0,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    preservesPitch: true,
    crossOrigin: null as string | null,
    preload: "",
    play: jest.fn(async () => undefined),
    pause: jest.fn(),
    load: jest.fn(),
    removeAttribute: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
}

const clip = {
  id: "c1",
  currentAssetId: "asset-1",
  trackId: "t-audio",
  startMs: 0,
  durationMs: 1000,
  mediaType: "audio"
};

async function playing() {
  const ctx = new FakeAudioContext();
  const graph = new AudioGraph(ctx as unknown as BaseAudioContext);
  jest.spyOn(graph, "loadBuffer").mockResolvedValue({ length: 48_000 } as never);
  await graph.scheduleClips([{ clip, assetUrl: "/a.wav" }] as never, [], 0);
  // The master gain is made first, then the clip gain.
  return { graph, ctx, clipGain: ctx.gains[1], source: ctx.sources[0] };
}

describe("AudioGraph releasing finished clips", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("disconnects a clip once its sources have ended", async () => {
    const { graph, ctx, clipGain, source } = await playing();
    ctx.currentTime = 1;
    source.onended?.();
    jest.runAllTimers();
    expect(source.disconnect).toHaveBeenCalled();
    expect(clipGain.disconnect).toHaveBeenCalled();

    // Forgotten, so the same clip schedules afresh after a loop or an edit.
    await graph.addClips([{ clip, assetUrl: "/a.wav" }] as never, [], 0);
    expect(ctx.sources).toHaveLength(2);
  });

  it("ignores the end of a source the clip has already replaced", async () => {
    const { graph, ctx, source } = await playing();
    graph.stopClips(["c1"]);
    jest.runAllTimers();
    await graph.addClips([{ clip, assetUrl: "/a.wav" }] as never, [], 0);
    const replacementGain = ctx.gains[ctx.gains.length - 1];
    const replacement = ctx.sources[1];

    source.onended?.();
    jest.runAllTimers();
    expect(replacementGain.disconnect).not.toHaveBeenCalled();
    expect(replacement.disconnect).not.toHaveBeenCalled();
  });

  it("releases a streamed clip when its segment reaches its end", async () => {
    const ctx = new FakeAudioContext();
    const element = mockElement();
    const graph = new AudioGraph(ctx as unknown as BaseAudioContext, {
      createMediaElement: () => element as unknown as HTMLAudioElement
    });
    await graph.scheduleClips(
      [{ clip, assetUrl: "/a.wav", assetSize: STREAM_MIN_BYTES }] as never,
      [],
      0
    );
    const clipGain = ctx.gains[1];
    const gate = ctx.gains[ctx.gains.length - 1];

    ctx.currentTime = 1;
    jest.advanceTimersByTime(1000);
    jest.runAllTimers();
    expect(element.removeAttribute).toHaveBeenCalledWith("src");
    expect(gate.disconnect).toHaveBeenCalled();
    expect(clipGain.disconnect).toHaveBeenCalled();
  });
});
