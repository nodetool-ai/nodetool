/**
 * The scrub grain chain prefers the current position: a newer move cuts the
 * sounding grain short after a minimum, a slow load plays where the cursor is
 * now, grains never overlap, and a cancel leaves playback alone.
 */
import {
  AudioScrubber,
  SCRUB_CUT_MS,
  SCRUB_FADE_SLACK_MS,
  SCRUB_GRAIN_MS,
  SCRUB_MIN_GRAIN_MS,
  SCRUB_RELEASE_MS
} from "../audioScrub";

interface Started {
  position: () => number;
  isStale: () => boolean;
  /** Finish the load; the grain plays from the newest position. */
  resolve: () => number;
}

function fakeOutput() {
  const started: Started[] = [];
  const output = {
    start: jest.fn(
      (position: () => number, isStale: () => boolean) =>
        new Promise<number>((resolve) => {
          started.push({
            position,
            isStale,
            resolve: () => {
              const atMs = position();
              resolve(atMs);
              return atMs;
            }
          });
        })
    ),
    release: jest.fn(),
    stop: jest.fn(),
    idle: jest.fn()
  };
  return { output, started };
}

/** Let the scrubber's await on `start` continue. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("AudioScrubber", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("plays a lone grain at full length, fades it out, then goes idle", async () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    scrubber.request(1000);
    expect(started[0].resolve()).toBe(1000);
    await settle();

    jest.advanceTimersByTime(SCRUB_GRAIN_MS - 1);
    expect(output.release).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(output.release).toHaveBeenCalledWith(SCRUB_RELEASE_MS);
    jest.advanceTimersByTime(SCRUB_RELEASE_MS + SCRUB_FADE_SLACK_MS);
    expect(output.stop).toHaveBeenCalledTimes(1);
    expect(output.idle).toHaveBeenCalledTimes(1);
  });

  it("cuts the sounding grain short for a newer move", async () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    scrubber.request(1000);
    started[0].resolve();
    await settle();

    jest.advanceTimersByTime(10);
    scrubber.request(1100);
    scrubber.request(1200);
    jest.advanceTimersByTime(SCRUB_MIN_GRAIN_MS - 10);
    expect(output.release).toHaveBeenCalledWith(SCRUB_CUT_MS);

    jest.advanceTimersByTime(SCRUB_CUT_MS + SCRUB_FADE_SLACK_MS);
    expect(output.stop).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(2);
    expect(started[1].resolve()).toBe(1200);
  });

  it("plays a slow load from where the cursor is now", async () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    scrubber.request(1000);
    scrubber.request(1500);
    scrubber.request(1600);
    expect(started).toHaveLength(1);
    expect(started[0].resolve()).toBe(1600);
    await settle();

    // The newest position already sounded, so the grain runs its full length.
    jest.advanceTimersByTime(
      SCRUB_GRAIN_MS + SCRUB_RELEASE_MS + SCRUB_FADE_SLACK_MS
    );
    expect(started).toHaveLength(1);
    expect(output.idle).toHaveBeenCalledTimes(1);
  });

  it("follows a continuous drag with grains from the newest position", async () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    let atMs = 1000;
    scrubber.request(atMs);
    const played: number[] = [];
    // 30 moves at 16 ms; each load finishes before the next move.
    for (let move = 1; move <= 30; move += 1) {
      const loading = started[played.length];
      if (loading) {
        played.push(loading.resolve());
        await settle();
      }
      atMs += 50;
      scrubber.request(atMs);
      jest.advanceTimersByTime(16);
    }
    // Grains are about the minimum plus the cut fade apart.
    const spacing = SCRUB_MIN_GRAIN_MS + SCRUB_CUT_MS + SCRUB_FADE_SLACK_MS;
    expect(played.length).toBeGreaterThanOrEqual(
      Math.floor((30 * 16) / spacing) - 1
    );
    // Every grain after the first skips to where the drag is now.
    for (let i = 1; i < played.length; i += 1) {
      expect(played[i] - played[i - 1]).toBeGreaterThan(50);
    }
    expect(output.idle).not.toHaveBeenCalled();
  });

  it("drops every timer on cancel without a fade or a stop", async () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    scrubber.request(1000);
    started[0].resolve();
    await settle();

    scrubber.cancel();
    jest.advanceTimersByTime(1000);
    expect(output.release).not.toHaveBeenCalled();
    expect(output.stop).not.toHaveBeenCalled();
    expect(output.idle).not.toHaveBeenCalled();

    // A scrub after the cancel starts a fresh grain.
    scrubber.request(2000);
    expect(started).toHaveLength(2);
    expect(started[1].resolve()).toBe(2000);
  });

  it("makes a load in flight stale on cancel", () => {
    const { output, started } = fakeOutput();
    const scrubber = new AudioScrubber(output);
    scrubber.request(1000);
    scrubber.cancel();
    expect(started[0].isStale()).toBe(true);
  });
});
