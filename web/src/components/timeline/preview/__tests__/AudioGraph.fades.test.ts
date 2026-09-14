/**
 * Fades in the mixer: a linear one stays a straight ramp (one automation
 * event), a shaped one is scheduled as the sampled curve, a seek into a
 * running fade resumes it where it had got to, and two fades longer together
 * than the clip meet in its middle rather than crossing.
 */
import { fadeShapeGain } from "@nodetool-ai/timeline";

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

/** The clip's own gain node is the first one the graph creates. */
async function scheduleClip(
  extra: Record<string, unknown>,
  currentTimeMs = 0
): Promise<GainParam> {
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
  return gains[0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AudioGraph fades", () => {
  it("ramps a linear fade straight, in one automation event", async () => {
    const gain = await scheduleClip({ fadeInMs: 500 });
    expect(gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0, 1);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.5);
  });

  it("schedules a shaped fade as its own curve", async () => {
    const gain = await scheduleClip({ fadeInMs: 500, fadeInShape: "plus3dB" });
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    const [curve, startAt, durationSec] = gain.setValueCurveAtTime.mock.calls[0];
    expect(startAt).toBe(1);
    expect(durationSec).toBeCloseTo(0.5, 6);
    expect(curve[0]).toBeCloseTo(0, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
    expect(curve[Math.floor((curve.length - 1) / 2)]).toBeCloseTo(
      fadeShapeGain("plus3dB", 0.5),
      2
    );
  });

  it("runs a fade-out's curve down to silence at the clip's end", async () => {
    const gain = await scheduleClip({ fadeOutMs: 400, fadeOutShape: "sCurve" });
    const [curve, startAt, durationSec] = gain.setValueCurveAtTime.mock.calls[0];
    // The clip ends 3s in; the ramp covers the last 400ms of it.
    expect(startAt).toBeCloseTo(2.6, 6);
    expect(durationSec).toBeCloseTo(0.4, 6);
    expect(curve[0]).toBeCloseTo(1, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(0, 5);
  });

  it("scales the ramp by the clip's volume", async () => {
    const gain = await scheduleClip({
      fadeInMs: 500,
      fadeInShape: "sCurve",
      volumeDb: -6
    });
    const [curve] = gain.setValueCurveAtTime.mock.calls[0];
    const volumeLinear = Math.pow(10, -6 / 20);
    expect(curve[curve.length - 1]).toBeCloseTo(volumeLinear, 5);
  });

  it("resumes a fade seeked into rather than restarting it", async () => {
    // Half a second into a one-second fade-in.
    const gain = await scheduleClip(
      { fadeInMs: 1000, fadeInShape: "plus3dB" },
      1500
    );
    const [curve, , durationSec] = gain.setValueCurveAtTime.mock.calls[0];
    expect(durationSec).toBeCloseTo(0.5, 6);
    expect(curve[0]).toBeCloseTo(fadeShapeGain("plus3dB", 0.5), 5);
  });

  it("meets two crossing fades in the middle of the clip", async () => {
    const gain = await scheduleClip({
      fadeInMs: 1600,
      fadeOutMs: 1600,
      fadeInShape: "sCurve",
      fadeOutShape: "sCurve"
    });
    const [, fadeInStart, fadeInDuration] =
      gain.setValueCurveAtTime.mock.calls[0];
    const [, fadeOutStart] = gain.setValueCurveAtTime.mock.calls[1];
    expect(fadeInDuration).toBeCloseTo(1, 6);
    expect(fadeInStart + fadeInDuration).toBeCloseTo(fadeOutStart, 6);
  });

  it("holds full volume through a clip with no fade", async () => {
    const gain = await scheduleClip({});
    expect(gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });
});
