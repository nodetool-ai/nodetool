/**
 * PlaybackClock unit tests.
 *
 * Tests the RAF-driven clock logic in isolation by mocking:
 *  - `requestAnimationFrame` / `cancelAnimationFrame`
 *  - `performance.now()`
 *  - `TimelinePlaybackStore`
 */

// ── Globals ───────────────────────────────────────────────────────────────────

let rafCallback: (() => void) | null = null;
let rafId = 1;

const mockSetCurrentTimeMs = jest.fn();
const mockPause = jest.fn();

let mockIsPlaying = true;

// ── Mock requestAnimationFrame ────────────────────────────────────────────────

global.requestAnimationFrame = jest.fn((cb: () => void) => {
  rafCallback = cb;
  return rafId++;
}) as unknown as typeof requestAnimationFrame;

global.cancelAnimationFrame = jest.fn(() => {
  rafCallback = null;
}) as unknown as typeof cancelAnimationFrame;

// ── Mock TimelinePlaybackStore ────────────────────────────────────────────────

jest.mock("../../../../stores/timeline/TimelinePlaybackStore", () => ({
  useTimelinePlaybackStore: {
    getState: () => ({
      isPlaying: mockIsPlaying,
      setCurrentTimeMs: mockSetCurrentTimeMs,
      pause: mockPause
    })
  }
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

import { PlaybackClock } from "../PlaybackClock";

// ── Helper: flush pending RAF ─────────────────────────────────────────────────

function flushRAF() {
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PlaybackClock", () => {
  let clock: PlaybackClock;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    clock = new PlaybackClock();
    rafCallback = null;
    mockIsPlaying = true;
    jest.clearAllMocks();

    // Spy on performance.now so we can control elapsed time.
    nowSpy = jest.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    clock.stop();
    nowSpy.mockRestore();
  });

  it("starts the RAF loop on start()", () => {
    clock.start(0, 1);
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("writes currentTimeMs to the store on each tick", () => {
    clock.start(0, 1);
    nowSpy.mockReturnValue(1000); // advance wall clock by 1s
    flushRAF();
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(
      expect.closeTo(1000, 5) // ~1000ms
    );
  });

  it("applies playback rate to wall-clock elapsed time", () => {
    clock.start(0, 2); // 2× speed
    nowSpy.mockReturnValue(500); // 0.5s wall time
    flushRAF();
    // 2× → expect ~1000ms
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(
      expect.closeTo(1000, 5)
    );
  });

  it("starts from a non-zero position", () => {
    clock.start(5000, 1); // start at 5s
    nowSpy.mockReturnValue(1000); // 1s wall elapsed
    flushRAF();
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(
      expect.closeTo(6000, 5)
    );
  });

  it("stops the RAF loop when isPlaying becomes false", () => {
    clock.start(0, 1);
    mockIsPlaying = false;
    flushRAF();
    expect(rafCallback).toBeNull(); // no next RAF scheduled
  });

  it("stops the loop when durationMs is reached", () => {
    clock.start(0, 1, null, 2000);
    nowSpy.mockReturnValue(3000); // past end
    flushRAF();
    expect(mockPause).toHaveBeenCalled();
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(2000);
    expect(rafCallback).toBeNull(); // no next RAF scheduled
  });

  it("stop() cancels the RAF", () => {
    clock.start(0, 1);
    clock.stop();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("does not go below 0ms", () => {
    clock.start(1000, 1);
    nowSpy.mockReturnValue(-500); // clamp negative
    flushRAF();
    const arg = (mockSetCurrentTimeMs.mock.calls[0][0] as number);
    expect(arg).toBeGreaterThanOrEqual(0);
  });

  it("uses AudioContext.currentTime when provided and running", () => {
    const fakeCtx = {
      currentTime: 5,
      state: "running"
    } as unknown as AudioContext;

    clock.start(0, 1, fakeCtx);

    // Advance AudioContext time by 2s
    (fakeCtx as { currentTime: number }).currentTime = 7;
    flushRAF();

    // Elapsed = 7 - 5 = 2s → 2000ms
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(
      expect.closeTo(2000, 5)
    );
  });

  it("falls back to wall clock when AudioContext is suspended", () => {
    const fakeCtx = {
      currentTime: 5,
      state: "suspended"
    } as unknown as AudioContext;

    clock.start(0, 1, fakeCtx);
    nowSpy.mockReturnValue(2000); // 2s wall elapsed (start was at 0)
    flushRAF();

    // Should use wall clock, not AudioContext
    expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(
      expect.closeTo(2000, 5)
    );
  });
});
