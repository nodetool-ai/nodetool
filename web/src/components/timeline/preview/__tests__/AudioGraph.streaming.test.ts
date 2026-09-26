/**
 * A large audio file plays through a media element instead of a decoded
 * buffer (F9): nothing is fetched or decoded up front, the element seeks to
 * the clip's source position at the clip's rate, and a gate gain opens and
 * closes it on the audio clock. Small files and the offline export keep the
 * decoded path.
 */
import {
  AudioGraph,
  STREAM_MIN_BYTES,
  STREAM_MIN_DURATION_SEC,
  prefersStreamedPlayback
} from "../AudioGraph";

interface GainEvent {
  value: number;
  time: number;
}

function mockGain(events: GainEvent[] = []) {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: {
      value: 1,
      setValueAtTime: jest.fn((value: number, time: number) => {
        events.push({ value, time });
      }),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn(),
      setValueCurveAtTime: jest.fn()
    }
  };
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
    removeAttribute: jest.fn()
  };
}

function mockLiveContext(gains: Array<ReturnType<typeof mockGain>>) {
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: jest.fn(() => {
      const g = mockGain();
      gains.push(g);
      return g;
    }),
    createBufferSource: jest.fn(() => ({
      buffer: null as unknown,
      playbackRate: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
      stop: jest.fn(),
      start: jest.fn()
    })),
    createMediaElementSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    decodeAudioData: jest.fn()
  };
  return ctx;
}

function scheduled(extra: Record<string, unknown> = {}, asset = {}) {
  return {
    clip: {
      id: "c1",
      currentAssetId: "asset-1",
      trackId: "t-audio",
      startMs: 1000,
      durationMs: 2000,
      mediaType: "audio",
      inPointMs: 500,
      ...extra
    },
    assetUrl: "/api/storage/u/asset-1.wav",
    ...asset
  };
}

describe("prefersStreamedPlayback", () => {
  it("streams large or long files and decodes the rest", () => {
    expect(prefersStreamedPlayback(STREAM_MIN_BYTES, null)).toBe(true);
    expect(prefersStreamedPlayback(null, STREAM_MIN_DURATION_SEC)).toBe(true);
    expect(prefersStreamedPlayback(STREAM_MIN_BYTES - 1, 10)).toBe(false);
    expect(prefersStreamedPlayback(undefined, undefined)).toBe(false);
  });
});

describe("AudioGraph streamed playback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const gains: Array<ReturnType<typeof mockGain>> = [];
    const ctx = mockLiveContext(gains);
    const elements: Array<ReturnType<typeof mockElement>> = [];
    const graph = new AudioGraph(undefined, {
      createMediaElement: () => {
        const el = mockElement();
        elements.push(el);
        return el as unknown as HTMLAudioElement;
      }
    });
    jest.spyOn(graph, "getContext").mockReturnValue(ctx as never);
    const loadBuffer = jest.spyOn(graph, "loadBuffer");
    return { graph, ctx, gains, elements, loadBuffer };
  }

  it("streams a large file through a gated media element without decoding it", async () => {
    const { graph, ctx, gains, elements, loadBuffer } = setup();

    await graph.scheduleClips(
      [
        scheduled({ speedMultiplier: 2 }, { assetSize: STREAM_MIN_BYTES })
      ] as never,
      [],
      0
    );

    expect(loadBuffer).not.toHaveBeenCalled();
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(elements).toHaveLength(1);
    const [el] = elements;
    expect(el.src).toBe("/api/storage/u/asset-1.wav");
    // The clip's in-point, at the clip's rate, with pitch following the rate
    // as a buffer source's does.
    expect(el.currentTime).toBe(0.5);
    expect(el.playbackRate).toBe(2);
    expect(el.preservesPitch).toBe(false);
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(el);

    // The gate is the last gain made: shut now, open at the clip's start (1 s
    // of lead), shut at its end (2 s of timeline later).
    const gate = gains[gains.length - 1];
    expect(gate.gain.setValueAtTime.mock.calls).toEqual([
      [0, 0],
      [1, 1],
      [0, 3]
    ]);

    expect(el.play).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(el.play).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(el.pause).toHaveBeenCalled();
  });

  it("seeks into the clip when playback starts mid-clip", async () => {
    const { graph, elements } = setup();

    await graph.scheduleClips(
      [scheduled({}, { assetDurationSec: STREAM_MIN_DURATION_SEC })] as never,
      [],
      1500
    );

    // 500 ms into the clip, on top of the 500 ms in-point.
    expect(elements[0].currentTime).toBe(1);
    jest.advanceTimersByTime(0);
    expect(elements[0].play).toHaveBeenCalledTimes(1);
  });

  it("releases the element when the clip is stopped", async () => {
    const { graph, elements } = setup();
    await graph.scheduleClips(
      [scheduled({}, { assetSize: STREAM_MIN_BYTES })] as never,
      [],
      0
    );

    graph.stopClips(["c1"]);
    const [el] = elements;
    expect(el.pause).toHaveBeenCalled();
    expect(el.removeAttribute).toHaveBeenCalledWith("src");
    expect(el.load).toHaveBeenCalled();
    // A stopped segment never starts.
    jest.advanceTimersByTime(5000);
    expect(el.play).not.toHaveBeenCalled();
  });

  it("decodes a small file as before", async () => {
    const { graph, ctx, elements, loadBuffer } = setup();
    loadBuffer.mockResolvedValue({ length: 1024 } as never);

    await graph.scheduleClips(
      [scheduled({}, { assetSize: 1024, assetDurationSec: 2 })] as never,
      [],
      0
    );

    expect(loadBuffer).toHaveBeenCalledWith(
      "asset-1",
      "/api/storage/u/asset-1.wav"
    );
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(elements).toHaveLength(0);
  });

  it("decodes even a large file on a context that cannot stream (the export)", async () => {
    const { graph, ctx, elements, loadBuffer } = setup();
    loadBuffer.mockResolvedValue({ length: 1024 } as never);
    // An OfflineAudioContext has no createMediaElementSource.
    delete (ctx as Partial<typeof ctx>).createMediaElementSource;

    await graph.scheduleClips(
      [scheduled({}, { assetSize: STREAM_MIN_BYTES * 4 })] as never,
      [],
      0
    );

    expect(loadBuffer).toHaveBeenCalledTimes(1);
    expect(elements).toHaveLength(0);
  });
});
