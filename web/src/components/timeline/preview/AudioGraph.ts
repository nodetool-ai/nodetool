import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

export interface ScheduledAudioClip {
  clip: TimelineClip;
  /** Resolved HTTP URL for the audio asset. */
  assetUrl: string;
}

export class AudioGraph {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackGains = new Map<string, GainNode>();
  private clipGains = new Map<string, GainNode>();
  private clipSources = new Map<string, AudioBufferSourceNode>();
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  /** Must be called from a user-gesture handler — triggers the autoplay policy. */
  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  async loadBuffer(assetId: string, url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(assetId)) {
      return this.bufferCache.get(assetId)!;
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

  private getTrackGain(trackId: string): GainNode {
    if (!this.trackGains.has(trackId)) {
      const ctx = this.getContext();
      const gain = ctx.createGain();
      gain.connect(this.masterGain!);
      this.trackGains.set(trackId, gain);
    }
    return this.trackGains.get(trackId)!;
  }

  /** Solo rule: if any audio track is soloed, non-solo tracks are silenced. */
  updateTracks(tracks: TimelineTrack[]): void {
    if (!this.ctx) {
      return;
    }
    const audioTracks = tracks.filter((t) => t.type === "audio");
    const hasSolo = audioTracks.some((t) => t.solo);
    const now = this.ctx.currentTime;

    for (const track of audioTracks) {
      const gain = this.getTrackGain(track.id);
      const muted = track.muted === true || (hasSolo && !track.solo);
      // Use a short ramp instead of a hard cut to avoid clicks.
      gain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
    }
  }

  async scheduleClips(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    currentTimeMs: number
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
        this.clipSources.delete(id);
        this.clipGains.delete(id);
      }
    }

    this.updateTracks(tracks);

    for (const { clip, assetUrl } of clips) {
      if (this.clipSources.has(clip.id)) {
        continue;
      }
      if (!clip.currentAssetId) {
        continue;
      }

      const buffer = await this.loadBuffer(clip.currentAssetId, assetUrl);
      if (!buffer) {
        continue;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = clip.speedMultiplier ?? 1;

      const volumeLinear = clip.volumeDb
        ? Math.pow(10, clip.volumeDb / 20)
        : 1;
      const clipGain = ctx.createGain();
      clipGain.gain.value = volumeLinear;

      const now = ctx.currentTime;
      // Schedule the clip's start on the audio clock. If the clip begins in
      // the future (relative to the playhead), defer src.start; otherwise
      // start immediately with a buffer offset for mid-clip seeks.
      const clipLeadSec = Math.max(0, (clip.startMs - currentTimeMs) / 1000);
      const bufferOffsetSec =
        Math.max(0, currentTimeMs - clip.startMs) / 1000 +
        (clip.inPointMs ?? 0) / 1000;
      const remainingMs =
        clip.startMs + clip.durationMs - Math.max(currentTimeMs, clip.startMs);
      const durationSec = Math.max(0, remainingMs / 1000);
      const startAt = now + clipLeadSec;

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
        const clipEndAt = startAt + durationSec;
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

      src.start(startAt, bufferOffsetSec, durationSec);

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
    }
    this.clipSources.clear();
    this.clipGains.clear();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  dispose(): void {
    this.stopAll();
    for (const gain of this.trackGains.values()) {
      gain.disconnect();
    }
    this.trackGains.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
  }
}
