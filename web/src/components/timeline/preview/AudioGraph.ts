/**
 * AudioGraph
 *
 * Manages the WebAudio mixing graph for timeline preview playback.
 *
 * Graph topology per audio clip:
 *   AudioBufferSourceNode
 *     → per-clip GainNode  (volume, fade-in / fade-out)
 *     → per-track GainNode (track volume, mute, solo)
 *     → master GainNode
 *     → AudioContext.destination
 *
 * Solo rule: when any audio track has `solo = true`, all non-solo tracks
 * are silenced via their track GainNode.
 *
 * Buffers are loaded from asset URLs via `fetch + decodeAudioData` and
 * cached by assetId so repeated seeks never re-download the same file.
 */

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

export interface ScheduledAudioClip {
  clip: TimelineClip;
  /** Resolved HTTP URL for the audio asset. */
  assetUrl: string;
}

export class AudioGraph {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  /** Per-track gain node (track volume / mute / solo). */
  private trackGains = new Map<string, GainNode>();

  /** Per-clip gain node (volume + fades). */
  private clipGains = new Map<string, GainNode>();

  /** Currently playing source nodes, keyed by clipId. */
  private clipSources = new Map<string, AudioBufferSourceNode>();

  /** Decoded buffer cache keyed by assetId. */
  private bufferCache = new Map<string, AudioBuffer>();

  /** In-flight decode promises keyed by assetId. */
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  // ── AudioContext lifecycle ─────────────────────────────────────────────────

  /**
   * Lazily create and return the AudioContext.
   * Calling this triggers the browser's autoplay policy; call it from a
   * user-gesture handler (play button click).
   */
  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** The raw AudioContext (null until first getContext() call). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  // ── Buffer loading ─────────────────────────────────────────────────────────

  /** Load and decode an audio buffer, caching the result by assetId. */
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

  // ── Track gain management ──────────────────────────────────────────────────

  private getTrackGain(trackId: string): GainNode {
    if (!this.trackGains.has(trackId)) {
      const ctx = this.getContext();
      const gain = ctx.createGain();
      gain.connect(this.masterGain!);
      this.trackGains.set(trackId, gain);
    }
    return this.trackGains.get(trackId)!;
  }

  /**
   * Update all track-level gain nodes to reflect the current mute/solo state.
   * Solo rule: if ANY audio track is soloed, non-solo tracks are silenced.
   */
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

  // ── Clip scheduling ────────────────────────────────────────────────────────

  /**
   * Schedule playback for the supplied set of active audio clips, stopping
   * any previously scheduled clips that are no longer active.
   *
   * @param clips          Active audio clips with resolved asset URLs.
   * @param tracks         All tracks (used for mute/solo resolution).
   * @param currentTimeMs  Current playhead position in the timeline (ms).
   */
  async scheduleClips(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    currentTimeMs: number
  ): Promise<void> {
    const ctx = this.getContext();
    const activeIds = new Set(clips.map((c) => c.clip.id));

    // Stop sources for clips no longer in the active set.
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

    // Sync track volumes.
    this.updateTracks(tracks);

    // Start newly active clips.
    for (const { clip, assetUrl } of clips) {
      if (this.clipSources.has(clip.id)) {
        continue; // already playing
      }
      if (!clip.currentAssetId) {
        continue;
      }

      const buffer = await this.loadBuffer(clip.currentAssetId, assetUrl);
      if (!buffer) {
        continue;
      }

      // Source node.
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = clip.speedMultiplier ?? 1;

      // Per-clip gain node.
      const volumeLinear = clip.volumeDb
        ? Math.pow(10, clip.volumeDb / 20)
        : 1;
      const clipGain = ctx.createGain();
      clipGain.gain.value = volumeLinear;

      const now = ctx.currentTime;

      // Fade-in envelope.
      if (clip.fadeInMs && clip.fadeInMs > 0) {
        const fadeSec = clip.fadeInMs / 1000;
        clipGain.gain.setValueAtTime(0, now);
        clipGain.gain.linearRampToValueAtTime(volumeLinear, now + fadeSec);
      }

      // Fade-out envelope.
      if (clip.fadeOutMs && clip.fadeOutMs > 0) {
        const clipEndSec =
          (clip.startMs + clip.durationMs - currentTimeMs) / 1000;
        const fadeSec = clip.fadeOutMs / 1000;
        const fadeOutStartSec = Math.max(0, clipEndSec - fadeSec);
        if (fadeOutStartSec < clipEndSec) {
          clipGain.gain.setValueAtTime(volumeLinear, now + fadeOutStartSec);
          clipGain.gain.linearRampToValueAtTime(0, now + clipEndSec);
        }
      }

      // Connect clip → track.
      src.connect(clipGain);
      const trackGain = this.getTrackGain(clip.trackId);
      clipGain.connect(trackGain);

      // Offset within the buffer (handle mid-clip seek).
      const clipOffsetMs =
        currentTimeMs - clip.startMs + (clip.inPointMs ?? 0);
      const offsetSec = Math.max(0, clipOffsetMs / 1000);

      // Remaining clip duration.
      const remainingMs = clip.startMs + clip.durationMs - currentTimeMs;
      const durationSec = Math.max(0, remainingMs / 1000);

      src.start(0, offsetSec, durationSec);

      this.clipSources.set(clip.id, src);
      this.clipGains.set(clip.id, clipGain);
    }
  }

  // ── Playback control ───────────────────────────────────────────────────────

  /** Stop all currently playing sources. */
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

  /** Suspend the AudioContext (call when pausing). */
  suspend(): void {
    void this.ctx?.suspend();
  }

  /** Resume the AudioContext (call when unpausing). */
  resume(): void {
    void this.ctx?.resume();
  }

  /** Release all resources and close the AudioContext. */
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
