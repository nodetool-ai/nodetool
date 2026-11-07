/**
 * The WebCodecs export source picks each frame by container timestamp. The
 * renderer computes frame times in floating point, so a time can land just
 * below the timestamp of the frame it means; it must still pick that frame.
 */
class DecodedFrame {
  readonly close = jest.fn();

  constructor(readonly index: number) {}
}

interface FakeSample {
  timestamp: number;
  duration: number;
  close: () => void;
  toVideoFrame: () => DecodedFrame;
}

// 30 fps container: frame i has timestamp i/30, as a 15360-tick timescale
// stores it exactly.
const FRAME_COUNT = 300;
const samples: FakeSample[] = Array.from({ length: FRAME_COUNT }, (_, i) => ({
  timestamp: (i * 512) / 15360,
  duration: 512 / 15360,
  close: () => undefined,
  toVideoFrame: () => new DecodedFrame(i)
}));

jest.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  UrlSource: class {},
  Input: class {
    getPrimaryVideoTrack = async () => ({
      getDecoderConfig: async () => ({ codec: "avc1" }),
      getRotation: async () => 0,
      getPixelAspectRatio: async () => ({ num: 1, den: 1 }),
      canBeTransparent: async () => false,
      hasHighDynamicRange: async () => false,
      getDisplayWidth: async () => 1920,
      getDisplayHeight: async () => 1080
    });
    dispose = () => undefined;
  },
  VideoSampleSink: class {
    async getSample(t: number) {
      let found: FakeSample | null = null;
      for (const s of samples) {
        if (s.timestamp <= t) found = s;
      }
      return found;
    }
    async *samples(start: number) {
      for (const s of samples) {
        if (s.timestamp >= start) yield s;
      }
    }
  }
}));

import { SequentialVideoSource } from "../SequentialVideoSource";

const makeBitmap = jest.fn(async (frame: DecodedFrame) => ({
  frame: frame.index,
  close: jest.fn()
}));

beforeAll(() => {
  Object.defineProperty(globalThis, "VideoDecoder", {
    configurable: true,
    value: { isConfigSupported: async () => ({ supported: true }) }
  });
  Object.defineProperty(globalThis, "VideoFrame", { configurable: true, value: DecodedFrame });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: makeBitmap });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "VideoDecoder");
  Reflect.deleteProperty(globalThis, "VideoFrame");
  Reflect.deleteProperty(globalThis, "createImageBitmap");
});

describe("SequentialVideoSource", () => {
  it("returns frame i for a computed time one ulp below its timestamp", async () => {
    const source = await SequentialVideoSource.open("blob:clip");
    expect(source).not.toBeNull();
    const seen: number[] = [];
    // A clip that starts at 0.4s on the timeline: source time is the
    // timeline time minus its start, which rounds below i/30 for many i.
    for (let i = 0; i < 200; i += 1) {
      const timelineSec = 0.4 + i / 30;
      const sourceSec = timelineSec - 0.4;
      const frame = await source!.frameAt(sourceSec);
      expect(frame).toBeInstanceOf(DecodedFrame);
      seen.push((frame as unknown as DecodedFrame).index);
    }
    source!.dispose();
    expect(seen).toEqual(Array.from({ length: 200 }, (_, i) => i));
  });

  it("starts on the right frame when the first time rounds low", async () => {
    const source = await SequentialVideoSource.open("blob:clip");
    const sourceSec = 0.4 + 7 / 30 - 0.4;
    expect(sourceSec).toBeLessThan(samples[7].timestamp);
    const frame = await source!.frameAt(sourceSec);
    expect(frame).toMatchObject({ index: 7 });
    source!.dispose();
  });

  it("keeps the actual frame open until replacement and closes it on release", async () => {
    const source = (await SequentialVideoSource.open("blob:clip"))!;
    try {
      const first = await source.frameAt(0) as unknown as DecodedFrame;
      expect(first).toBeInstanceOf(DecodedFrame);
      expect(await source.frameAt(1 / 60)).toBe(first);
      expect(first.close).not.toHaveBeenCalled();

      const second = await source.frameAt(1 / 30) as unknown as DecodedFrame;
      expect(second).toMatchObject({ index: 1 });
      expect(first.close).toHaveBeenCalledTimes(1);
      expect(second.close).not.toHaveBeenCalled();
      expect(makeBitmap).not.toHaveBeenCalled();

      source.dispose();
      expect(second.close).toHaveBeenCalledTimes(1);
    } finally {
      source.dispose();
    }
  });
});
