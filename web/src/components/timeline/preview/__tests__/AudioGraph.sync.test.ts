/**
 * Timing and cache rules for the audio graph: a top-up samples the playhead
 * after decode (F13), the buffer cache is keyed by asset and URL (F29), and a
 * streamed element re-syncs when it really starts playing (F59).
 */
import { AudioGraph, audioBufferCacheKey } from "../AudioGraph";

function mockGain() {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: {
      value: 1,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
      setValueCurveAtTime: jest.fn()
    }
  };
}

function mockContext() {
  const sources: Array<{ start: jest.Mock }> = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: jest.fn(() => mockGain()),
    createBufferSource: jest.fn(() => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: jest.fn(),
        disconnect: jest.fn(),
        stop: jest.fn(),
        start: jest.fn()
      };
      sources.push(src);
      return src;
    }),
    createMediaElementSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    decodeAudioData: jest.fn(async () => ({ duration: 5 }))
  };
  return { ctx, sources };
}

const clip = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  currentAssetId: "asset-1",
  trackId: "t",
  startMs: 40_000,
  durationMs: 4000,
  mediaType: "audio",
  inPointMs: 0,
  ...extra
});

describe("addClips timeline position (F13)", () => {
  it("reads the playhead after decode, not before", async () => {
    const { ctx, sources } = mockContext();
    const graph = new AudioGraph();
    jest.spyOn(graph, "getContext").mockReturnValue(ctx as never);
    // Decoding takes two seconds on the audio clock, during which the
    // playhead advances by the same amount.
    jest.spyOn(graph, "loadBuffer").mockImplementation(async () => {
      ctx.currentTime += 2;
      return { duration: 5 } as AudioBuffer;
    });
    let playheadMs = 38_000;
    const getTimeMs = jest.fn(() => {
      return playheadMs + ctx.currentTime * 1000;
    });

    await graph.addClips(
      [{ clip: clip(), assetUrl: "/a.wav" }] as never,
      [],
      getTimeMs
    );

    // At the post-decode instant the playhead is 40 s: the clip starts now.
    expect(sources[0]!.start).toHaveBeenCalledTimes(1);
    const [when] = sources[0]!.start.mock.calls[0]!;
    expect(when).toBeCloseTo(ctx.currentTime, 5);
  });

  it("still takes a fixed position", async () => {
    const { ctx, sources } = mockContext();
    const graph = new AudioGraph();
    jest.spyOn(graph, "getContext").mockReturnValue(ctx as never);
    jest
      .spyOn(graph, "loadBuffer")
      .mockResolvedValue({ duration: 5 } as AudioBuffer);
    await graph.addClips(
      [{ clip: clip(), assetUrl: "/a.wav" }] as never,
      [],
      38_000
    );
    const [when] = sources[0]!.start.mock.calls[0]!;
    expect(when).toBeCloseTo(2, 5);
  });
});

describe("buffer cache key (F29)", () => {
  it("separates the same asset id at different URLs", () => {
    expect(audioBufferCacheKey("a", "/v1.wav")).not.toBe(
      audioBufferCacheKey("a", "/v2.wav")
    );
  });

  it("decodes again when a relinked asset keeps its id but changes URL", async () => {
    const { ctx } = mockContext();
    const graph = new AudioGraph(ctx as never);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    }));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    await graph.loadBuffer("a", "/v1.wav");
    await graph.loadBuffer("a", "/v1.wav");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await graph.loadBuffer("a", "/v2.wav");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/v2.wav");
  });
});

describe("streamed start (F59)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("seeks forward on 'playing' when buffering left the element behind", async () => {
    const { ctx } = mockContext();
    const listeners = new Map<string, () => void>();
    const element = {
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
      addEventListener: jest.fn((name: string, fn: () => void) => {
        listeners.set(name, fn);
      }),
      removeEventListener: jest.fn((name: string) => {
        listeners.delete(name);
      })
    };
    const graph = new AudioGraph(undefined, {
      createMediaElement: () => element as unknown as HTMLAudioElement
    });
    jest.spyOn(graph, "getContext").mockReturnValue(ctx as never);

    await graph.addClips(
      [
        {
          clip: clip({ startMs: 0, durationMs: 60_000 }),
          assetUrl: "/long.wav",
          assetSize: 1e9
        }
      ] as never,
      [],
      0
    );
    jest.runOnlyPendingTimers();
    // Buffering took 1.5 s of audio-clock time before the first sample.
    ctx.currentTime = 1.5;
    element.currentTime = 0;
    listeners.get("playing")!();
    expect(element.currentTime).toBeCloseTo(1.5, 5);
  });
});
