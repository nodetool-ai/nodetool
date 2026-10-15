import type { GameScene } from "@nodetool-ai/protocol";

type StreamingSettings = NonNullable<NonNullable<GameScene["music"]>["streaming"]>;

/** Logical music time includes the intro once, then repeats the authored loop. */
function loopOffset(seconds: number, start: number, end: number): number {
  return seconds < end ? seconds : start + (seconds - start) % (end - start);
}

/** Owns a streamed track and its media lifecycle. Media time never enters simulation. */
export class GameStreamingMusicVoice {
  private readonly media = new Audio();
  private readonly source: MediaElementAudioSourceNode;
  private readonly gain: GainNode;
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private paused = false;
  private started = false;
  private playGeneration = 0;
  private fadeStart = 0;
  private fadeOut: { start: number; seconds: number; volume: number } | undefined;
  private end = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly url: string,
    destination: AudioNode,
    private readonly settings: StreamingSettings,
    private readonly volume: number,
    private readonly fadeSeconds: number,
    private readonly offset: () => number,
    private readonly status: (message: string) => void,
    private readonly ended: () => void,
    private readonly playing: () => void = () => undefined
  ) {
    this.media.crossOrigin = "anonymous";
    this.media.preload = "metadata";
    this.source = context.createMediaElementSource(this.media);
    this.gain = context.createGain();
    this.source.connect(this.gain).connect(destination);
    this.gain.gain.setValueAtTime(0, context.currentTime);
    const signal = this.controller.signal;
    this.media.addEventListener("loadedmetadata", () => this.ready(), { signal });
    this.media.addEventListener("timeupdate", () => {
      if (!this.paused && this.end > 0 && this.media.currentTime >= this.end) {
        this.media.currentTime = loopOffset(this.media.currentTime, settings.loopStartSeconds, this.end);
      }
    }, { signal });
    this.media.addEventListener("ended", () => {
      if (!this.paused && !this.disposed && this.end > 0) {
        this.media.currentTime = settings.loopStartSeconds;
        this.play();
      }
    }, { signal });
    this.media.addEventListener("error", () => this.fail("the media could not be loaded"), { signal });
  }

  load(): void {
    if (this.disposed) return;
    this.media.src = this.url;
    this.media.load();
    if (this.media.readyState >= 1) this.ready();
  }

  private ready(): void {
    if (this.disposed) return;
    const duration = this.media.duration;
    const end = this.settings.loopEndSeconds ?? duration;
    if (!Number.isFinite(duration) || duration <= 0 || this.settings.loopStartSeconds >= end || end > duration) {
      this.fail("loop points must fit inside the track duration");
      return;
    }
    this.end = end;
    this.media.loop = this.settings.loopStartSeconds === 0 && this.settings.loopEndSeconds === undefined;
    if (!this.paused) this.resume();
  }

  private play(): void {
    const generation = ++this.playGeneration;
    void this.media.play().then(() => {
      if (generation !== this.playGeneration) { return; }
      if (this.disposed || this.paused) {
        this.media.pause();
      } else {
        this.media.currentTime = loopOffset(Math.max(0, this.offset()), this.settings.loopStartSeconds, this.end);
        if (!this.started) {
          this.started = true;
          this.playing();
          this.fadeStart = this.context.currentTime;
          this.gain.gain.setValueAtTime(this.fadeSeconds > 0 ? 0 : this.volume, this.fadeStart);
          if (this.fadeSeconds > 0) this.gain.gain.linearRampToValueAtTime(this.volume, this.fadeStart + this.fadeSeconds);
        }
      }
    }).catch((error: unknown) => {
      if (!this.disposed && !this.paused && generation === this.playGeneration) {
        this.fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  private fail(message: string): void {
    this.status(`Streaming music could not play: ${message}`);
    this.dispose();
  }

  pause(): void {
    if (this.paused) return;
    if (this.fadeOut) {
      const now = this.context.currentTime;
      const elapsed = Math.max(0, now - this.fadeOut.start);
      const seconds = Math.max(0, this.fadeOut.seconds - elapsed);
      const volume = this.fadeOut.volume * Math.max(0, 1 - elapsed / this.fadeOut.seconds);
      this.fadeOut = { start: now, seconds, volume };
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(volume, now);
      if (this.timer !== undefined) clearTimeout(this.timer);
    }
    this.paused = true;
    this.playGeneration += 1;
    this.media.pause();
  }

  resume(): void {
    if (this.disposed) return;
    const wasPaused = this.paused;
    this.paused = false;
    if (this.end === 0) return;
    if (wasPaused && this.fadeOut) {
      if (this.fadeOut.seconds === 0) {
        this.dispose();
        return;
      }
      this.fadeOut.start = this.context.currentTime;
      this.scheduleFadeOut();
    }
    this.media.currentTime = loopOffset(Math.max(0, this.offset()), this.settings.loopStartSeconds, this.end);
    this.play();
  }

  stop(fadeSeconds: number): void {
    if (this.disposed) return;
    if (fadeSeconds === 0 || this.paused || !this.started) {
      this.dispose();
      return;
    }
    const now = this.context.currentTime;
    const current = this.fadeSeconds > 0 ? this.volume * Math.min(1, Math.max(0, (now - this.fadeStart) / this.fadeSeconds)) : this.volume;
    this.fadeOut = { start: now, seconds: fadeSeconds, volume: current };
    this.scheduleFadeOut();
  }

  private scheduleFadeOut(): void {
    const fade = this.fadeOut;
    if (!fade) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.gain.gain.cancelScheduledValues(fade.start);
    this.gain.gain.setValueAtTime(fade.volume, fade.start);
    this.gain.gain.linearRampToValueAtTime(0, fade.start + fade.seconds);
    this.timer = setTimeout(() => this.dispose(), fade.seconds * 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.controller.abort();
    this.fadeOut = undefined;
    this.pause();
    this.media.removeAttribute("src");
    this.media.load();
    this.source.disconnect();
    this.gain.disconnect();
    this.ended();
  }
}
