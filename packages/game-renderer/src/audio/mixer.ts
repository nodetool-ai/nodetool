import {
  GAME_AUDIO_BASE_SNAPSHOT,
  GAME_AUDIO_BUILTIN_BUSES,
  gameAudioMixer,
  type GameAudioMixer as GameAudioMixerSettings,
  type GameAudioMixerInput,
  type GameEvent,
  type GameEvent3D
} from "@nodetool-ai/protocol";

const OPEN_LOWPASS_HZ = 20000;
const LIMITER_RATIO = 20;
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

type Curve = "linear" | "exponential";

/** An AudioParam whose scheduled ramp is tracked so a new ramp can start from the exact current value. */
class TrackedParam {
  private from: number;
  private to: number;
  private start = 0;
  private end = 0;
  private curve: Curve = "linear";

  constructor(private readonly param: AudioParam, value: number, now: number) {
    this.from = value;
    this.to = value;
    param.setValueAtTime(value, now);
  }

  get target(): number { return this.to; }

  valueAt(time: number): number {
    if (time >= this.end || this.end <= this.start) { return this.to; }
    if (time <= this.start) { return this.from; }
    const progress = (time - this.start) / (this.end - this.start);
    return this.curve === "exponential" ? this.from * (this.to / this.from) ** progress : this.from + (this.to - this.from) * progress;
  }

  rampTo(value: number, now: number, seconds: number, curve: Curve = "linear"): void {
    if (value === this.to && now >= this.end) { return; }
    const current = this.valueAt(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(current, now);
    if (seconds > 0 && current !== value) {
      if (curve === "exponential") { this.param.exponentialRampToValueAtTime(value, now + seconds); }
      else { this.param.linearRampToValueAtTime(value, now + seconds); }
    } else {
      this.param.setValueAtTime(value, now);
    }
    this.from = current;
    this.to = value;
    this.start = now;
    this.end = seconds > 0 ? now + seconds : now;
    this.curve = curve;
  }
}

interface Bus {
  readonly id: string;
  readonly input: GainNode;
  readonly filter: BiquadFilterNode;
  readonly fader: GainNode;
  readonly duck: GainNode;
  readonly send: GainNode;
  readonly faderParam: TrackedParam;
  readonly filterParam: TrackedParam;
  readonly duckParam: TrackedParam;
  readonly sendParam: TrackedParam;
  parent: string | null;
  userVolume: number;
  userMuted: boolean;
}

/** The values a bus is moving to: the base settings with the active mixer snapshot applied. */
export interface GameAudioBusState {
  readonly parent: string | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly lowpassHz: number | null;
  readonly reverbSend: number;
  readonly userVolume: number;
  readonly userMuted: boolean;
  readonly duckGain: number;
  readonly activeVoices: number;
}

export interface GameAudioMixerState {
  readonly snapshot: string;
  readonly buses: Readonly<Record<string, GameAudioBusState>>;
}

/** Deterministic noise so every player builds the same impulse response. */
function impulseResponse(context: BaseAudioContext, decaySeconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(decaySeconds * context.sampleRate));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x9e3779b9;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      const noise = (((mixed ^ (mixed >>> 14)) >>> 0) / 0xffffffff) * 2 - 1;
      data[index] = noise * Math.exp(-6.9 * index / length);
    }
  }
  return buffer;
}

/**
 * The game's bus graph: voices feed a bus input, buses feed their parent, and master feeds the limiter.
 * Mixer state is presentation only. It reads simulation events and never writes back to a session.
 */
export class GameAudioMixer {
  private settings: GameAudioMixerSettings;
  private readonly buses = new Map<string, Bus>();
  private readonly activeVoices = new Map<string, number>();
  private readonly limiter: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private readonly makeupParam: TrackedParam;
  private reverb: { readonly convolver: ConvolverNode; readonly output: GainNode; decaySeconds: number } | null = null;
  private snapshotId = GAME_AUDIO_BASE_SNAPSHOT;
  private sceneId: string | null = null;

  private readonly destination: AudioNode;
  private readonly clock: () => number;

  /**
   * `options.clock` returns the context time at which mixer changes are scheduled. It defaults to the context's current time.
   * Offline renders pass a clock to schedule changes at chosen render times.
   */
  constructor(private readonly context: BaseAudioContext, settings: GameAudioMixerInput | undefined, private readonly tickRate: number,
    options: { readonly destination?: AudioNode; readonly clock?: () => number } = {}) {
    this.destination = options.destination ?? context.destination;
    this.clock = options.clock ?? (() => context.currentTime);
    this.settings = gameAudioMixer.parse(settings ?? {});
    const now = this.clock();
    this.limiter = context.createDynamicsCompressor();
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = LIMITER_RATIO;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.makeup = context.createGain();
    this.makeupParam = new TrackedParam(this.makeup.gain, 1, now);
    this.limiter.connect(this.makeup).connect(this.destination);
    this.apply(0, true);
  }

  /** Replaces the mixer settings. Values jump to the new mix; the active snapshot stays when it still exists. */
  update(settings: GameAudioMixerInput | undefined): void {
    this.settings = gameAudioMixer.parse(settings ?? {});
    if (this.snapshotId !== GAME_AUDIO_BASE_SNAPSHOT && !(this.snapshotId in this.settings.snapshots)) {
      this.snapshotId = GAME_AUDIO_BASE_SNAPSHOT;
    }
    this.apply(0, true);
  }

  /** The node a voice on `busId` connects to. Unknown buses play on sfx. */
  input(busId: string): AudioNode {
    return (this.buses.get(busId) ?? this.bus("sfx")).input;
  }

  /** The bus for a voice of an asset slot: the author's assignment, else music for scene music and sfx for everything else. */
  busFor(assetSlot: string, music: boolean): string {
    const assigned = this.settings.assetBuses[assetSlot];
    if (assigned !== undefined && this.buses.has(assigned)) { return assigned; }
    return music ? "music" : "sfx";
  }

  voiceStarted(busId: string): void {
    const id = this.buses.has(busId) ? busId : "sfx";
    this.activeVoices.set(id, (this.activeVoices.get(id) ?? 0) + 1);
    this.applyDucking();
  }

  voiceEnded(busId: string): void {
    const id = this.buses.has(busId) ? busId : "sfx";
    const count = (this.activeVoices.get(id) ?? 0) - 1;
    if (count > 0) { this.activeVoices.set(id, count); }
    else { this.activeVoices.delete(id); }
    this.applyDucking();
  }

  /** Reads a simulation event and moves to the snapshot its transition rule names. */
  observe(event: GameEvent | GameEvent3D): void {
    for (const transition of this.settings.transitions) {
      const on = transition.on;
      if ((on.kind === "trigger" && event.kind === "trigger" && event.event === on.event) ||
        (on.kind === "win" && event.kind === "win")) {
        this.transition(transition.snapshot, transition.fadeTicks);
      }
    }
  }

  /** Applies the scene's transition rule when the scene changes. */
  enterScene(sceneId: string): void {
    if (this.sceneId === sceneId) { return; }
    this.sceneId = sceneId;
    const rule = this.settings.transitions.find((transition) => transition.on.kind === "scene" && transition.on.sceneId === sceneId);
    if (rule) { this.transition(rule.snapshot, rule.fadeTicks); }
  }

  /** Returns to the base mix, or the scene's snapshot, without fading. Used when a session restarts or restores. */
  reset(sceneId: string): void {
    const rule = this.settings.transitions.find((transition) => transition.on.kind === "scene" && transition.on.sceneId === sceneId);
    this.sceneId = sceneId;
    this.snapshotId = rule?.snapshot ?? GAME_AUDIO_BASE_SNAPSHOT;
    this.apply(0, false);
  }

  /** Moves to a mixer snapshot over `fadeTicks`. */
  transition(snapshotId: string, fadeTicks: number): void {
    if (snapshotId !== GAME_AUDIO_BASE_SNAPSHOT && !(snapshotId in this.settings.snapshots)) { return; }
    if (snapshotId === this.snapshotId) { return; }
    this.snapshotId = snapshotId;
    this.apply(fadeTicks / this.tickRate, false);
  }

  /** Player-facing volume, for example from a settings screen. Multiplies the authored fader. */
  setUserVolume(busId: string, volume: number): void {
    const bus = this.buses.get(busId);
    if (!bus || !Number.isFinite(volume)) { return; }
    bus.userVolume = Math.min(2, Math.max(0, volume));
    this.applyBus(bus, 0);
  }

  setUserMuted(busId: string, muted: boolean): void {
    const bus = this.buses.get(busId);
    if (!bus) { return; }
    bus.userMuted = muted;
    this.applyBus(bus, 0);
  }

  state(): GameAudioMixerState {
    const buses: Record<string, GameAudioBusState> = {};
    for (const bus of this.buses.values()) {
      const values = this.values(bus.id);
      buses[bus.id] = { parent: bus.parent, volume: values.volume, muted: values.muted, lowpassHz: values.lowpassHz ?? null,
        reverbSend: values.reverbSend, userVolume: bus.userVolume, userMuted: bus.userMuted, duckGain: bus.duckParam.target,
        activeVoices: this.activeVoices.get(bus.id) ?? 0 };
    }
    return { snapshot: this.snapshotId, buses };
  }

  dispose(): void {
    for (const bus of this.buses.values()) {
      for (const node of [bus.input, bus.filter, bus.fader, bus.duck, bus.send]) { node.disconnect(); }
    }
    this.buses.clear();
    this.reverb?.convolver.disconnect();
    this.reverb?.output.disconnect();
    this.limiter.disconnect();
    this.makeup.disconnect();
  }

  private bus(id: string): Bus {
    const existing = this.buses.get(id);
    if (existing) { return existing; }
    const now = this.clock();
    const input = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const fader = this.context.createGain();
    const duck = this.context.createGain();
    const send = this.context.createGain();
    filter.type = "lowpass";
    filter.Q.setValueAtTime(BUTTERWORTH_Q_DB, now);
    input.connect(filter).connect(fader).connect(duck);
    const bus: Bus = { id, input, filter, fader, duck, send, parent: null, userVolume: 1, userMuted: false,
      faderParam: new TrackedParam(fader.gain, 1, now), filterParam: new TrackedParam(filter.frequency, this.openLowpass(), now),
      duckParam: new TrackedParam(duck.gain, 1, now), sendParam: new TrackedParam(send.gain, 0, now) };
    this.buses.set(id, bus);
    return bus;
  }

  private openLowpass(): number { return Math.min(OPEN_LOWPASS_HZ, this.context.sampleRate / 2); }

  private values(id: string): { volume: number; muted: boolean; lowpassHz?: number; reverbSend: number } {
    const base = this.settings.buses[id] ?? { volume: 1, muted: false, reverbSend: 0 };
    const override = this.snapshotId === GAME_AUDIO_BASE_SNAPSHOT ? undefined : this.settings.snapshots[this.snapshotId]?.buses[id];
    return { volume: override?.volume ?? base.volume, muted: override?.muted ?? base.muted,
      lowpassHz: override?.lowpassHz ?? base.lowpassHz, reverbSend: override?.reverbSend ?? base.reverbSend };
  }

  private needsReverb(): boolean {
    return Object.values(this.settings.buses).some((bus) => bus.reverbSend > 0) ||
      Object.values(this.settings.snapshots).some((snapshot) => Object.values(snapshot.buses).some((bus) => (bus.reverbSend ?? 0) > 0));
  }

  /** Builds missing buses, wires parents, and moves every parameter to the current mix over `seconds`. */
  private apply(seconds: number, rewire: boolean): void {
    const ids = [...GAME_AUDIO_BUILTIN_BUSES, ...Object.keys(this.settings.buses)];
    for (const id of ids) { this.bus(id); }
    if (rewire) {
      const decaySeconds = this.settings.reverb.decaySeconds;
      if (this.needsReverb() && (!this.reverb || this.reverb.decaySeconds !== decaySeconds)) {
        this.reverb?.convolver.disconnect();
        this.reverb?.output.disconnect();
        const convolver = this.context.createConvolver();
        convolver.buffer = impulseResponse(this.context, decaySeconds);
        const output = this.context.createGain();
        convolver.connect(output).connect(this.bus("master").input);
        this.reverb = { convolver, output, decaySeconds };
      }
      for (const bus of this.buses.values()) {
        const parent = bus.id === "master" ? null : this.settings.buses[bus.id]?.parent ?? "master";
        bus.duck.disconnect();
        bus.send.disconnect();
        if (parent === null) {
          bus.duck.connect(this.settings.limiter.enabled ? this.limiter : this.destination);
        } else {
          bus.duck.connect(this.bus(parent).input);
          bus.duck.connect(bus.send);
          if (this.reverb) { bus.send.connect(this.reverb.convolver); }
        }
        bus.parent = parent;
      }
      const now = this.clock();
      const thresholdDb = this.settings.limiter.thresholdDb;
      this.limiter.threshold.value = thresholdDb;
      // Web Audio adds automatic makeup gain of 0.6 times the full-range gain reduction. Undo it so the limiter is transparent below threshold.
      this.makeupParam.rampTo(10 ** (0.6 * thresholdDb * (1 - 1 / LIMITER_RATIO) / 20), now, 0);
    }
    for (const bus of this.buses.values()) { this.applyBus(bus, seconds); }
    this.applyDucking();
  }

  private applyBus(bus: Bus, seconds: number): void {
    const now = this.clock();
    const values = this.values(bus.id);
    const silent = values.muted || bus.userMuted;
    bus.faderParam.rampTo(silent ? 0 : values.volume * bus.userVolume, now, seconds);
    bus.filterParam.rampTo(Math.min(values.lowpassHz ?? OPEN_LOWPASS_HZ, this.openLowpass()), now, seconds, "exponential");
    bus.sendParam.rampTo(bus.parent === null ? 0 : values.reverbSend, now, seconds);
  }

  private voicesOnBranch(id: string): number {
    let count = 0;
    for (const [busId, voices] of this.activeVoices) {
      let current: string | null = busId;
      while (current !== null) {
        if (current === id) { count += voices; break; }
        current = this.buses.get(current)?.parent ?? null;
      }
    }
    return count;
  }

  private applyDucking(): void {
    const now = this.clock();
    const targets = new Map<string, { gain: number; attackTicks: number; releaseTicks: number }>();
    for (const rule of this.settings.ducking) {
      if (!this.buses.has(rule.bus)) { continue; }
      const active = this.voicesOnBranch(rule.when) > 0;
      const current = targets.get(rule.bus) ?? { gain: 1, attackTicks: rule.attackTicks, releaseTicks: rule.releaseTicks };
      targets.set(rule.bus, active && rule.gain < current.gain ? { ...current, gain: rule.gain, attackTicks: rule.attackTicks } : current);
    }
    for (const bus of this.buses.values()) {
      const target = targets.get(bus.id);
      const gain = target?.gain ?? 1;
      const previous = bus.duckParam.target;
      if (gain === previous) { continue; }
      const ticks = gain < previous ? target?.attackTicks ?? 0 : target?.releaseTicks ?? 0;
      bus.duckParam.rampTo(gain, now, ticks / this.tickRate);
    }
  }
}
