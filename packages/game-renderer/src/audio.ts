import type { GameAssetBinding, GameDocument, GameEvent, GameSnapshot } from "@nodetool-ai/protocol";

const MAX_VOICES = 32;

interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly loop: boolean;
  readonly fadeOutTicks: number;
}

export interface GameAudioOptions {
  readonly assets: GameDocument["assets"];
  readonly tickRate: number;
  readonly resolveAsset: (binding: GameAssetBinding) => Promise<string | null>;
  readonly status: (message: string) => void;
  readonly context?: AudioContext;
}

/** Shares Web Audio voice, decoding, and lifecycle behavior across browser players. */
export class GameAudioPlayer {
  private readonly context: AudioContext;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<string, Voice>();
  private readonly fading = new Set<Voice>();
  private readonly pending = new Map<string, symbol>();
  private desiredMusic: GameSnapshot["music"] = null;
  private sceneId: string | null = null;
  private tick = 0;
  private generation = 0;
  private legacySequence = 0;
  private disposed = false;
  private paused = false;

  constructor(private readonly options: GameAudioOptions) {
    this.context = options.context ?? new AudioContext();
  }

  private buffer(assetId: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(assetId);
    if (cached) return cached;
    const binding = this.options.assets[assetId];
    if (!binding) {
      this.options.status(`Audio asset ${assetId} is missing`);
      return Promise.resolve(null);
    }
    const pending = this.options.resolveAsset(binding).then(async (url) => {
      if (!url) throw new Error("asset URL is unavailable");
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return this.context.decodeAudioData(await response.arrayBuffer());
    }).catch((error: unknown) => {
      this.options.status(`Audio ${assetId} could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    this.buffers.set(assetId, pending);
    return pending;
  }

  preload(): void {
    for (const [id, binding] of Object.entries(this.options.assets)) {
      if (binding.mediaKind === "audio" && !binding.assetId.startsWith("builtin:")) void this.buffer(id);
    }
  }

  async unlock(): Promise<void> {
    if (this.disposed || this.paused) return;
    try {
      await this.context.resume();
      this.startDesiredMusic();
    } catch {
      this.options.status("Audio is blocked. Tap Play to enable sound in this browser.");
    }
  }

  pause(): void {
    if (this.disposed || this.paused) return;
    this.paused = true;
    void this.context.suspend().catch(() => this.options.status("Audio could not pause"));
  }

  resume(): void {
    this.paused = false;
    void this.unlock();
  }

  sync(snapshot: GameSnapshot): void {
    if (this.disposed) return;
    this.tick = snapshot.tick;
    if (this.sceneId && this.sceneId !== snapshot.sceneId) {
      for (const id of this.pending.keys()) {
        if (!id.startsWith(`effect:${snapshot.sceneId}:`)) this.pending.delete(id);
      }
      for (const id of this.voices.keys()) {
        if (id.startsWith(`effect:${this.sceneId}:`)) this.stop(id, 0);
      }
    }
    this.sceneId = snapshot.sceneId;
    const next = snapshot.music;
    if (this.desiredMusic?.voiceId !== next?.voiceId || this.desiredMusic?.startTick !== next?.startTick ||
      this.desiredMusic?.assetId !== next?.assetId || this.desiredMusic?.volume !== next?.volume ||
      this.desiredMusic?.fadeInTicks !== next?.fadeInTicks || this.desiredMusic?.fadeOutTicks !== next?.fadeOutTicks) {
      if (this.desiredMusic) this.stop(this.desiredMusic.voiceId, this.desiredMusic.fadeOutTicks);
      this.desiredMusic = next;
    }
    this.startDesiredMusic();
  }

  private startDesiredMusic(): void {
    const music = this.desiredMusic;
    if (!music || this.paused || this.context.state !== "running" || this.voices.has(music.voiceId) || this.pending.has(music.voiceId)) return;
    const token = Symbol();
    this.pending.set(music.voiceId, token);
    void this.start(music.voiceId, music.assetId, true, music.volume, music.fadeInTicks, music.fadeOutTicks,
      token, music.startTick)
      .catch((error: unknown) => this.options.status(`Music could not start: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { if (this.pending.get(music.voiceId) === token) this.pending.delete(music.voiceId); });
  }

  handle(event: GameEvent): void {
    if (this.disposed || event.kind !== "audio") return;
    if (event.action === "stop") {
      if (event.voiceId) this.stop(event.voiceId, event.fadeOutTicks);
      return;
    }
    if (this.paused || this.context.state !== "running") return;
    const voiceId = event.voiceId ?? `legacy:${this.tick}:${this.legacySequence++}`;
    if (this.pending.has(voiceId)) return;
    const token = Symbol();
    this.pending.set(voiceId, token);
    void this.start(voiceId, event.assetId, event.loop, event.volume, event.fadeInTicks, event.fadeOutTicks, token)
      .catch((error: unknown) => this.options.status(`Audio effect could not start: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { if (this.pending.get(voiceId) === token) this.pending.delete(voiceId); });
  }

  private async start(id: string, assetId: string, loop: boolean, volume: number, fadeInTicks: number, fadeOutTicks: number, token: symbol, logicalStartTick?: number): Promise<void> {
    const generation = this.generation;
    const binding = this.options.assets[assetId];
    if (binding?.assetId.startsWith("builtin:")) {
      if (loop) this.options.status(`Audio ${assetId} cannot loop a built-in effect`);
      else this.playBuiltin(volume);
      return;
    }
    const buffer = await this.buffer(assetId);
    if (!buffer || this.disposed || this.paused || this.context.state !== "running" || generation !== this.generation ||
      this.pending.get(id) !== token || this.voices.has(id)) return;
    if (this.voices.size + this.fading.size >= MAX_VOICES && this.fading.size > 0) {
      const fading = this.fading.values().next().value;
      if (fading) {
        fading.source.stop();
        this.fading.delete(fading);
      }
    }
    if (this.voices.size + this.fading.size >= MAX_VOICES) {
      const oldestEffect = [...this.voices.values()].find((voice) => !voice.loop);
      if (!oldestEffect) return;
      this.stop(oldestEffect.id, 0);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain).connect(this.context.destination);
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(fadeInTicks > 0 ? 0 : volume, now);
    if (fadeInTicks > 0) gain.gain.linearRampToValueAtTime(volume, now + fadeInTicks / this.options.tickRate);
    const voice: Voice = { id, source, gain, loop, fadeOutTicks };
    this.voices.set(id, voice);
    source.onended = () => {
      if (this.voices.get(id) === voice) this.voices.delete(id);
      this.fading.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    const offset = logicalStartTick === undefined ? 0 : Math.max(0, this.tick - logicalStartTick) / this.options.tickRate;
    source.start(0, loop && buffer.duration > 0 ? offset % buffer.duration : 0);
  }

  private playBuiltin(volume: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(volume * 0.08, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.12);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.12);
  }

  private stop(id: string, fadeTicks: number): void {
    this.pending.delete(id);
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    if (fadeTicks > 0) {
      this.fading.add(voice);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeTicks / this.options.tickRate);
    }
    voice.source.stop(now + fadeTicks / this.options.tickRate);
  }

  reset(snapshot: GameSnapshot): void {
    this.generation += 1;
    this.pending.clear();
    for (const id of this.voices.keys()) this.stop(id, 0);
    for (const voice of this.fading) voice.source.stop();
    this.fading.clear();
    this.desiredMusic = null;
    this.sync(snapshot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.pending.clear();
    for (const id of this.voices.keys()) this.stop(id, 0);
    for (const voice of this.fading) voice.source.stop();
    this.fading.clear();
    this.buffers.clear();
    void this.context.close();
  }
}
