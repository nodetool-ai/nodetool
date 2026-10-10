/**
 * The WebCodecs export source picks each frame by container timestamp. The
 * renderer computes frame times in floating point, so a time can land just
 * below the timestamp of the frame it means; it must still pick that frame.
 */
interface FakeSample {
  timestamp: number;
  duration: number;
  close: () => void;
  toVideoFrame: () => { close: () => void; ts: number };
}

// 30 fps container: frame i has timestamp i/30, as a 15360-tick timescale
// stores it exactly.
const FRAME_COUNT = 300;
const samples: FakeSample[] = Array.from({ length: FRAME_COUNT }, (_, i) => ({
  timestamp: (i * 512) / 15360,
  duration: 512 / 15360,
  close: () => undefined,
  toVideoFrame: () => ({ close: () => undefined, ts: i })
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
      hasHighDynamicRange: async () => false
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

beforeAll(() => {
  (globalThis as Record<string, unknown>).VideoDecoder = {
    isConfigSupported: async () => ({ supported: true })
  };
  (globalThis as Record<string, unknown>).createImageBitmap = async (frame: {
    ts: number;
  }) => ({ frame: frame.ts, close: () => undefined });
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
      const bitmap = (await source!.frameAt(sourceSec)) as unknown as {
        frame: number;
      };
      seen.push(bitmap.frame);
    }
    expect(seen).toEqual(Array.from({ length: 200 }, (_, i) => i));
  });

  it("starts on the right frame when the first time rounds low", async () => {
    const source = await SequentialVideoSource.open("blob:clip");
    const sourceSec = 0.4 + 7 / 30 - 0.4;
    expect(sourceSec).toBeLessThan(samples[7].timestamp);
    const bitmap = (await source!.frameAt(sourceSec)) as unknown as {
      frame: number;
    };
    expect(bitmap.frame).toBe(7);
  });
});
