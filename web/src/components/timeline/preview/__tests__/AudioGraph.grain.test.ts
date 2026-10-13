/**
 * A scrub grain plays the mix at the scrub position, fades the master in so
 * the grain does not click, plays a streamed clip through one reused media
 * element, and schedules nothing once a newer scrub supersedes it.
 */
import { AudioGraph, STREAM_MIN_BYTES } from "../AudioGraph";

function mockParam() {
  return {
    value: 1,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    cancelAndHoldAtTime: jest.fn()
  };
}

function fakeContext() {
  const gains: Array<{ gain: ReturnType<typeof mockParam> }> = [];
  const sources: Array<{ start: jest.Mock }> = [];
  const ctx = {
    currentTime: 10,
    sampleRate: 48_000,
    destination: {},
    createGain: jest.fn(() => {
      const node = { gain: mockParam(), connect: jest.fn(), disconnect: jest.fn() };
      gains.push(node);
      return node;
    }),
    createBufferSource: jest.fn(() => {
      const node = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onended: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn()
      };
      sources.push(node);
      return node;
    }),
    createMediaElementSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn()
    })),
    decodeAudioData: jest.fn()
  };
  return { ctx, gains, sources };
}

const buffer = { duration: 4, numberOfChannels: 1, length: 4 * 48_000 };

const midiClip = {
  clip: {
    id: "m1",
    trackId: "t1",
    mediaType: "midi",
    startMs: 0,
    durationMs: 4000
  },
  buffer
};

const streamedClip = {
  clip: {
    id: "a1",
    trackId: "t1",
    mediaType: "audio",
    currentAssetId: "asset-1",
    startMs: 0,
    durationMs: 4000
  },
  assetUrl: "/api/storage/asset-1.wav",
  assetSize: STREAM_MIN_BYTES
};

describe("AudioGraph.playGrain", () => {
  it("starts the mix at the scrub position with a master fade-in", async () => {
    const { ctx, gains, sources } = fakeContext();
    const graph = new AudioGraph(ctx as never);

    await graph.playGrain([midiClip] as never, [], 1500);

    expect(sources).toHaveLength(1);
    // A buffer that is the clip's window starts 1.5 s in, at once.
    expect(sources[0].start).toHaveBeenCalledWith(10, 1.5, 2.5);
    // The master fades in along a curve that starts and ends flat.
    const master = gains[0].gain;
    const [attack, attackAt] = master.setValueCurveAtTime.mock.calls[0];
    expect(attackAt).toBe(10);
    expect(attack[0]).toBe(0);
    expect(attack[attack.length - 1]).toBeCloseTo(1, 6);
    expect(attack[1] - attack[0]).toBeLessThan(attack[16] - attack[15]);
  });

  it("fades a released grain out and restores the master on stop", async () => {
    const { ctx, gains } = fakeContext();
    const graph = new AudioGraph(ctx as never);
    await graph.playGrain([midiClip] as never, [], 1500);
    const master = gains[0].gain;

    ctx.currentTime = 10.09;
    graph.releaseGrain(0.025);
    const [release, releaseAt] = master.setValueCurveAtTime.mock.calls[1];
    expect(releaseAt).toBe(10.09);
    expect(release[0]).toBeCloseTo(1, 6);
    expect(release[release.length - 1]).toBeCloseTo(0, 6);

    ctx.currentTime = 10.12;
    graph.stopAll();
    const [restored, restoredAt] = master.setValueAtTime.mock.calls.at(-1)!;
    expect(restored).toBe(1);
    expect(restoredAt).toBeCloseTo(10.13, 6);
  });

  it("plays a streamed clip through one scrub element across grains", async () => {
    jest.useFakeTimers();
    const { ctx, sources, gains } = fakeContext();
    const elements: Array<{
      src: string;
      currentTime: number;
      playbackRate: number;
      play: jest.Mock;
      pause: jest.Mock;
      listeners: Map<string, () => void>;
    }> = [];
    const graph = new AudioGraph(ctx as never, {
      createMediaElement: () => {
        const element = {
          src: "",
          currentTime: 0,
          playbackRate: 1,
          preservesPitch: true,
          crossOrigin: null as string | null,
          preload: "",
          play: jest.fn(async () => undefined),
          pause: jest.fn(),
          load: jest.fn(),
          removeAttribute: jest.fn(),
          listeners: new Map<string, () => void>(),
          addEventListener(type: string, listener: () => void) {
            this.listeners.set(type, listener);
          }
        };
        elements.push(element);
        return element as unknown as HTMLAudioElement;
      }
    });

    await graph.playGrain([streamedClip, midiClip] as never, [], 1500);
    expect(sources).toHaveLength(1);
    expect(elements).toHaveLength(1);
    expect(elements[0].src).toBe("/api/storage/asset-1.wav");
    expect(elements[0].currentTime).toBe(1.5);
    expect(elements[0].play).toHaveBeenCalledTimes(1);
    // The scrub gain stays shut until the seek completes, then fades in.
    const voiceGain = gains[gains.length - 1].gain;
    expect(voiceGain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(voiceGain.setValueCurveAtTime).not.toHaveBeenCalled();
    elements[0].listeners.get("seeked")?.();
    expect(voiceGain.setValueCurveAtTime).toHaveBeenCalledTimes(1);

    // The grain ends: the element pauses once the ramp to silence is done.
    graph.stopAll();
    jest.runOnlyPendingTimers();
    expect(elements[0].pause).toHaveBeenCalledTimes(1);

    // The next grain seeks the same element instead of loading a new one.
    await graph.playGrain([streamedClip] as never, [], 2750);
    expect(elements).toHaveLength(1);
    expect(elements[0].currentTime).toBe(2.75);
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("schedules nothing when a newer scrub supersedes it", async () => {
    const { ctx, sources } = fakeContext();
    const graph = new AudioGraph(ctx as never);

    await graph.playGrain([midiClip] as never, [], 1500, () => true);

    expect(sources).toHaveLength(0);
  });
});
