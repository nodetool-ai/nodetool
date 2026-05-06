import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";

export class PlaybackClock {
  private rafId: number | null = null;
  private startPositionMs = 0;
  private startWallMs = 0;
  private audioContext: AudioContext | null = null;
  /** AudioContext.currentTime captured at start() */
  private audioStartTimeSec = 0;
  private rate = 1;
  private durationMs = Infinity;

  start(
    positionMs: number,
    rate = 1,
    audioContext: AudioContext | null = null,
    durationMs = Infinity
  ): void {
    this.stop();
    this.startPositionMs = positionMs;
    this.startWallMs = performance.now();
    this.rate = rate;
    this.durationMs = durationMs;
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
    const { isPlaying, setCurrentTimeMs, pause } =
      useTimelinePlaybackStore.getState();

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

    // Clamp to sequence boundaries.
    if (currentTimeMs >= this.durationMs) {
      setCurrentTimeMs(this.durationMs);
      pause();
      this.rafId = null;
      return;
    }

    setCurrentTimeMs(Math.max(0, currentTimeMs));
    this.rafId = requestAnimationFrame(() => this.tick());
  }
}
