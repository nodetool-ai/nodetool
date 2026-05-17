/**
 * Renders the timeline's audio tracks to an AudioBuffer using
 * OfflineAudioContext. Mirrors the live `AudioGraph` chain (per-clip gain,
 * fades, track gain, EQ/filter/compressor effects, solo/mute) so the
 * exported audio matches what the user hears in preview.
 *
 * The chain-building helpers are deliberately duplicated rather than shared
 * with `AudioGraph`: that class is wired to a live `AudioContext` with its
 * own lifecycle (`getContext`, `resume`, `stopAll`, …), and threading
 * `OfflineAudioContext` through it would require a larger refactor that's
 * out of scope for this prototype.
 */

import type {
  TimelineClip,
  TimelineTrack,
  TrackCompressorEffect,
  TrackEffect,
  TrackEq3Effect,
  TrackFilterEffect,
  TrackGainEffect
} from "@nodetool-ai/timeline";

const DB_TO_LIN = (db: number): number => Math.pow(10, db / 20);

interface ScheduledClip {
  clip: TimelineClip;
  buffer: AudioBuffer;
}

export interface OfflineAudioRendererOptions {
  durationMs: number;
  sampleRate?: number;
  numberOfChannels?: number;
  resolveAssetUrl: (assetId: string) => Promise<string | null>;
  signal?: AbortSignal;
}

export class OfflineAudioRenderer {
  /**
   * Returns null when the timeline has no audible clips — the caller can
   * skip the audio track entirely in that case.
   */
  async render(
    tracks: TimelineTrack[],
    clips: TimelineClip[],
    options: OfflineAudioRendererOptions
  ): Promise<AudioBuffer | null> {
    const {
      durationMs,
      sampleRate = 48_000,
      numberOfChannels = 2,
      resolveAssetUrl,
      signal
    } = options;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    const audibleClips = clips.filter(
      (c) =>
        c.mediaType === "audio" &&
        !c.muted &&
        c.currentAssetId &&
        (c.status === "generated" ||
          c.status === "stale" ||
          c.status === "locked") &&
        c.startMs < durationMs &&
        c.startMs + c.durationMs > 0
    );
    if (audibleClips.length === 0) return null;

    const lengthFrames = Math.max(
      1,
      Math.ceil((durationMs / 1000) * sampleRate)
    );

    // OfflineAudioContext has a one-shot lifecycle — built, configured,
    // started. The same DSP-node API as AudioContext applies.
    const ctx = new OfflineAudioContext({
      numberOfChannels,
      length: lengthFrames,
      sampleRate
    });
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Track gain + effect chain.
    const audioTracks = tracks.filter((t) => t.type === "audio");
    const hasSolo = audioTracks.some((t) => t.solo);
    const trackInputs = new Map<string, AudioNode>();
    for (const track of audioTracks) {
      const trackGain = ctx.createGain();
      const muted = track.muted === true || (hasSolo && !track.solo);
      trackGain.gain.value = muted ? 0 : 1;
      const tail = buildEffectChain(ctx, track.effects ?? [], trackGain);
      tail.connect(masterGain);
      trackInputs.set(track.id, trackGain);
    }

    // Decode buffers for each clip in parallel.
    const decoded: ScheduledClip[] = [];
    await Promise.all(
      audibleClips.map(async (clip) => {
        const url = await resolveAssetUrl(clip.currentAssetId!);
        if (!url) return;
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          if (signal?.aborted) return;
          // decodeAudioData rejects on unsupported formats — skip silently.
          const buffer = await ctx.decodeAudioData(ab);
          decoded.push({ clip, buffer });
        } catch (err) {
          if ((err as Error)?.name !== "AbortError") {
            console.warn("[export] failed to decode audio clip", clip.id, err);
          }
        }
      })
    );

    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (decoded.length === 0) return null;

    for (const { clip, buffer } of decoded) {
      const trackInput = trackInputs.get(clip.trackId);
      if (!trackInput) continue;
      scheduleClip(ctx, clip, buffer, trackInput);
    }

    // rendering is synchronous from the caller's perspective; abort is
    // checked before/after.
    const rendered = await ctx.startRendering();
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return rendered;
  }
}

/**
 * Builds the per-track DSP chain from `head` (typically the trackGain) and
 * returns the *tail* node that the caller should connect to its sink.
 */
function buildEffectChain(
  ctx: BaseAudioContext,
  effects: TrackEffect[],
  head: AudioNode
): AudioNode {
  let prev = head;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const unit = buildEffectUnit(ctx, effect);
    if (!unit) continue;
    prev.connect(unit.input);
    prev = unit.output;
  }
  return prev;
}

interface EffectUnit {
  input: AudioNode;
  output: AudioNode;
}

function buildEffectUnit(
  ctx: BaseAudioContext,
  effect: TrackEffect
): EffectUnit | null {
  switch (effect.type) {
    case "gain": {
      const node = ctx.createGain();
      applyGain(node, effect);
      return { input: node, output: node };
    }
    case "eq3": {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      applyEq3(low, mid, high, effect);
      low.connect(mid);
      mid.connect(high);
      return { input: low, output: high };
    }
    case "filter": {
      const node = ctx.createBiquadFilter();
      applyFilter(node, effect);
      return { input: node, output: node };
    }
    case "compressor": {
      const node = ctx.createDynamicsCompressor();
      applyCompressor(node, effect);
      return { input: node, output: node };
    }
    default:
      // Video-side effects on an audio track — ignore.
      return null;
  }
}

function applyGain(node: GainNode, e: TrackGainEffect): void {
  node.gain.value = DB_TO_LIN(e.gainDb);
}

function applyEq3(
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

function applyFilter(node: BiquadFilterNode, e: TrackFilterEffect): void {
  node.type = e.mode;
  node.frequency.value = e.frequency;
  node.Q.value = e.q;
}

function applyCompressor(
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
 * Schedules a single audio clip on the offline graph. Mirrors
 * `AudioGraph.scheduleClips` — playback rate, in-point, fade in/out, and
 * clip volume are all applied here.
 *
 * Timeline times are absolute (ms from sequence start); since the offline
 * context's clock starts at 0 we can use them directly without subtracting
 * a "now" reference.
 */
function scheduleClip(
  ctx: OfflineAudioContext,
  clip: TimelineClip,
  buffer: AudioBuffer,
  trackInput: AudioNode
): void {
  const rate = clip.speedBaked
    ? 1
    : Math.max(0.0001, clip.speedMultiplier ?? 1);
  const volumeLinear = clip.volumeDb ? DB_TO_LIN(clip.volumeDb) : 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;

  const clipGain = ctx.createGain();
  clipGain.gain.value = volumeLinear;

  const startSec = clip.startMs / 1000;
  const endSec = (clip.startMs + clip.durationMs) / 1000;
  const bufferOffsetSec = (clip.inPointMs ?? 0) / 1000;
  const bufferDurationSec = ((clip.durationMs / 1000) * rate);

  // Fade-in: ramp 0 → volume over fadeInMs starting at clip start.
  if (clip.fadeInMs && clip.fadeInMs > 0) {
    const fadeEndSec = startSec + clip.fadeInMs / 1000;
    clipGain.gain.setValueAtTime(0, startSec);
    clipGain.gain.linearRampToValueAtTime(volumeLinear, fadeEndSec);
  } else {
    clipGain.gain.setValueAtTime(volumeLinear, startSec);
  }

  // Fade-out: ramp volume → 0 over the last fadeOutMs of the clip.
  if (clip.fadeOutMs && clip.fadeOutMs > 0) {
    const fadeSec = clip.fadeOutMs / 1000;
    const fadeStartSec = Math.max(startSec, endSec - fadeSec);
    clipGain.gain.setValueAtTime(volumeLinear, fadeStartSec);
    clipGain.gain.linearRampToValueAtTime(0, endSec);
  }

  src.connect(clipGain);
  clipGain.connect(trackInput);
  src.start(startSec, bufferOffsetSec, bufferDurationSec);
}
