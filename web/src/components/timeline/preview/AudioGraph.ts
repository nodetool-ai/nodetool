import type {
  TimelineClip,
  TimelineTrack,
  TrackCompressorEffect,
  TrackEffect,
  TrackEq3Effect,
  TrackFilterEffect,
  TrackGainEffect
} from "@nodetool-ai/timeline";

export interface ScheduledAudioClip {
  clip: TimelineClip;
  /** Resolved HTTP URL for the audio asset. */
  assetUrl: string;
}

/**
 * Internal state for a single effect's audio nodes. Each effect chains
 * `input → ...internal... → output` so the chain can wire them in series.
 */
interface EffectUnit {
  effect: TrackEffect;
  input: AudioNode;
  output: AudioNode;
  /** All allocated nodes — disconnected on rebuild. */
  nodes: AudioNode[];
}

interface TrackChainState {
  /** trackGain output is always connected to the head of `units` (or directly to masterGain if empty). */
  trackGain: GainNode;
  /** Last applied snapshot — used to skip rebuilds when reference-equal. */
  effects: TrackEffect[];
  units: EffectUnit[];
}

const DB_TO_LIN = (db: number): number => Math.pow(10, db / 20);

/**
 * LRU cap on decoded AudioBuffer entries. A 3-min stereo @ 48 kHz buffer is
 * ~70 MB; we keep a small working set and rely on re-decode on miss.
 */
const BUFFER_CACHE_MAX = 16;

export class AudioGraph {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackChains = new Map<string, TrackChainState>();
  private clipGains = new Map<string, GainNode>();
  private clipSources = new Map<string, AudioBufferSourceNode>();
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  /**
   * Optional pre-supplied context. The live preview leaves this undefined and
   * lazily creates a real-time `AudioContext`; the offline renderer injects an
   * `OfflineAudioContext` so the exact same scheduling + DSP graph mixes down
   * the exported audio. Both are `BaseAudioContext`s for every node-creation
   * call AudioGraph makes, so it is typed as `AudioContext` for the live path.
   */
  constructor(private readonly injectedContext?: AudioContext) {}

  /** Must be called from a user-gesture handler — triggers the autoplay policy. */
  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.injectedContext ?? new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  async loadBuffer(assetId: string, url: string): Promise<AudioBuffer | null> {
    const cachedBuffer = this.bufferCache.get(assetId);
    if (cachedBuffer) {
      // LRU touch (delete+reinsert) only matters when eviction is imminent.
      // While the cache has spare capacity nothing is evicted, so skip the
      // reorder churn on the hot path.
      if (this.bufferCache.size >= BUFFER_CACHE_MAX) {
        this.bufferCache.delete(assetId);
        this.bufferCache.set(assetId, cachedBuffer);
      }
      return cachedBuffer;
    }
    if (this.loadingPromises.has(assetId)) {
      return this.loadingPromises.get(assetId)!;
    }

    const ctx = this.getContext();
    const promise = fetch(url)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} fetching audio: ${url}`);
        }
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buffer) => {
        this.bufferCache.set(assetId, buffer);
        this.loadingPromises.delete(assetId);
        // Evict least-recently-used entries to bound memory. Sources that are
        // already running hold their own buffer reference, so eviction here
        // does not interrupt in-flight playback.
        while (this.bufferCache.size > BUFFER_CACHE_MAX) {
          const oldestKey = this.bufferCache.keys().next().value;
          if (oldestKey === undefined || oldestKey === assetId) break;
          this.bufferCache.delete(oldestKey);
        }
        return buffer;
      })
      .catch((err) => {
        console.warn("[AudioGraph] Failed to load buffer", assetId, err);
        this.loadingPromises.delete(assetId);
        return null;
      });

    this.loadingPromises.set(assetId, promise);
    return promise;
  }

  // ── Effect chain ────────────────────────────────────────────────────────

  private getOrCreateTrackChain(trackId: string): TrackChainState {
    let chain = this.trackChains.get(trackId);
    if (chain) return chain;

    const ctx = this.getContext();
    const trackGain = ctx.createGain();
    trackGain.connect(this.masterGain!);
    chain = { trackGain, effects: [], units: [] };
    this.trackChains.set(trackId, chain);
    return chain;
  }

  /** Returns the input node clips on this track should connect into. */
  private getTrackGain(trackId: string): GainNode {
    return this.getOrCreateTrackChain(trackId).trackGain;
  }

  private buildEffectUnit(effect: TrackEffect): EffectUnit | null {
    const ctx = this.getContext();
    switch (effect.type) {
      case "gain": {
        const node = ctx.createGain();
        this.applyGainEffect(node, effect);
        return { effect, input: node, output: node, nodes: [node] };
      }
      case "eq3": {
        const low = ctx.createBiquadFilter();
        low.type = "lowshelf";
        const mid = ctx.createBiquadFilter();
        mid.type = "peaking";
        const high = ctx.createBiquadFilter();
        high.type = "highshelf";
        this.applyEq3Effect(low, mid, high, effect);
        low.connect(mid);
        mid.connect(high);
        return {
          effect,
          input: low,
          output: high,
          nodes: [low, mid, high]
        };
      }
      case "filter": {
        const node = ctx.createBiquadFilter();
        this.applyFilterEffect(node, effect);
        return { effect, input: node, output: node, nodes: [node] };
      }
      case "compressor": {
        const node = ctx.createDynamicsCompressor();
        this.applyCompressorEffect(node, effect);
        return { effect, input: node, output: node, nodes: [node] };
      }
      default:
        return null;
    }
  }

  private applyGainEffect(node: GainNode, e: TrackGainEffect): void {
    node.gain.value = DB_TO_LIN(e.gainDb);
  }

  private applyEq3Effect(
    low: BiquadFilterNode,
    mid: BiquadFilterNode,
    high: BiquadFilterNode,
    e: TrackEq3Effect
  ): void {
    low.frequency.value = e.lowFreq;
    low.gain.value = e.lowGainDb;
    mid.frequency.value = e.midFreq;
    mid.Q.value = e.midQ;
    mid.gain.value = e.midGainDb;
    high.frequency.value = e.highFreq;
    high.gain.value = e.highGainDb;
  }

  private applyFilterEffect(
    node: BiquadFilterNode,
    e: TrackFilterEffect
  ): void {
    node.type = e.mode;
    node.frequency.value = e.frequency;
    node.Q.value = e.q;
  }

  private applyCompressorEffect(
    node: DynamicsCompressorNode,
    e: TrackCompressorEffect
  ): void {
    node.threshold.value = e.thresholdDb;
    node.ratio.value = e.ratio;
    node.attack.value = e.attackMs / 1000;
    node.release.value = e.releaseMs / 1000;
    node.knee.value = e.kneeDb;
  }

  /**
   * True if `next` and `prev` have the same enabled effects in the same order
   * (matched by id+type). When this is true we can update parameters in place
   * instead of tearing the chain down.
   */
  private chainStructureMatches(
    prev: EffectUnit[],
    next: TrackEffect[]
  ): boolean {
    const nextActive = next.filter((e) => e.enabled);
    if (prev.length !== nextActive.length) return false;
    for (let i = 0; i < prev.length; i++) {
      const p = prev[i].effect;
      const n = nextActive[i];
      if (p.id !== n.id || p.type !== n.type) return false;
    }
    return true;
  }

  private updateChainParams(prev: EffectUnit[], next: TrackEffect[]): void {
    const nextActive = next.filter((e) => e.enabled);
    for (let i = 0; i < prev.length; i++) {
      const unit = prev[i];
      const e = nextActive[i];
      switch (e.type) {
        case "gain":
          this.applyGainEffect(unit.nodes[0] as GainNode, e);
          break;
        case "eq3":
          this.applyEq3Effect(
            unit.nodes[0] as BiquadFilterNode,
            unit.nodes[1] as BiquadFilterNode,
            unit.nodes[2] as BiquadFilterNode,
            e
          );
          break;
        case "filter":
          this.applyFilterEffect(unit.nodes[0] as BiquadFilterNode, e);
          break;
        case "compressor":
          this.applyCompressorEffect(
            unit.nodes[0] as DynamicsCompressorNode,
            e
          );
          break;
      }
      unit.effect = e;
    }
  }

  /**
   * Set the DSP chain for a track. The chain is wired between trackGain and
   * masterGain; enabled effects are applied in array order. When the effect
   * structure (ids + types of enabled effects) matches the previous call we
   * update parameters in place; otherwise we rebuild from scratch.
   */
  setTrackEffects(trackId: string, effects: TrackEffect[]): void {
    if (!this.ctx) {
      // No context yet — store a marker by upserting state. We can't build
      // nodes until the context exists; the chain will be (re)applied the
      // next time the context is created via `scheduleClips`.
      return;
    }
    const chain = this.getOrCreateTrackChain(trackId);
    if (chain.effects === effects) return; // reference-equal — nothing to do

    if (this.chainStructureMatches(chain.units, effects)) {
      this.updateChainParams(chain.units, effects);
      chain.effects = effects;
      return;
    }

    // Rebuild: disconnect current chain.
    try {
      chain.trackGain.disconnect();
    } catch {
      /* not connected */
    }
    for (const unit of chain.units) {
      for (const n of unit.nodes) {
        try {
          n.disconnect();
        } catch {
          /* not connected */
        }
      }
    }
    chain.units = [];

    // Build new chain from enabled effects.
    const newUnits: EffectUnit[] = [];
    for (const effect of effects) {
      if (!effect.enabled) continue;
      const unit = this.buildEffectUnit(effect);
      if (unit) newUnits.push(unit);
    }
    chain.units = newUnits;
    chain.effects = effects;

    // Wire up: trackGain → unit[0] → unit[1] → ... → masterGain.
    let prevOutput: AudioNode = chain.trackGain;
    for (const unit of newUnits) {
      prevOutput.connect(unit.input);
      prevOutput = unit.output;
    }
    prevOutput.connect(this.masterGain!);
  }

  /**
   * Tear down chains for tracks not in `trackIds`, releasing their audio
   * nodes. Called whenever the authoritative track list flows through
   * `updateTracks` so deleted tracks don't leak GainNodes/effect chains.
   */
  retainTracks(trackIds: Iterable<string>): void {
    const keep = new Set(trackIds);
    for (const [id, chain] of this.trackChains) {
      if (keep.has(id)) continue;
      try {
        chain.trackGain.disconnect();
      } catch {
        /* not connected */
      }
      for (const unit of chain.units) {
        for (const n of unit.nodes) {
          try {
            n.disconnect();
          } catch {
            /* not connected */
          }
        }
      }
      this.trackChains.delete(id);
    }
  }

  /** Solo rule: if any audio track is soloed, non-solo tracks are silenced. */
  updateTracks(tracks: TimelineTrack[]): void {
    if (!this.ctx) {
      return;
    }
    this.retainTracks(tracks.map((t) => t.id));
    const audioTracks = tracks.filter((t) => t.type === "audio");
    const hasSolo = audioTracks.some((t) => t.solo);
    const now = this.ctx.currentTime;

    for (const track of audioTracks) {
      const chain = this.getOrCreateTrackChain(track.id);
      const muted = track.muted === true || (hasSolo && !track.solo);
      // Use a short ramp instead of a hard cut to avoid clicks.
      chain.trackGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
      this.setTrackEffects(track.id, track.effects ?? []);
    }
  }

  async scheduleClips(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    currentTimeMs: number,
    shouldCancel?: () => boolean
  ): Promise<void> {
    const ctx = this.getContext();
    const activeIds = new Set(clips.map((c) => c.clip.id));

    for (const [id, src] of this.clipSources) {
      if (!activeIds.has(id)) {
        try {
          src.stop();
        } catch {
          // source may already have stopped at its natural end
        }
        const gain = this.clipGains.get(id);
        try {
          gain?.disconnect();
        } catch {
          /* not connected */
        }
        this.clipSources.delete(id);
        this.clipGains.delete(id);
      }
    }

    this.updateTracks(tracks);

    const bufferPromises = clips.map(async ({ clip, assetUrl }) => {
      if (this.clipSources.has(clip.id) || !clip.currentAssetId) {
        return { clipId: clip.id, buffer: null };
      }
      const buffer = await this.loadBuffer(clip.currentAssetId, assetUrl);
      return { clipId: clip.id, buffer };
    });

    const loadedBuffers = await Promise.all(bufferPromises);
    // A newer play/pause/seek gesture superseded this call while buffers were
    // loading — registering now would schedule audio at a stale offset.
    if (shouldCancel?.()) {
      return;
    }
    const bufferMap = new Map(loadedBuffers.map((b) => [b.clipId, b.buffer]));

    for (const { clip, assetUrl } of clips) {
      if (this.clipSources.has(clip.id)) {
        continue;
      }
      if (!clip.currentAssetId) {
        continue;
      }

      const buffer = bufferMap.get(clip.id);
      if (!buffer) {
        continue;
      }

      // If the speed change has been baked into the asset, the asset already
      // plays at the right speed → do not re-apply the rate, and treat the
      // clip's timeline duration as 1:1 with the buffer.
      const rate =
        clip.speedBaked ? 1 : Math.max(0.0001, clip.speedMultiplier ?? 1);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;

      const volumeLinear = clip.volumeDb
        ? Math.pow(10, clip.volumeDb / 20)
        : 1;
      const clipGain = ctx.createGain();
      clipGain.gain.value = volumeLinear;

      const now = ctx.currentTime;
      // Schedule the clip's start on the audio clock. If the clip begins in
      // the future (relative to the playhead), defer src.start; otherwise
      // start immediately with a buffer offset for mid-clip seeks.
      //
      // `src.start(when, offset, duration)` takes offset/duration in
      // *buffer* seconds, while clip.startMs / durationMs / inPointMs are
      // *timeline* milliseconds. With playbackRate = r, 1 timeline second
      // consumes r buffer seconds, so we multiply by `rate`.
      const clipLeadSec = Math.max(0, (clip.startMs - currentTimeMs) / 1000);
      const intoClipTimelineSec =
        Math.max(0, currentTimeMs - clip.startMs) / 1000;
      const bufferOffsetSec =
        intoClipTimelineSec * rate + (clip.inPointMs ?? 0) / 1000;
      const remainingTimelineMs =
        clip.startMs + clip.durationMs - Math.max(currentTimeMs, clip.startMs);
      const remainingTimelineSec = Math.max(0, remainingTimelineMs / 1000);
      const bufferDurationSec = remainingTimelineSec * rate;
      const startAt = now + clipLeadSec;
      // Wall-clock time at which playback ends — used to schedule fade-out.
      const clipEndAt = startAt + remainingTimelineSec;

      if (clip.fadeInMs && clip.fadeInMs > 0) {
        const fadeEndMs = clip.startMs + clip.fadeInMs;
        if (currentTimeMs < fadeEndMs) {
          // Ramp from the interpolated in-progress gain to full volume.
          const offsetInFadeMs = Math.max(0, currentTimeMs - clip.startMs);
          const startGain = volumeLinear * (offsetInFadeMs / clip.fadeInMs);
          const remainingSec = (fadeEndMs - Math.max(currentTimeMs, clip.startMs)) / 1000;
          clipGain.gain.setValueAtTime(startGain, startAt);
          clipGain.gain.linearRampToValueAtTime(volumeLinear, startAt + remainingSec);
        } else {
          clipGain.gain.setValueAtTime(volumeLinear, startAt);
        }
      }

      if (clip.fadeOutMs && clip.fadeOutMs > 0) {
        const fadeSec = clip.fadeOutMs / 1000;
        const fadeOutStartAt = Math.max(startAt, clipEndAt - fadeSec);
        if (fadeOutStartAt < clipEndAt) {
          clipGain.gain.setValueAtTime(volumeLinear, fadeOutStartAt);
          clipGain.gain.linearRampToValueAtTime(0, clipEndAt);
        }
      }

      src.connect(clipGain);
      const trackGain = this.getTrackGain(clip.trackId);
      clipGain.connect(trackGain);

      src.start(startAt, bufferOffsetSec, bufferDurationSec);

      this.clipSources.set(clip.id, src);
      this.clipGains.set(clip.id, clipGain);
    }
  }

  stopAll(): void {
    for (const [, src] of this.clipSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        /* not connected */
      }
    }
    for (const [, gain] of this.clipGains) {
      try {
        gain.disconnect();
      } catch {
        /* not connected */
      }
    }
    this.clipSources.clear();
    this.clipGains.clear();
  }

  suspend(): void {
    // No-op on an OfflineAudioContext (no parameterless suspend).
    const c = this.ctx as Partial<AudioContext> | null;
    if (c && typeof c.suspend === "function") void c.suspend();
  }

  resume(): void {
    const c = this.ctx as Partial<AudioContext> | null;
    if (c && typeof c.resume === "function") void c.resume();
  }

  dispose(): void {
    this.stopAll();
    for (const chain of this.trackChains.values()) {
      try {
        chain.trackGain.disconnect();
      } catch {
        /* not connected */
      }
      for (const unit of chain.units) {
        for (const n of unit.nodes) {
          try {
            n.disconnect();
          } catch {
            /* not connected */
          }
        }
      }
    }
    this.trackChains.clear();
    // OfflineAudioContext has no close(); only close a real-time context.
    const c = this.ctx as Partial<AudioContext> | null;
    if (c && typeof c.close === "function") void c.close();
    this.ctx = null;
    this.masterGain = null;
  }
}
