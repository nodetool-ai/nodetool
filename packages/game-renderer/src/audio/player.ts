import { gameAudioMixer, type GameAssetBinding, type GameAssetBinding3D, type GameAudioEmitter, type GameAudioMixerInput, type GameEvent, type GameEvent3D, type GameSnapshot } from "@nodetool-ai/protocol";
import { GameAudioMixer, type GameAudioMixerState } from "./mixer.js";
import {
  createGameAudioPanner, gameAudioDopplerRate, gameAudioVelocity, placeGameAudioListener, placeGameAudioPanner, setGameAudioDopplerRate,
  type GameAudioSample, type GameAudioSpatialQuality, type GameAudioSpatialView, type GameAudioVector
} from "./spatial.js";
import { playBuiltinGameVoice, stopGameVoice, type Voice } from "./voices.js";

/** A playing voice positioned by its emitter entity. */
interface SpatialVoice {
  readonly emitter: GameAudioEmitter;
  readonly panner: PannerNode;
  /** The buffer source's playback rate, for doppler. Built-in effects have none. */
  readonly rate?: AudioParam;
  sample?: GameAudioSample;
}

const MAX_VOICES = 32;

export interface GameAudioOptions {
  readonly assets: Readonly<Record<string, GameAssetBinding | GameAssetBinding3D>>;
  readonly tickRate: number;
  readonly resolveAsset: (binding: GameAssetBinding | GameAssetBinding3D) => Promise<string | null>;
  readonly status: (message: string) => void;
  readonly context?: AudioContext;
  /** The document's `audio.mixer`. Omitted means the default bus graph. */
  readonly mixer?: GameAudioMixerInput;
  /** Panning quality for spatial voices. Default `high` (HRTF). */
  readonly spatialQuality?: GameAudioSpatialQuality;
}

/** Shares Web Audio voice, decoding, and lifecycle behavior across browser players. */
export class GameAudioPlayer {
  private readonly context: AudioContext;
  private readonly mixer: GameAudioMixer;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<string, Voice>();
  private readonly fading = new Set<Voice>();
  private readonly pending = new Map<string, { token: symbol; assetId: string }>();
  private readonly voiceAssets = new WeakMap<Voice, string>();
  private readonly spatialVoices = new Set<SpatialVoice>();
  private view: GameAudioSpatialView | null = null;
  private listenerSample: GameAudioSample | undefined;
  private listenerVelocity: GameAudioVector = { x: 0, y: 0, z: 0 };
  private desiredMusic: GameSnapshot["music"] = null;
  private sceneId: string | null = null;
  private tick = 0;
  private generation = 0;
  private legacySequence = 0;
  private disposed = false;
  private paused = false;

  constructor(private options: GameAudioOptions) {
    this.context = options.context ?? new AudioContext();
    this.mixer = new GameAudioMixer(this.context, this.mixerSettings(options.mixer), options.tickRate);
  }

  private mixerSettings(settings: GameAudioMixerInput | undefined): GameAudioMixerInput | undefined {
    const parsed = gameAudioMixer.safeParse(settings ?? {});
    if (parsed.success) { return settings; }
    this.options.status(`Audio mixer settings are invalid, so the default mix is used: ${parsed.error.issues[0]?.message ?? "unknown issue"}`);
    return undefined;
  }

  /** Applies edited mixer settings. Playing voices keep playing on their buses. */
  updateMixer(settings: GameAudioMixerInput | undefined): void {
    if (this.disposed) return;
    this.mixer.update(this.mixerSettings(settings));
  }

  /** Player-facing bus volume, for example from a settings screen. */
  setBusVolume(busId: string, volume: number): void {
    if (!this.disposed) this.mixer.setUserVolume(busId, volume);
  }

  setBusMuted(busId: string, muted: boolean): void {
    if (!this.disposed) this.mixer.setUserMuted(busId, muted);
  }

  mixerState(): GameAudioMixerState {
    return this.mixer.state();
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

  /** Keeps decoded audio for unchanged bindings when the editor document changes. */
  updateAssets(assets: GameAudioOptions["assets"]): void {
    if (this.disposed) return;
    const changed = new Set<string>();
    for (const slot of new Set([...Object.keys(this.options.assets), ...Object.keys(assets)])) {
      if (JSON.stringify(this.options.assets[slot]) !== JSON.stringify(assets[slot])) {
        this.buffers.delete(slot);
        changed.add(slot);
      }
    }
    for (const [id, pending] of this.pending) {
      if (changed.has(pending.assetId)) this.pending.delete(id);
    }
    for (const [id, voice] of this.voices) {
      if (changed.has(this.voiceAssets.get(voice) ?? "")) this.stop(id, 0);
    }
    for (const voice of this.fading) {
      if (changed.has(this.voiceAssets.get(voice) ?? "")) {
        voice.source.stop();
        this.fading.delete(voice);
      }
    }
    this.options = { ...this.options, assets };
    this.preload();
    this.startDesiredMusic();
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

  sync(snapshot: Pick<GameSnapshot, "tick" | "music" | "sceneId">): void {
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
    this.mixer.enterScene(snapshot.sceneId);
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
    if (!music || !this.options.assets[music.assetId] || this.paused || this.context.state !== "running" || this.voices.has(music.voiceId) || this.pending.has(music.voiceId)) return;
    const token = Symbol();
    this.pending.set(music.voiceId, { token, assetId: music.assetId });
    void this.start(music.voiceId, music.assetId, true, music.volume, music.fadeInTicks, music.fadeOutTicks,
      token, music.startTick)
      .catch((error: unknown) => this.options.status(`Music could not start: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { if (this.pending.get(music.voiceId)?.token === token) this.pending.delete(music.voiceId); });
  }

  /**
   * Moves the listener and every spatial voice to a rendered frame. Players call it once per rendered frame with the view
   * built from the interpolated frame, so positions follow what is on screen. Emitters missing from the view keep their last position.
   */
  updateSpatial(view: GameAudioSpatialView): void {
    if (this.disposed) return;
    this.view = view;
    const now = this.context.currentTime;
    const listenerSample = { position: view.listener.position, time: now };
    this.listenerVelocity = gameAudioVelocity(this.listenerSample, listenerSample) ?? this.listenerVelocity;
    this.listenerSample = listenerSample;
    placeGameAudioListener(this.context.listener, view.listener, now, true);
    for (const voice of this.spatialVoices) {
      const pose = view.emitter(voice.emitter.entityId);
      if (!pose) continue;
      placeGameAudioPanner(voice.panner, voice.emitter, pose, now, true);
      const sample = { position: pose.position, time: now };
      const velocity = gameAudioVelocity(voice.sample, sample);
      voice.sample = sample;
      if (voice.rate && voice.emitter.doppler > 0 && velocity) {
        setGameAudioDopplerRate(voice.rate, gameAudioDopplerRate(view.listener.position, this.listenerVelocity, pose.position, velocity, voice.emitter.doppler), now);
      }
    }
  }

  /** Creates the panner for a voice and connects it to the bus. The voice connects to the returned node. */
  private spatialOutput(emitter: GameAudioEmitter | undefined, bus: string, rate?: AudioParam): { node: AudioNode; release: () => void } {
    const input = this.mixer.input(bus);
    if (!emitter) return { node: input, release: () => {} };
    const now = this.context.currentTime;
    const panner = createGameAudioPanner(this.context, emitter, this.options.spatialQuality ?? "high", now);
    const pose = this.view?.emitter(emitter.entityId);
    if (pose) placeGameAudioPanner(panner, emitter, pose, now, false);
    panner.connect(input);
    const voice: SpatialVoice = { emitter, panner, rate, sample: pose ? { position: pose.position, time: now } : undefined };
    this.spatialVoices.add(voice);
    return { node: panner, release: () => { this.spatialVoices.delete(voice); panner.disconnect(); } };
  }

  /** Plays audio events and lets other simulation events drive mixer snapshot transitions. */
  handle(event: GameEvent | GameEvent3D): void {
    if (this.disposed) return;
    if (event.kind !== "audio") {
      this.mixer.observe(event);
      return;
    }
    if (event.action === "stop") {
      if (event.voiceId) this.stop(event.voiceId, event.fadeOutTicks);
      return;
    }
    if (this.paused || this.context.state !== "running") return;
    const voiceId = event.voiceId ?? `legacy:${this.tick}:${this.legacySequence++}`;
    if (this.pending.has(voiceId)) return;
    const token = Symbol();
    this.pending.set(voiceId, { token, assetId: event.assetId });
    void this.start(voiceId, event.assetId, event.loop, event.volume, event.fadeInTicks, event.fadeOutTicks, token, undefined, event.emitter)
      .catch((error: unknown) => this.options.status(`Audio effect could not start: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { if (this.pending.get(voiceId)?.token === token) this.pending.delete(voiceId); });
  }

  private async start(id: string, assetId: string, loop: boolean, volume: number, fadeInTicks: number, fadeOutTicks: number, token: symbol,
    logicalStartTick?: number, emitter?: GameAudioEmitter): Promise<void> {
    const generation = this.generation;
    const binding = this.options.assets[assetId];
    const bus = this.mixer.busFor(assetId, logicalStartTick !== undefined);
    if (binding?.assetId.startsWith("builtin:")) {
      if (loop) this.options.status(`Audio ${assetId} cannot loop a built-in effect`);
      else {
        this.mixer.voiceStarted(bus);
        const output = this.spatialOutput(emitter, bus);
        playBuiltinGameVoice(this.context, volume, output.node, () => { output.release(); this.mixer.voiceEnded(bus); });
      }
      return;
    }
    const buffer = await this.buffer(assetId);
    if (!buffer || this.disposed || this.paused || this.context.state !== "running" || generation !== this.generation ||
      this.pending.get(id)?.token !== token || this.voices.has(id)) return;
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
    const output = this.spatialOutput(emitter, bus, source.playbackRate);
    source.connect(gain).connect(output.node);
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(fadeInTicks > 0 ? 0 : volume, now);
    if (fadeInTicks > 0) gain.gain.linearRampToValueAtTime(volume, now + fadeInTicks / this.options.tickRate);
    const voice: Voice = { id, source, gain, loop, fadeOutTicks, bus };
    this.voices.set(id, voice);
    this.voiceAssets.set(voice, assetId);
    this.mixer.voiceStarted(bus);
    let ended = false;
    source.onended = () => {
      if (!ended) {
        ended = true;
        this.mixer.voiceEnded(bus);
      }
      if (this.voices.get(id) === voice) this.voices.delete(id);
      this.fading.delete(voice);
      source.disconnect();
      gain.disconnect();
      output.release();
    };
    const offset = logicalStartTick === undefined ? 0 : Math.max(0, this.tick - logicalStartTick) / this.options.tickRate;
    source.start(0, loop && buffer.duration > 0 ? offset % buffer.duration : 0);
  }

  private stop(id: string, fadeTicks: number): void {
    this.pending.delete(id);
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    stopGameVoice(voice, this.context, fadeTicks, this.options.tickRate, this.fading);
  }

  reset(snapshot: Pick<GameSnapshot, "tick" | "music" | "sceneId">): void {
    this.generation += 1;
    this.pending.clear();
    for (const id of this.voices.keys()) this.stop(id, 0);
    for (const voice of this.fading) voice.source.stop();
    this.fading.clear();
    this.desiredMusic = null;
    this.mixer.reset(snapshot.sceneId);
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
    this.mixer.dispose();
    void this.context.close();
  }
}
