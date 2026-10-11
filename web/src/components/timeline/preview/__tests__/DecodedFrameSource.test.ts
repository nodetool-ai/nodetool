/**
 * The WebCodecs preview source against a fake sink of 30 fps samples: frame
 * selection, the restart rule, the queue bounds, random access, the software
 * retry, and that every frame and sample is closed.
 */
import {
  DecodedFrameSource,
  MAX_OPEN_FRAMES,
  openDecodedFrameCount,
  type FrameSample,
  type FrameSampleSink
} from "../DecodedFrameSource";
import { selectFrameIndex } from "../../render/clipDecoder";

const FPS = 30;

interface SinkStats {
  samplesCalls: number[];
  getSampleCalls: number[];
  openSamples: number;
  /** `VideoFrame`s made and not yet closed. */
  openFrames: number;
  inFlight: number;
  maxInFlight: number;
}

interface FakeSinkOptions {
  frameCount?: number;
  /** Throw from the first `next()` of every iterator. */
  failDecode?: boolean;
  /**
   * Select frames as mediabunny does: the last timestamp <= the request, with
   * no slack. A time one ulp below a frame's timestamp gets the frame before.
   */
  strict?: boolean;
  /** Hand `getSample` calls to the test instead of answering them. */
  deferGetSample?: (sec: number) => Promise<FrameSample | null>;
}

function fakeSink(options: FakeSinkOptions = {}): { sink: FrameSampleSink; stats: SinkStats } {
  const frameCount = options.frameCount ?? 300;
  const stats: SinkStats = {
    samplesCalls: [],
    getSampleCalls: [],
    openSamples: 0,
    openFrames: 0,
    inFlight: 0,
    maxInFlight: 0
  };
  const sample = (index: number): FrameSample => {
    stats.openSamples += 1;
    let closed = false;
    return {
      timestamp: index / FPS,
      duration: 1 / FPS,
      toVideoFrame: () => {
        let frameClosed = false;
        stats.openFrames += 1;
        const frame = {
          timestamp: Math.round((index * 1_000_000) / FPS),
          index,
          close: () => {
            if (frameClosed) return;
            frameClosed = true;
            stats.openFrames -= 1;
          },
          get closed() {
            return frameClosed;
          }
        };
        return frame as unknown as VideoFrame;
      },
      close: () => {
        if (closed) return;
        closed = true;
        stats.openSamples -= 1;
      }
    };
  };
  const indexAt = (sec: number) => {
    if (!options.strict) return Math.floor(sec * FPS + 1e-9);
    let index = -1;
    for (let i = 0; i < frameCount && i / FPS <= sec; i += 1) index = i;
    return index;
  };
  const sink: FrameSampleSink = {
    async *samples(startSec: number) {
      stats.samplesCalls.push(startSec);
      if (options.failDecode) throw new Error("decoder failed");
      for (let i = Math.max(0, indexAt(startSec)); i < frameCount; i += 1) {
        yield sample(i);
      }
    },
    async getSample(sec: number) {
      stats.getSampleCalls.push(sec);
      if (options.deferGetSample) return options.deferGetSample(sec);
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stats.inFlight -= 1;
      if (options.failDecode) throw new Error("decoder failed");
      const index = indexAt(sec);
      return index < 0 ? null : sample(Math.min(index, frameCount - 1));
    }
  };
  return { sink, stats };
}

async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function frameIndex(frame: VideoFrame | null): number | null {
  return frame ? (frame as unknown as { index: number }).index : null;
}

function makeSource(sink: FrameSampleSink, onError = jest.fn()) {
  return new DecodedFrameSource({
    id: "clip:asset",
    width: 1920,
    height: 1080,
    createSink: () => sink,
    onError
  });
}

describe("DecodedFrameSource", () => {
  it("draws the last frame that starts at or before the target", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    await source.seek(1, "exact");
    expect(frameIndex(source.frameAt(1))).toBe(30);
    // Between frames 30 and 31 the earlier frame belongs to the time.
    source.advance(1 + 0.5 / FPS, 1);
    expect(frameIndex(source.frameAt(1 + 0.5 / FPS))).toBe(30);
    // One ulp below a frame's timestamp still selects that frame.
    const ulpBelow = 31 / FPS - Number.EPSILON;
    source.advance(ulpBelow, 1);
    await settle();
    expect(frameIndex(source.frameAt(ulpBelow))).toBe(31);
    source.dispose();
  });

  it("selects the same frame as the export rule for every target", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    const timestamps = Array.from({ length: 300 }, (_, i) => i / FPS);
    for (let i = 0; i < 120; i += 1) {
      // Clip-relative times computed the way the timeline computes them.
      const target = 0.4 + i / FPS - 0.4;
      await source.seek(target, "exact");
      expect(frameIndex(source.frameAt(target))).toBe(selectFrameIndex(timestamps, target));
    }
    source.dispose();
  });

  it("decodes ahead while playing and never holds more than the cap", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    let peak = 0;
    const base = openDecodedFrameCount();
    for (let tick = 0; tick < 90; tick += 1) {
      const t = tick / 60;
      source.advance(t, 1);
      await settle(3);
      source.frameAt(t);
      peak = Math.max(peak, openDecodedFrameCount() - base);
    }
    expect(peak).toBeLessThanOrEqual(MAX_OPEN_FRAMES);
    expect(peak).toBeGreaterThan(1);
    source.dispose();
    expect(openDecodedFrameCount()).toBe(base);
  });

  it("restarts on a backward step and on a jump past one second only", async () => {
    const { sink, stats } = fakeSink();
    const source = makeSource(sink);
    await source.seek(2, "exact");
    source.frameAt(2);
    expect(stats.samplesCalls).toEqual([2]);
    // A small forward step decodes through.
    await source.seek(2.5, "exact");
    source.frameAt(2.5);
    expect(stats.samplesCalls).toEqual([2]);
    expect(frameIndex(source.frameAt(2.5))).toBe(75);
    // Backward restarts.
    await source.seek(1, "exact");
    expect(stats.samplesCalls).toEqual([2, 1]);
    expect(frameIndex(source.frameAt(1))).toBe(30);
    // A jump past the sequential gap restarts.
    await source.seek(3.5, "exact");
    expect(stats.samplesCalls).toEqual([2, 1, 3.5]);
    expect(frameIndex(source.frameAt(3.5))).toBe(105);
    source.dispose();
  });

  it("returns the held frame without waiting when the target is not decoded", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    await source.seek(1, "exact");
    expect(frameIndex(source.frameAt(1))).toBe(30);
    // A jump restarts the decode; until it lands the old frame stays drawn.
    source.advance(5, 1);
    expect(frameIndex(source.frameAt(5))).toBe(30);
    await settle();
    expect(frameIndex(source.frameAt(5))).toBe(150);
    source.dispose();
  });

  it("lets the latest exact seek win and resolves superseded ones", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    const first = source.seek(4, "exact");
    const second = source.seek(1, "exact");
    await Promise.all([first, second]);
    expect(frameIndex(source.frameAt(1))).toBe(30);
    source.dispose();
  });

  it("decodes one frame per random request with at most one in flight", async () => {
    const { sink, stats } = fakeSink();
    const source = makeSource(sink);
    await source.seek(3, "exact");
    source.frameAt(3);
    // Reverse playback: every tick moves backward.
    const requests: Promise<void>[] = [];
    for (let tick = 0; tick < 10; tick += 1) {
      requests.push(source.seek(3 - (tick + 1) / FPS, "play"));
    }
    await Promise.all(requests);
    expect(stats.maxInFlight).toBe(1);
    // Coalesced: the newest target is decoded, intermediate ones are skipped.
    expect(stats.getSampleCalls.length).toBeLessThan(10);
    expect(frameIndex(source.frameAt(3 - 10 / FPS))).toBe(80);
    source.dispose();
    expect(stats.openFrames).toBe(0);
    expect(stats.openSamples).toBe(0);
  });

  it("retries in software before the first frame and reports a second failure", async () => {
    const failing = fakeSink({ failDecode: true });
    const working = fakeSink();
    const onError = jest.fn();
    const recovered = new DecodedFrameSource({
      id: "clip:asset",
      width: 1,
      height: 1,
      createSink: (preferSoftware) => (preferSoftware ? working.sink : failing.sink),
      onError
    });
    await recovered.seek(1, "exact");
    expect(frameIndex(recovered.frameAt(1))).toBe(30);
    expect(onError).not.toHaveBeenCalled();
    recovered.dispose();

    const onSecondError = jest.fn();
    const failed = new DecodedFrameSource({
      id: "clip:asset",
      width: 1,
      height: 1,
      createSink: () => fakeSink({ failDecode: true }).sink,
      onError: onSecondError
    });
    await failed.seek(1, "exact");
    expect(onSecondError).toHaveBeenCalledTimes(1);
    expect(onSecondError.mock.calls[0][1]).toBe(true);
    expect(failed.frameAt(1)).toBeNull();
    failed.dispose();
  });

  it("finishes an exact seek past a full decode-ahead queue", async () => {
    const { sink } = fakeSink();
    const source = makeSource(sink);
    await source.seek(0, "exact");
    source.frameAt(0);
    // The queue fills to its cap while nothing draws.
    await settle();
    let resolved = false;
    void source.seek(0.6, "exact").then(() => {
      resolved = true;
    });
    await settle();
    expect(resolved).toBe(true);
    expect(frameIndex(source.frameAt(0.6))).toBe(18);
    source.dispose();
  });

  it("keeps decoding after a superseded random decode fails", async () => {
    const pending: Array<{ reject: (error: Error) => void }> = [];
    let deferNext = false;
    const strict = fakeSink();
    const { sink } = fakeSink({
      deferGetSample: (sec) => {
        if (!deferNext) return strict.sink.getSample(sec);
        deferNext = false;
        return new Promise((_resolve, reject) => pending.push({ reject }));
      }
    });
    const onError = jest.fn();
    const source = makeSource(sink, onError);
    await source.seek(3, "exact");
    source.frameAt(3);
    // Reverse playback asks for one frame, and that decode stalls.
    deferNext = true;
    void source.seek(2, "play");
    await settle(2);
    // A paused seek supersedes it and lands.
    await source.seek(3.1, "exact");
    expect(frameIndex(source.frameAt(3.1))).toBe(93);
    // Now the stale decode fails.
    pending[0].reject(new Error("decode of a superseded frame failed"));
    await settle();
    expect(onError).not.toHaveBeenCalled();
    await source.seek(3.2, "exact");
    expect(frameIndex(source.frameAt(3.2))).toBe(96);
    source.dispose();
  });

  it("selects the export's frame on the single-frame path", async () => {
    const { sink } = fakeSink({ strict: true });
    const source = makeSource(sink);
    await source.seek(3, "exact");
    source.frameAt(3);
    const timestamps = Array.from({ length: 300 }, (_, i) => i / FPS);
    for (let i = 20; i > 0; i -= 1) {
      // Reverse playback over clip-relative times the timeline computes.
      const target = 0.4 + i / FPS - 0.4;
      await source.seek(target, "play");
      expect(frameIndex(source.frameAt(target))).toBe(selectFrameIndex(timestamps, target));
    }
    // The case the export test pins: just below frame 7's timestamp.
    expect(0.4 + 7 / FPS - 0.4).toBeLessThan(7 / FPS);
    source.dispose();
  });

  it("closes every frame and sample on dispose", async () => {
    const { sink, stats } = fakeSink();
    const source = makeSource(sink);
    const base = openDecodedFrameCount();
    source.advance(0, 1);
    await settle();
    source.frameAt(0.1);
    expect(openDecodedFrameCount()).toBeGreaterThan(base);
    source.dispose();
    await settle();
    expect(openDecodedFrameCount()).toBe(base);
    expect(stats.openFrames).toBe(0);
    expect(stats.openSamples).toBe(0);
  });
});
