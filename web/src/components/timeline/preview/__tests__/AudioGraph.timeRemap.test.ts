/**
 * A remapped clip's sound follows the curve (D13).
 *
 * The picture reads `timeRemap` point by point; the mixer cannot — a buffer
 * source plays at one rate. So the curve becomes constant-rate stretches and
 * each gets its own source. The rates here are computed from the keyframes,
 * not read off the implementation, and the plain-clip case pins that a clip
 * with no remap is scheduled exactly as it was before the curve existed.
 */
import { AudioGraph } from "../AudioGraph";

interface StartedSource {
  playbackRate: number;
  when: number;
  offset: number;
  duration: number;
}

function mockContext(started: StartedSource[], currentTime = 0) {
  const gain = () => ({
    connect: jest.fn(),
    gain: {
      value: 1,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setTargetAtTime: jest.fn()
    }
  });
  return {
    currentTime,
    createGain: jest.fn(gain),
    createBufferSource: jest.fn(() => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: jest.fn(),
        stop: jest.fn(),
        start: jest.fn((when: number, offset: number, duration: number) => {
          started.push({
            playbackRate: src.playbackRate.value,
            when,
            offset,
            duration
          });
        })
      };
      return src;
    }),
    destination: {},
    decodeAudioData: jest.fn(async () => ({ length: 1024 }))
  };
}

function audioClip(extra: Record<string, unknown>) {
  return {
    clip: {
      id: "c1",
      currentAssetId: "asset-1",
      trackId: "t-audio",
      startMs: 1000,
      durationMs: 1000,
      mediaType: "audio",
      ...extra
    },
    assetUrl: "url1"
  };
}

async function schedule(
  clipExtra: Record<string, unknown>,
  currentTimeMs = 0
): Promise<StartedSource[]> {
  const started: StartedSource[] = [];
  const graph = new AudioGraph();
  jest
    .spyOn(graph, "getContext")
    .mockReturnValue(mockContext(started) as never);
  jest
    .spyOn(graph, "loadBuffer")
    .mockResolvedValue({ length: 1024 } as never);
  await graph.scheduleClips(
    [audioClip(clipExtra)] as never,
    [],
    currentTimeMs
  );
  return started;
}

describe("AudioGraph time remap", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("schedules a clip with no remap as one source at its own rate", async () => {
    const started = await schedule({ speedMultiplier: 2, inPointMs: 500 });
    expect(started).toEqual([
      // 1s of lead, the in-point as the buffer offset, 2 buffer seconds per
      // timeline second for the clip's whole 1000ms.
      { playbackRate: 2, when: 1, offset: 0.5, duration: 2 }
    ]);
  });

  it("plays a 2× ramp as one source at the curve's rate, ignoring the clip's", async () => {
    const started = await schedule({
      speedMultiplier: 4,
      inPointMs: 5000,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    });
    expect(started).toEqual([
      { playbackRate: 2, when: 1, offset: 0, duration: 2 }
    ]);
  });

  it("gives each stretch of a multi-keyframe curve its own source", async () => {
    // Half the clip at 1×, then half at 0.5×.
    const started = await schedule({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.5, sourceMs: 500 },
          { t: 1, sourceMs: 750 }
        ]
      }
    });
    expect(started).toHaveLength(2);
    expect(started[0]).toEqual({
      playbackRate: 1,
      when: 1,
      offset: 0,
      duration: 0.5
    });
    expect(started[1]).toEqual({
      playbackRate: 0.5,
      when: 1.5,
      offset: 0.5,
      duration: 0.25
    });
  });

  it("cuts an eased stretch into sources whose rates climb with the curve", async () => {
    const started = await schedule({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 1000, easing: "easeIn" }
        ]
      }
    });
    expect(started.length).toBeGreaterThan(1);
    for (let i = 1; i < started.length; i++) {
      expect(started[i]!.playbackRate).toBeGreaterThan(
        started[i - 1]!.playbackRate
      );
      expect(started[i]!.when).toBeCloseTo(
        started[i - 1]!.when + started[i - 1]!.duration / started[i - 1]!.playbackRate,
        6
      );
    }
  });

  it("stays silent where the curve runs backwards or holds", async () => {
    // Forward for the first half, backwards for the second: one source.
    const started = await schedule({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.5, sourceMs: 1000 },
          { t: 1, sourceMs: 0 }
        ]
      }
    });
    expect(started).toEqual([
      { playbackRate: 2, when: 1, offset: 0, duration: 1 }
    ]);
  });

  it("starts a stretch the playhead sits inside at the right source offset", async () => {
    // Playhead 750ms into a 1× clip that starts at 1000ms — half way through
    // the second stretch, which is 500ms of source in.
    const started = await schedule(
      {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 0.5, sourceMs: 500 },
            { t: 1, sourceMs: 1000 }
          ]
        }
      },
      1750
    );
    expect(started).toEqual([
      { playbackRate: 1, when: 0, offset: 0.75, duration: 0.25 }
    ]);
  });
});
