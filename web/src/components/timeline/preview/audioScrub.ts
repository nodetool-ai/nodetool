/**
 * Audio scrubbing: while the timeline is paused, every playhead move plays a
 * short grain of the mix at the new position, so a drag over the ruler or the
 * playhead is heard as well as seen.
 *
 * The scrub prefers the current position over finishing old grains:
 *   - a newer move cuts the sounding grain short, after a minimum that keeps
 *     each grain long enough to be heard, and the next grain plays from the
 *     newest position;
 *   - a grain that loads plays from the newest position, not from the
 *     position that started the load.
 *
 * One grain sounds at a time and fades to silence before the next one, so
 * grains never overlap and no edge clicks.
 */

/** How long a grain sounds when no newer move arrives. */
export const SCRUB_GRAIN_MS = 90;
/** How long a grain sounds at least before a newer move cuts it short. */
export const SCRUB_MIN_GRAIN_MS = 40;
/** Fade-out of a grain that ran its full length. */
export const SCRUB_RELEASE_MS = 25;
/** Fade-out of a grain that a newer move cuts short. */
export const SCRUB_CUT_MS = 12;
/** Wait past a fade before the sources stop, for timer jitter. */
export const SCRUB_FADE_SLACK_MS = 5;

export interface ScrubOutput {
  /**
   * Start a grain. `position` returns the newest scrub position; the output
   * reads it when it schedules, so a slow load plays where the cursor is now.
   * Resolves with the position the grain plays from. `isStale` turns true
   * when a cancel supersedes the grain, so a grain never sounds over
   * playback.
   */
  start(position: () => number, isStale: () => boolean): Promise<number>;
  /** Fade the grain out over `fadeMs`. */
  release(fadeMs: number): void;
  /** Stop the faded grain's sources. */
  stop(): void;
  /** A burst of moves ended and nothing is queued. */
  idle(): void;
}

type ScrubState = "idle" | "loading" | "sounding" | "releasing";

export class AudioScrubber {
  private generation = 0;
  private state: ScrubState = "idle";
  /** The newest position no grain has played yet. */
  private latest: number | null = null;
  private soundingSince = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly output: ScrubOutput) {}

  /** Scrub to `atMs`. */
  request(atMs: number): void {
    this.latest = atMs;
    if (this.state === "idle") {
      void this.play();
    } else if (this.state === "sounding") {
      this.scheduleRelease();
    }
  }

  /**
   * Drop the queued position and every timer without a stop. Playback calls
   * this before it schedules its own sources, which a grain timer must not
   * silence.
   */
  cancel(): void {
    this.generation += 1;
    this.state = "idle";
    this.latest = null;
    this.clearTimer();
  }

  private async play(): Promise<void> {
    const generation = ++this.generation;
    const isStale = (): boolean => this.generation !== generation;
    let current = this.latest ?? 0;
    const position = (): number => {
      if (this.latest !== null) current = this.latest;
      return current;
    };
    this.state = "loading";
    let playedAt: number | null = null;
    try {
      playedAt = await this.output.start(position, isStale);
    } catch {
      // A grain that cannot load is silence. The next move tries again.
    }
    if (isStale()) return;
    if (playedAt !== null && this.latest === playedAt) this.latest = null;
    this.state = "sounding";
    this.soundingSince = Date.now();
    this.scheduleRelease();
  }

  /**
   * Plan the end of the sounding grain: soon, with a short fade, when a newer
   * position waits; at its full length otherwise.
   */
  private scheduleRelease(): void {
    this.clearTimer();
    const cut = this.latest !== null;
    const length = cut ? SCRUB_MIN_GRAIN_MS : SCRUB_GRAIN_MS;
    const elapsed = Date.now() - this.soundingSince;
    this.timer = setTimeout(
      () => this.release(cut ? SCRUB_CUT_MS : SCRUB_RELEASE_MS),
      Math.max(0, length - elapsed)
    );
  }

  private release(fadeMs: number): void {
    this.state = "releasing";
    this.output.release(fadeMs);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.output.stop();
      this.state = "idle";
      if (this.latest !== null) {
        void this.play();
      } else {
        this.output.idle();
      }
    }, fadeMs + SCRUB_FADE_SLACK_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
