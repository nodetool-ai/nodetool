/**
 * Keyed Volume (the `volumeDb` param curve): a gain node in front of the
 * clip's own ramps in dB from the play position, as the native mixer does.
 */
import { AudioGraph } from "../AudioGraph";

interface GainParam {
  value: number;
  setValueAtTime: jest.Mock;
  linearRampToValueAtTime: jest.Mock;
  setValueCurveAtTime: jest.Mock;
  setTargetAtTime: jest.Mock;
}

function mockContext(gains: GainParam[], currentTime = 0) {
  return {
    currentTime,
    createGain: jest.fn(() => {
      const gain: GainParam = {
        value: 1,
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        setValueCurveAtTime: jest.fn(),
        setTargetAtTime: jest.fn()
      };
      gains.push(gain);
      return { connect: jest.fn(), gain };
    }),
    createStereoPanner: jest.fn(() => ({
      pan: { value: 0, setTargetAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    createAnalyser: jest.fn(() => ({
      fftSize: 2048,
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    createBufferSource: jest.fn(() => ({
      buffer: null as unknown,
      playbackRate: { value: 1 },
      connect: jest.fn(),
      stop: jest.fn(),
      start: jest.fn()
    })),
    destination: {},
    decodeAudioData: jest.fn(async () => ({ length: 1024 }))
  };
}

/** Every gain node the graph creates for one clip: its own first, then the keyed Volume. */
async function scheduleGains(
  extra: Record<string, unknown>,
  currentTimeMs = 0
): Promise<GainParam[]> {
  const gains: GainParam[] = [];
  const graph = new AudioGraph();
  jest.spyOn(graph, "getContext").mockReturnValue(mockContext(gains) as never);
  jest.spyOn(graph, "loadBuffer").mockResolvedValue({ length: 1024 } as never);
  await graph.scheduleClips(
    [
      {
        clip: {
          id: "c1",
          currentAssetId: "asset-1",
          trackId: "t-audio",
          startMs: 1000,
          durationMs: 2000,
          mediaType: "audio",
          ...extra
        },
        assetUrl: "url1"
      }
    ] as never,
    [],
    currentTimeMs
  );
  return gains;
}

afterEach(() => {
  jest.restoreAllMocks();
});

const curve = (keyframes: { t: number; value: number; easing?: string }[]) => ({
  paramCurves: [{ property: "volumeDb", keyframes }]
});

describe("AudioGraph keyed Volume", () => {
  it("ramps the clip's keyed Volume in dB on the audio clock", async () => {
    const gains = await scheduleGains(curve([{ t: 0, value: -12 }, { t: 1, value: 0 }]));
    const envelope = gains[1];
    expect(envelope.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(10 ** (-12 / 20), 9), 1);
    const ramps = envelope.linearRampToValueAtTime.mock.calls;
    // Cut into 10 ms pieces, since a dB ramp is not straight in gain.
    expect(ramps.length).toBe(200);
    expect(ramps[ramps.length - 1][0]).toBeCloseTo(1, 9);
    expect(ramps[ramps.length - 1][1]).toBeCloseTo(3, 9);
    expect(ramps[99][0]).toBeCloseTo(10 ** (-6 / 20), 9);
  });

  it("starts a seek inside the clip at the level the curve has reached", async () => {
    const gains = await scheduleGains(curve([{ t: 0, value: -12 }, { t: 1, value: 0 }]), 2000);
    expect(gains[1].setValueAtTime).toHaveBeenCalledWith(expect.closeTo(10 ** (-6 / 20), 9), 0);
  });

  it("adds no node to a clip without Volume keys", async () => {
    const gains = await scheduleGains({ paramCurves: [{ property: "cropLeft", keyframes: [{ t: 0, value: 0.1 }] }] });
    expect(gains[1]?.linearRampToValueAtTime.mock.calls.length ?? 0).toBe(0);
    expect(gains[1]?.setValueAtTime.mock.calls.length ?? 0).toBe(0);
  });
});
