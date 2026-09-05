import {
  useTimelinePlaybackStore,
  type TimelinePlaybackState
} from "../../../stores/timeline/TimelinePlaybackStore";

type PlaybackClockState = Pick<
  TimelinePlaybackState,
  "isPlaying" | "setTimeMs" | "setCurrentTimeMs" | "pause"
>;

export class PlaybackClock {
  constructor(
    private readonly readState: () => PlaybackClockState = () =>
      useTimelinePlaybackStore.getState()
  ) {}

  private rafId: number | null = null;
  private startPositionMs = 0;
  private startWallMs = 0;
  private audioContext: BaseAudioContext | null = null;
  /** AudioContext.currentTime captured at start() */
  private audioStartTimeSec = 0;
  private rate = 1;
  private durationMs = Infinity;
  private floorMs = 0;
  private onReachEnd: (() => void) | null = null;

  /**
   * Run from `positionMs` at `rate` (negative plays backwards) until the
   * position leaves [`floorMs`, `durationMs`]. Reaching the end calls
   * `onReachEnd` when given (a loop restarts from there) and pauses
   * otherwise; reaching the floor always pauses.
   */
  start(
    positionMs: number,
    rate = 1,
    audioContext: BaseAudioContext | null = null,
    durationMs = Infinity,
    options: { floorMs?: number; onReachEnd?: () => void } = {}
  ): void {
    this.stop();
    this.startPositionMs = positionMs;
    this.startWallMs = performance.now();
    this.rate = rate;
    this.durationMs = durationMs;
    this.floorMs = options.floorMs ?? 0;
    this.onReachEnd = options.onReachEnd ?? null;
    this.audioContext = audioContext;
    if (audioContext) {
      this.audioStartTimeSec = audioContext.currentTime;
    }
    this.tick();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(): void {
    const { isPlaying, setTimeMs, setCurrentTimeMs, pause } =
      this.readState();

    if (!isPlaying) {
      this.rafId = null;
      return;
    }

    let currentTimeMs: number;

    if (this.audioContext && this.audioContext.state === "running") {
      // Audio is master — drift-correct against AudioContext.currentTime.
      const audioElapsedSec =
        this.audioContext.currentTime - this.audioStartTimeSec;
      currentTimeMs =
        this.startPositionMs + audioElapsedSec * 1000 * this.rate;
    } else {
      // No audio (or suspended) — use wall clock.
      const wallElapsedMs = performance.now() - this.startWallMs;
      currentTimeMs = this.startPositionMs + wallElapsedMs * this.rate;
    }

    // Clamp to sequence boundaries. On the boundary case we write the
    // *reactive* snapshot (setCurrentTimeMs) before pausing so subscribers
    // see the correct final position; pause() also syncs to the live value.
    if (this.rate > 0 && currentTimeMs >= this.durationMs) {
      this.rafId = null;
      if (this.onReachEnd) {
        setTimeMs(this.durationMs);
        this.onReachEnd();
        return;
      }
      setCurrentTimeMs(this.durationMs);
      pause();
      return;
    }
    if (this.rate < 0 && currentTimeMs <= this.floorMs) {
      setCurrentTimeMs(this.floorMs);
      pause();
      this.rafId = null;
      return;
    }

    // Steady per-frame advance flows through the TRANSIENT channel: it
    // notifies imperative subscribers (compositor rAF, playhead) without
    // writing reactive state, so playback no longer re-renders the tree 60×/s.
    setTimeMs(Math.max(0, currentTimeMs));
    this.rafId = requestAnimationFrame(() => this.tick());
  }
}
