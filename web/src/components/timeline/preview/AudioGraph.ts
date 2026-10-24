import {
  automationBreakpoints,
  fadeShapeGain,
  INSTRUMENT_DEVICE_ID,
  isAutomationLaneActive,
  midiClipNoteEvents,
  resolveClipFades,
  sampleFadeShape,
  timeRemapAudioSegments
} from "@nodetool-ai/timeline";
import type { ClipFadeShape, TimeRemapAudioSegment } from "@nodetool-ai/timeline";
import type {
  AutomationLane,
  MidiInstrument,
  TimelineClip,
  TimelineMasterChannel,
  TimelineTrack,
  TrackEffect
} from "@nodetool-ai/timeline";
import {
  liveDeviceFactory,
  type DeviceAutomationLane,
  type LiveInstrumentDevice,
  type LiveNoteEvent
} from "../daw/devices/liveDevice";
import {
  applyCompressorEffect,
  applyEq3Effect,
  applyFilterEffect,
  applyFableEffect,
  applyGainEffect,
  buildClipEffectChain,
  buildEffectUnit,
  disconnectNodes,
  effectAutomationParam,
  releaseEffectUnit,
  type ClipEffectChain,
  type EffectUnit
} from "./audioEffectNodes";
import type { FableFxHandle } from "../daw/fx/fableFxUnit";

/**
 * One clip handed to the graph for scheduling, with the PCM it should play:
 * either an asset URL the graph decodes or streams (an audio clip) or a buffer
 * the caller already rendered (a midi clip, from `midiRender.ts`). Everything
 * downstream — clip gain, fades, the track chain, mute/solo, the offline
 * export — treats them identically.
 */
export type ScheduledAudioClip =
  | {
      clip: TimelineClip;
      /** Resolved HTTP URL for the audio asset. */
      assetUrl: string;
      buffer?: undefined;
      /** The asset's byte size, when known. See {@link prefersStreamedPlayback}. */
      assetSize?: number | null;
      /** The asset's duration in seconds, when known. */
      assetDurationSec?: number | null;
    }
  | {
      clip: TimelineClip;
      assetUrl?: undefined;
      /** Already-rendered PCM — no asset, no decode. */
      buffer: AudioBuffer;
    }
  | {
      /**
       * A midi clip played by its track's live device: the graph sends the
       * clip's notes to the device instead of playing a buffer.
       */
      clip: TimelineClip;
      live: { bpm: number };
      assetUrl?: undefined;
      buffer?: undefined;
    };

/** A scheduled clip that plays PCM through the graph, not a live device. */
type PcmScheduledClip = Exclude<ScheduledAudioClip, { live: { bpm: number } }>;

/** Linear gain of a fader position in decibels. */
export function dbToGain(db: number | undefined): number {
  return db === undefined || db === 0 ? 1 : Math.pow(10, db / 20);
}

/** A track's live instrument and the instrument type it was made for. */
interface TrackDeviceState {
  type: MidiInstrument["type"];
  device: Promise<LiveInstrumentDevice | null>;
  /** Set once `device` resolves, for synchronous callers. */
  ready: LiveInstrumentDevice | null;
  /** The newest instrument, applied when a device still loading resolves. */
  instrument: MidiInstrument;
}

/** An insert chain: the effects last applied and the nodes built for them. */
interface EffectChainState {
  /** Last applied snapshot — used to skip rebuilds when reference-equal. */
  effects: TrackEffect[];
  units: EffectUnit[];
}

interface TrackChainState extends EffectChainState {
  /**
   * trackGain (mute/solo) → units → fader (volumeDb) → panner → mix bus.
   * The analyser taps the panner for the mixer's meters.
   */
  trackGain: GainNode;
  fader: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  /** Per-side analysers, made the first time a stereo meter asks. */
  meter?: StereoMeterTap;
}

/**
 * A stereo meter's taps on a channel output: an `AnalyserNode` downmixes to
 * mono, so each side gets its own after a splitter.
 */
export interface StereoMeterTap {
  left: AnalyserNode;
  right: AnalyserNode;
  /** The splitter feeding both, disconnected with the channel. */
  splitter: ChannelSplitterNode;
}

/**
 * The play gesture's clock for automation: the document time at a context
 * time, and the playback rate.
 */
interface AutomationClock {
  ctxSec: number;
  docMs: number;
  rate: number;
}

/** A device or FX stage that plays automation lanes itself. */
interface AutomatedDevice {
  setAutomation?(lanes: readonly DeviceAutomationLane[]): void;
  syncAutomation?(): Promise<void>;
}

/** What one track's scheduled automation holds, to release it again. */
interface TrackAutomationState {
  /** The track fields it was scheduled from; a change reschedules it. */
  automation: TimelineTrack["automation"];
  effects: TimelineTrack["effects"];
  instrumentType: MidiInstrument["type"] | undefined;
  /** Automated params and the value each returns to when automation stops. */
  params: Map<AudioParam, number>;
  devices: Set<AutomatedDevice>;
}

/** Longest straight ramp a curved automation segment is cut into. */
const AUTOMATION_STEP_MS = 10;

/** Analyser window for channel meters: about 43 ms at 48 kHz. */
const METER_FFT_SIZE = 2048;

/** Sample spacing for a shaped fade, and the bounds that spacing is held to. */
const FADE_CURVE_STEP_MS = 5;
const FADE_CURVE_MIN_STEPS = 16;
const FADE_CURVE_MAX_STEPS = 1024;

/**
 * Schedule `param` along a fade `shape`, from progress `from` to progress `to`
 * scaled by `peak`, over `durationSec` starting at `startAt`.
 *
 * A linear fade is a straight ramp, which WebAudio schedules exactly and in
 * one event. Every other shape is sampled: `setValueCurveAtTime` is the only
 * automation that follows an arbitrary curve, and sampling it here is what
 * keeps the preview on the same curve the export renders.
 */
function rampAlongFade(
  param: AudioParam,
  shape: ClipFadeShape,
  from: number,
  to: number,
  peak: number,
  startAt: number,
  durationSec: number
): void {
  if (durationSec <= 0) {
    param.setValueAtTime(peak * fadeShapeGain(shape, to), startAt);
    return;
  }
  if (shape === "linear") {
    param.setValueAtTime(peak * from, startAt);
    param.linearRampToValueAtTime(peak * to, startAt + durationSec);
    return;
  }
  const steps = Math.min(
    FADE_CURVE_MAX_STEPS,
    Math.max(
      FADE_CURVE_MIN_STEPS,
      Math.round((durationSec * 1000) / FADE_CURVE_STEP_MS)
    )
  );
  const curve = sampleFadeShape(shape, from, to, steps);
  if (peak !== 1) {
    for (let i = 0; i < curve.length; i += 1) curve[i] *= peak;
  }
  param.setValueCurveAtTime(curve, startAt, durationSec);
}

/**
 * One stretch over a buffer that already is the clip's window: source offset
 * zero, unit rate, the clip's own span on the timeline.
 */
function windowSegments(clip: TimelineClip): TimeRemapAudioSegment[] {
  return [
    {
      timelineStartMs: clip.startMs,
      timelineEndMs: clip.startMs + clip.durationMs,
      sourceStartMs: 0,
      sourceEndMs: clip.durationMs,
      rate: 1,
      reverse: false
    }
  ];
}

/**
 * Files at or above this size, or this long, stream during preview instead of
 * being decoded. A decoded buffer is float32 per channel: five minutes of
 * 48 kHz stereo is about 115 MB, and a two-hour WAV several gigabytes.
 */
export const STREAM_MIN_BYTES = 50 * 1024 * 1024;
export const STREAM_MIN_DURATION_SEC = 5 * 60;

/**
 * Whether an asset of this size and duration plays through a media element
 * rather than a decoded buffer.
 *
 * Streaming is kept to large files. A media element starts on a timer and its
 * own clock, not on the audio clock, so it can sit a few tens of milliseconds
 * off the timeline where a buffer source is sample-exact; its playback rate is
 * limited to 1/16..16. A short clip, the common case for sound effects and
 * dialogue, keeps the exact path. The offline export always decodes, because
 * an `OfflineAudioContext` cannot take a media element.
 */
export function prefersStreamedPlayback(
  sizeBytes: number | null | undefined,
  durationSec: number | null | undefined
): boolean {
  return (
    (sizeBytes ?? 0) >= STREAM_MIN_BYTES ||
    (durationSec ?? 0) >= STREAM_MIN_DURATION_SEC
  );
}

/** Media element playback rates browsers accept. */
const MEDIA_ELEMENT_MIN_RATE = 0.0625;
const MEDIA_ELEMENT_MAX_RATE = 16;
/** A streamed start this late (seconds) seeks forward to catch up. */
const STREAM_LATE_START_SEC = 0.02;

/** A streamed element still this far (seconds) behind when it starts playing
 *  is seeked forward; smaller gaps are inaudible and a seek would stall it. */
const STREAM_PLAYING_RESYNC_SEC = 0.08;

/** A scheduled sound the graph can stop and release. */
interface PlayingSource {
  /** Stop at `when` on the audio clock, or now. */
  stop(when?: number): void;
  disconnect(): void;
  /** Called once the source has played to its end or been stopped. */
  onended: ((event: Event) => unknown) | null;
}

/**
 * How long a stopped clip takes to ramp to silence. Cutting a source off
 * mid-waveform clicks; a few milliseconds of ramp is inaudible as a fade.
 */
const DECLICK_SEC = 0.005;
/** Wall-clock slack past the ramp before its nodes are disconnected. */
const DECLICK_RELEASE_MS = DECLICK_SEC * 1000 + 20;
/** Fade-in of a scrub grain. */
const GRAIN_ATTACK_SEC = 0.012;
/** Samples in a grain envelope curve. */
const GRAIN_CURVE_STEPS = 32;

/**
 * A raised-cosine fade from `from` to `to`. Its slope is zero at both ends,
 * so a grain edge has no corner that sounds as a click.
 */
function raisedCosineCurve(from: number, to: number): Float32Array {
  const curve = new Float32Array(GRAIN_CURVE_STEPS);
  for (let i = 0; i < GRAIN_CURVE_STEPS; i += 1) {
    const progress = i / (GRAIN_CURVE_STEPS - 1);
    const shape = (1 - Math.cos(Math.PI * progress)) / 2;
    curve[i] = from + (to - from) * shape;
  }
  return curve;
}

/** Hold `param` at its current value and drop the events after `now`. */
function holdParam(param: AudioParam, now: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(held, now);
  }
}

/**
 * Ramp `param` from wherever it is now to silence by `endAt`. Holding the
 * current value first matters: cancelling a ramp in progress would otherwise
 * jump back to the value before it, which is the click this avoids.
 */
function rampToSilence(param: AudioParam, now: number, endAt: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(held, now);
  }
  param.linearRampToValueAtTime(0, endAt);
}

/**
 * One constant-rate stretch played through a media element, which streams the
 * file with Range requests instead of decoding it whole. A gate gain opens and
 * closes on the audio clock, so the stretch is heard exactly between its start
 * and end even though the element itself starts on a timer.
 */
class StreamedSegment implements PlayingSource {
  onended: ((event: Event) => unknown) | null = null;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private ctx: BaseAudioContext | null = null;

  constructor(
    private readonly element: HTMLAudioElement,
    private readonly node: MediaElementAudioSourceNode,
    private readonly gate: GainNode
  ) {}

  schedule(
    ctx: BaseAudioContext,
    startAt: number,
    endAt: number,
    offsetSec: number,
    rate: number
  ): void {
    this.ctx = ctx;
    this.gate.gain.setValueAtTime(0, ctx.currentTime);
    this.gate.gain.setValueAtTime(1, startAt);
    this.gate.gain.setValueAtTime(0, endAt);
    this.element.currentTime = offsetSec;
    this.timers.push(
      setTimeout(
        () => {
          if (this.stopped) return;
          // Timers run late; seek past what the clock has already covered.
          const late = ctx.currentTime - startAt;
          if (late > STREAM_LATE_START_SEC) {
            this.element.currentTime = offsetSec + late * rate;
          }
          // Buffering delays the first sample past this timer, so the element
          // is late again once it really starts: re-sync when it reports
          // `playing`, against the audio clock at that moment.
          const onPlaying = (): void => {
            this.element.removeEventListener("playing", onPlaying);
            if (this.stopped) return;
            const behind =
              offsetSec +
              Math.max(0, ctx.currentTime - startAt) * rate -
              this.element.currentTime;
            if (behind > STREAM_PLAYING_RESYNC_SEC) {
              this.element.currentTime += behind;
            }
          };
          this.element.addEventListener("playing", onPlaying);
          void this.element.play().catch(() => {
            // Autoplay refusal or a stop racing the start: stays silent.
          });
        },
        Math.max(0, (startAt - ctx.currentTime) * 1000)
      ),
      // The gate already closed at endAt; pausing stops the download.
      setTimeout(
        () => {
          if (this.stopped) return;
          this.element.pause();
          this.onended?.(new Event("ended"));
        },
        Math.max(0, (endAt - ctx.currentTime) * 1000)
      )
    );
  }

  stop(when?: number): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    const release = (): void => {
      this.element.pause();
      // Drop the source so the element releases its buffered media.
      this.element.removeAttribute("src");
      this.element.load();
    };
    // The element runs on its own clock, so a stop on the audio clock is a
    // timer: it keeps playing under the clip gain's ramp to silence.
    const delayMs =
      when !== undefined && this.ctx
        ? Math.max(0, (when - this.ctx.currentTime) * 1000)
        : 0;
    if (delayMs > 0) setTimeout(release, delayMs);
    else release();
  }

  disconnect(): void {
    this.node.disconnect();
    this.gate.disconnect();
  }
}

export interface AudioGraphOptions {
  /** Test seam: makes the media element a streamed clip plays through. */
  createMediaElement?: () => HTMLAudioElement;
  /**
   * Cancels the graph's asset fetches. The offline export passes its own, so
   * a cancelled mixdown stops downloading instead of finishing in the
   * background.
   */
  signal?: AbortSignal;
}

/**
 * LRU cap on decoded AudioBuffer entries. A 3-min stereo @ 48 kHz buffer is
 * ~70 MB; we keep a small working set and rely on re-decode on miss.
 */
const BUFFER_CACHE_MAX = 16;

/** Decoded-buffer cache key: the asset id plus the URL it was fetched from. */
export function audioBufferCacheKey(assetId: string, url: string): string {
  return `${assetId}\u0000${url}`;
}

/**
 * A media element kept for scrubbing one streamed clip. Each grain seeks and
 * plays the same element, so the file loads once per scrub, not once per
 * grain: a fresh element per grain would still be loading when its 90 ms end.
 */
interface ScrubVoice {
  url: string;
  element: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
  trackId: string | null;
  /** Bumped by every grain, so a stale pause leaves a newer grain alone. */
  grain: number;
}

export class AudioGraph {
  private ctx: BaseAudioContext | null = null;
  private masterGain: GainNode | null = null;
  /**
   * The document's master channel: every track channel sums here, then runs
   * through the master inserts and the master fader (`masterFader`) into the
   * listener volume (`masterGain`). The analyser taps the fader's output.
   */
  private mixBus: GainNode | null = null;
  private masterFader: GainNode | null = null;
  private masterChain: EffectChainState = { effects: [], units: [] };
  /** Tempo the `fable` inserts sync their echo and LAB stages to. */
  private fxBpm = 120;
  /** Context time of the timeline's zero for the current play gesture. */
  private beatZeroSec = 0;
  /** The document's master channel, kept so a later context starts with it. */
  private master: TimelineMasterChannel | undefined;
  private mixAnalyser: AnalyserNode | null = null;
  private masterMeter: StereoMeterTap | null = null;
  private trackDevices = new Map<string, TrackDeviceState>();
  /** Clips playing through a live device, by clip id, with their track id. */
  private liveClips = new Map<string, string>();
  /** Listener volume, linear 0..1. Applied after every mix decision. */
  private masterVolume = 1;
  private trackChains = new Map<string, TrackChainState>();
  private clipGains = new Map<string, GainNode>();
  /** Real-time effect chains of playing clips that carry `audioEffects`. */
  private clipEffectChains = new Map<string, ClipEffectChain>();
  /**
   * Chains whose clip has ended but whose echo or reverb tail is still
   * sounding. Stopping playback silences these too.
   */
  private ringingChains = new Set<ClipEffectChain>();
  /**
   * Sources per clip. A clip with a `timeRemap` plays as one source per
   * constant-rate segment of its curve, so this is a list rather than a single
   * node; an ordinary clip has exactly one entry.
   */
  private clipSources = new Map<string, PlayingSource[]>();
  private bufferCache = new Map<string, AudioBuffer>();
  /** Scrub elements of streamed clips, by clip id. */
  private scrubVoices = new Map<string, ScrubVoice>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();
  private readonly createMediaElement: () => HTMLAudioElement;
  private readonly signal: AbortSignal | undefined;
  /** Bumped by every use of the context, so a deferred suspend can see it is stale. */
  private contextUse = 0;
  /** Set while a play gesture runs its automation lanes. */
  private automationClock: AutomationClock | null = null;
  private trackAutomation = new Map<string, TrackAutomationState>();

  constructor(
    private readonly injectedContext?: BaseAudioContext,
    options: AudioGraphOptions = {}
  ) {
    this.createMediaElement =
      options.createMediaElement ?? (() => new Audio());
    this.signal = options.signal;
  }

  /** Must be called from a user-gesture handler — triggers the autoplay policy. */
  getContext(): BaseAudioContext {
    this.contextUse += 1;
    if (!this.ctx) {
      this.ctx = this.injectedContext ?? new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.mixBus = this.ctx.createGain();
      this.masterFader = this.ctx.createGain();
      this.masterFader.gain.value = dbToGain(this.master?.volumeDb);
      this.mixAnalyser = this.ctx.createAnalyser();
      this.mixAnalyser.fftSize = METER_FFT_SIZE;
      this.masterChain = { effects: [], units: [] };
      this.mixBus.connect(this.masterFader);
      this.masterFader.connect(this.masterGain);
      this.masterFader.connect(this.mixAnalyser);
      this.applyEffectChain(
        this.masterChain,
        this.mixBus,
        this.masterFader,
        this.master?.effects ?? []
      );
    }
    return this.ctx;
  }

  /**
   * Set the document's master channel: its inserts run on the summed mix,
   * then its fader. Unlike {@link setMasterVolume} this is part of the
   * document, so the export renders it too. Kept until a context exists.
   */
  setMaster(master: TimelineMasterChannel | undefined): void {
    this.master = master;
    const ctx = this.ctx;
    if (!ctx || !this.mixBus || !this.masterFader) return;
    this.masterFader.gain.setTargetAtTime(
      dbToGain(master?.volumeDb),
      ctx.currentTime,
      0.01
    );
    this.applyEffectChain(
      this.masterChain,
      this.mixBus,
      this.masterFader,
      master?.effects ?? []
    );
  }

  /**
   * Set the listener volume (linear, clamped to 0..1). It scales the whole
   * mix and does not change the document, so the export is not affected.
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volume));
    const ctx = this.ctx;
    const gain = this.masterGain?.gain;
    if (!ctx || !gain) return;
    // A short glide avoids a click when the slider moves during playback.
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setTargetAtTime(this.masterVolume, ctx.currentTime, 0.01);
  }

  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  async loadBuffer(assetId: string, url: string): Promise<AudioBuffer | null> {
    // Keyed by asset and URL: a relinked file keeps its id but not its URL.
    const cacheKey = audioBufferCacheKey(assetId, url);
    const cachedBuffer = this.bufferCache.get(cacheKey);
    if (cachedBuffer) {
      // LRU touch (delete+reinsert) only matters when eviction is imminent.
      // While the cache has spare capacity nothing is evicted, so skip the
      // reorder churn on the hot path.
      if (this.bufferCache.size >= BUFFER_CACHE_MAX) {
        this.bufferCache.delete(cacheKey);
        this.bufferCache.set(cacheKey, cachedBuffer);
      }
      return cachedBuffer;
    }
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    const ctx = this.getContext();
    const promise = (this.signal ? fetch(url, { signal: this.signal }) : fetch(url))
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} fetching audio: ${url}`);
        }
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buffer) => {
        // Drop the same asset's older revisions; nothing asks for them again.
        for (const key of [...this.bufferCache.keys()]) {
          if (key.startsWith(`${assetId}\u0000`)) this.bufferCache.delete(key);
        }
        this.bufferCache.set(cacheKey, buffer);
        this.loadingPromises.delete(cacheKey);
        // Evict least-recently-used entries to bound memory. Sources that are
        // already running hold their own buffer reference, so eviction here
        // does not interrupt in-flight playback.
        while (this.bufferCache.size > BUFFER_CACHE_MAX) {
          const oldestKey = this.bufferCache.keys().next().value;
          if (oldestKey === undefined || oldestKey === cacheKey) break;
          this.bufferCache.delete(oldestKey);
        }
        return buffer;
      })
      .catch((err) => {
        console.warn("[AudioGraph] Failed to load buffer", assetId, err);
        this.loadingPromises.delete(cacheKey);
        return null;
      });

    this.loadingPromises.set(cacheKey, promise);
    return promise;
  }

  // ── Effect chain ────────────────────────────────────────────────────────

  private getOrCreateTrackChain(trackId: string): TrackChainState {
    let chain = this.trackChains.get(trackId);
    if (chain) return chain;

    const ctx = this.getContext();
    const trackGain = ctx.createGain();
    const fader = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = METER_FFT_SIZE;
    // Mono input is upmixed before the panner, as the server render does, so
    // a centred mono channel plays at the level it had before panning.
    panner.channelCount = 2;
    panner.channelCountMode = "explicit";
    trackGain.connect(fader);
    fader.connect(panner);
    panner.connect(this.mixBus!);
    panner.connect(analyser);
    chain = { trackGain, fader, panner, analyser, effects: [], units: [] };
    this.trackChains.set(trackId, chain);
    return chain;
  }

  /** Returns the input node clips on this track should connect into. */
  private getTrackGain(trackId: string): GainNode {
    return this.getOrCreateTrackChain(trackId).trackGain;
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
          applyGainEffect(unit.nodes[0] as GainNode, e);
          break;
        case "eq3":
          applyEq3Effect(
            unit.nodes[0] as BiquadFilterNode,
            unit.nodes[1] as BiquadFilterNode,
            unit.nodes[2] as BiquadFilterNode,
            e
          );
          break;
        case "filter":
          applyFilterEffect(unit.nodes[0] as BiquadFilterNode, e);
          break;
        case "compressor":
          applyCompressorEffect(
            unit.nodes[0] as DynamicsCompressorNode,
            e
          );
          break;
        case "fable":
          applyFableEffect(unit, e, this.fxBpm);
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
    this.applyEffectChain(chain, chain.trackGain, chain.fader, effects);
  }

  /**
   * Bring an insert chain wired `input → units → output` in line with
   * `effects`: parameters in place when the structure matches, otherwise a
   * rebuild. `input` must feed nothing but this chain, since a rebuild
   * disconnects all of its outputs.
   */
  private applyEffectChain(
    chain: EffectChainState,
    input: AudioNode,
    output: AudioNode,
    effects: TrackEffect[]
  ): void {
    if (chain.effects === effects) return; // reference-equal — nothing to do

    if (this.chainStructureMatches(chain.units, effects)) {
      this.updateChainParams(chain.units, effects);
      chain.effects = effects;
      return;
    }

    // Rebuild: disconnect current chain.
    try {
      input.disconnect();
    } catch {
      /* not connected */
    }
    for (const unit of chain.units) releaseEffectUnit(unit);
    chain.units = [];

    // Build new chain from enabled effects.
    const newUnits: EffectUnit[] = [];
    for (const effect of effects) {
      if (!effect.enabled) continue;
      const unit = buildEffectUnit(this.getContext(), effect, { bpm: this.fxBpm });
      if (unit) newUnits.push(unit);
    }
    chain.units = newUnits;
    chain.effects = effects;

    // Wire up: input → unit[0] → unit[1] → ... → output.
    let prevOutput: AudioNode = input;
    for (const unit of newUnits) {
      prevOutput.connect(unit.input);
      prevOutput = unit.output;
    }
    prevOutput.connect(output);
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
      disconnectNodes([chain.trackGain, chain.fader, chain.panner]);
      if (chain.meter) disconnectNodes([chain.meter.splitter]);
      this.disposeTrackDevice(id);
      for (const unit of chain.units) releaseEffectUnit(unit);
      this.trackChains.delete(id);
    }
  }

  /**
   * Solo rule: if any audible track is soloed, non-solo tracks are silenced.
   *
   * A midi track is mixed like an audio one — it carries gain, mute/solo and
   * the same DSP chain — so it belongs in the same solo group; leaving it out
   * would let a soloed audio track play over an unmuted synth part.
   */
  updateTracks(tracks: TimelineTrack[]): void {
    if (!this.ctx) {
      return;
    }
    this.retainTracks(tracks.map((t) => t.id));
    const audioTracks = tracks.filter(
      (t) => t.type === "audio" || t.type === "midi"
    );
    const hasSolo = audioTracks.some((t) => t.solo);
    const now = this.ctx.currentTime;

    for (const track of audioTracks) {
      const chain = this.getOrCreateTrackChain(track.id);
      const muted = track.muted === true || (hasSolo && !track.solo);
      // Use a short ramp instead of a hard cut to avoid clicks.
      chain.trackGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
      // An automated fader or pan follows its lane; its own value returns
      // when the automation stops.
      const automated = this.trackAutomation.get(track.id)?.params;
      if (automated?.has(chain.fader.gain)) {
        automated.set(chain.fader.gain, dbToGain(track.volumeDb));
      } else {
        chain.fader.gain.setTargetAtTime(dbToGain(track.volumeDb), now, 0.01);
      }
      if (automated?.has(chain.panner.pan)) {
        automated.set(chain.panner.pan, track.pan ?? 0);
      } else {
        chain.panner.pan.setTargetAtTime(track.pan ?? 0, now, 0.01);
      }
      this.setTrackEffects(track.id, track.effects ?? []);
      if (track.type === "midi") this.syncTrackDevice(track);
      if (this.automationClock && this.automationChanged(track)) {
        void this.scheduleTrackAutomation(track);
      }
    }
  }

  // ── Automation ──────────────────────────────────────────────────────────

  /**
   * Run every audio and midi track's automation lanes from `currentTimeMs`,
   * for the play gesture that just scheduled its clips. Each lane is set to
   * its value now and ramps along its curve on the context clock: the fader,
   * pan and built-in effects as AudioParam ramps, instruments and FableSynth
   * inserts as lanes in their worklets. An offline render waits until every
   * worklet holds its lanes.
   */
  async startAutomation(
    tracks: TimelineTrack[],
    currentTimeMs: number,
    globalRate = 1
  ): Promise<void> {
    this.stopAutomation();
    if (!(globalRate > 0)) return;
    const ctx = this.getContext();
    this.automationClock = { ctxSec: ctx.currentTime, docMs: currentTimeMs, rate: globalRate };
    const sounding = tracks.filter((t) => t.type === "audio" || t.type === "midi");
    await Promise.all(sounding.map((track) => this.scheduleTrackAutomation(track)));
    if (typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext) {
      const devices = [...this.trackAutomation.values()].flatMap((state) => [...state.devices]);
      await Promise.all(devices.map((device) => device.syncAutomation?.()));
    }
  }

  /** Return every automated param to its own value and clear device lanes. */
  stopAutomation(): void {
    for (const trackId of [...this.trackAutomation.keys()]) {
      this.releaseTrackAutomation(trackId);
    }
    this.automationClock = null;
  }

  private automationChanged(track: TimelineTrack): boolean {
    const state = this.trackAutomation.get(track.id);
    if (!state) return (track.automation?.length ?? 0) > 0;
    return (
      state.automation !== track.automation ||
      state.effects !== track.effects ||
      state.instrumentType !== this.trackDevices.get(track.id)?.type
    );
  }

  private releaseTrackAutomation(trackId: string): void {
    const state = this.trackAutomation.get(trackId);
    if (!state) return;
    this.trackAutomation.delete(trackId);
    const now = this.ctx?.currentTime ?? 0;
    for (const [param, value] of state.params) {
      param.cancelScheduledValues(0);
      param.setTargetAtTime(value, now, 0.01);
    }
    for (const device of state.devices) device.setAutomation?.([]);
  }

  /** Schedule one track's lanes from the clock's current document time. */
  private async scheduleTrackAutomation(track: TimelineTrack): Promise<void> {
    const clock = this.automationClock;
    if (!clock) return;
    this.releaseTrackAutomation(track.id);
    const state: TrackAutomationState = {
      automation: track.automation,
      effects: track.effects,
      instrumentType: this.trackDevices.get(track.id)?.type,
      params: new Map(),
      devices: new Set()
    };
    this.trackAutomation.set(track.id, state);
    const lanes = (track.automation ?? []).filter(isAutomationLaneActive);
    if (lanes.length === 0) return;

    const ctx = this.getContext();
    const chain = this.getOrCreateTrackChain(track.id);
    const now = ctx.currentTime;
    const docNowMs = clock.docMs + (now - clock.ctxSec) * 1000 * clock.rate;
    const toCtxSec = (ms: number) => clock.ctxSec + (ms - clock.docMs) / 1000 / clock.rate;
    const deviceLanes = new Map<AutomatedDevice, DeviceAutomationLane[]>();
    const addDeviceLane = (device: AutomatedDevice | null | undefined, lane: AutomationLane, param: string) => {
      if (!device?.setAutomation) return;
      const points = automationBreakpoints(lane.points, docNowMs, { maxStepMs: AUTOMATION_STEP_MS })
        .map((bp) => ({ timeSec: toCtxSec(bp.timeMs), value: bp.value }));
      deviceLanes.set(device, [...(deviceLanes.get(device) ?? []), { param, points }]);
    };
    const automateParam = (
      param: AudioParam,
      lane: AutomationLane,
      map: (value: number) => number,
      ownValue: number,
      curved: boolean
    ) => {
      const breakpoints = automationBreakpoints(lane.points, docNowMs, {
        maxStepMs: AUTOMATION_STEP_MS,
        subdivideLinear: curved
      });
      if (breakpoints.length === 0) return;
      param.cancelScheduledValues(now);
      param.setValueAtTime(map(breakpoints[0].value), now);
      for (const bp of breakpoints.slice(1)) {
        param.linearRampToValueAtTime(map(bp.value), toCtxSec(bp.timeMs));
      }
      state.params.set(param, ownValue);
    };

    let instrumentLanes: AutomationLane[] = [];
    for (const lane of lanes) {
      const target = lane.target;
      if (target.kind === "mixer") {
        if (target.param === "volumeDb") {
          automateParam(chain.fader.gain, lane, (db) => dbToGain(db), dbToGain(track.volumeDb), true);
        } else {
          automateParam(chain.panner.pan, lane, (pan) => Math.min(1, Math.max(-1, pan)), track.pan ?? 0, false);
        }
        continue;
      }
      if (target.kind !== "device") continue;
      if (target.deviceId === INSTRUMENT_DEVICE_ID) {
        instrumentLanes = [...instrumentLanes, lane];
        continue;
      }
      const unit = chain.units.find((u) => u.effect.id === target.deviceId);
      if (!unit) continue;
      if (unit.fable) {
        addDeviceLane(unit.fable, lane, target.param);
        continue;
      }
      const entry = effectAutomationParam(unit, target.param);
      if (entry) {
        const own = (unit.effect as unknown as Record<string, unknown>)[target.param];
        automateParam(entry.param, lane, entry.map, entry.map(typeof own === "number" ? own : 0), entry.curved);
      }
    }
    if (instrumentLanes.length > 0) {
      // Nothing may have played on the track yet: its device starts here.
      this.syncTrackDevice(track);
      const device = await this.trackDevices.get(track.id)?.device;
      // A newer gesture or edit rescheduled the track while the device loaded.
      if (this.trackAutomation.get(track.id) !== state) return;
      state.instrumentType = this.trackDevices.get(track.id)?.type;
      for (const lane of instrumentLanes) {
        if (lane.target.kind === "device") addDeviceLane(device, lane, lane.target.param);
      }
    }
    for (const [device, deviceLaneList] of deviceLanes) {
      device.setAutomation?.(deviceLaneList);
      state.devices.add(device);
    }
  }

  /** The analyser on a track's channel output, or null before the track has played. */
  getTrackAnalyser(trackId: string): AnalyserNode | null {
    return this.trackChains.get(trackId)?.analyser ?? null;
  }

  /**
   * Set the tempo `fable` inserts sync to (tape echo SYNC, LAB glitch and
   * shift divisions). Running units update in place.
   */
  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm === this.fxBpm) return;
    this.fxBpm = bpm;
    for (const state of this.trackDevices.values()) {
      state.ready?.setTempo(bpm, this.beatZeroSec);
    }
    const chains: EffectChainState[] = [this.masterChain, ...this.trackChains.values()];
    for (const chain of chains) {
      for (const unit of chain.units) {
        if (unit.effect.type === "fable") applyFableEffect(unit, unit.effect, bpm);
      }
    }
  }

  /** The running FableSynth stage of a `fable` effect on any track or the master. */
  getFableFx(effectId: string): FableFxHandle | null {
    const chains: EffectChainState[] = [this.masterChain, ...this.trackChains.values()];
    for (const chain of chains) {
      const unit = chain.units.find((u) => u.effect.id === effectId);
      if (unit?.fable) return unit.fable;
    }
    return null;
  }

  /** The analyser on the master channel's output. */
  getMasterAnalyser(): AnalyserNode | null {
    return this.mixAnalyser;
  }

  /**
   * Left and right analysers after a track's panner, or null before the
   * track has a channel. Made on first request, so a graph nobody meters
   * carries no splitter.
   */
  getTrackMeter(trackId: string): StereoMeterTap | null {
    const chain = this.trackChains.get(trackId);
    if (!chain || !this.ctx) return null;
    chain.meter ??= this.createMeterTap(this.ctx, chain.panner);
    return chain.meter;
  }

  /** Left and right analysers after the master fader, or null before the context. */
  getMasterMeter(): StereoMeterTap | null {
    if (!this.ctx || !this.masterFader) return null;
    this.masterMeter ??= this.createMeterTap(this.ctx, this.masterFader);
    return this.masterMeter;
  }

  private createMeterTap(ctx: BaseAudioContext, source: AudioNode): StereoMeterTap {
    const splitter = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser();
    const right = ctx.createAnalyser();
    left.fftSize = METER_FFT_SIZE;
    right.fftSize = METER_FFT_SIZE;
    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    return { left, right, splitter };
  }

  /** The master channel's gain node, the input every track channel feeds. */
  getMixBus(): GainNode | null {
    return this.mixBus;
  }

  /** The live device playing a midi track, once it has been created. */
  getTrackDevice(trackId: string): LiveInstrumentDevice | null {
    return this.trackDevices.get(trackId)?.ready ?? null;
  }

  /**
   * The live device for a midi track, created on demand (the on-screen
   * keyboard needs one before anything has played). Null when the track's
   * instrument plays pre-rendered.
   */
  async ensureTrackDevice(track: TimelineTrack): Promise<LiveInstrumentDevice | null> {
    this.getContext();
    this.getOrCreateTrackChain(track.id);
    this.syncTrackDevice(track);
    return (await this.trackDevices.get(track.id)?.device) ?? null;
  }

  /**
   * Create, replace or update a midi track's live device to match its
   * instrument. `events` preloads an offline render's whole score.
   */
  private syncTrackDevice(track: TimelineTrack, events?: LiveNoteEvent[]): void {
    const instrument = track.instrument;
    const factory = liveDeviceFactory(instrument);
    const current = this.trackDevices.get(track.id);
    if (!factory || !instrument) {
      if (current) this.disposeTrackDevice(track.id);
      return;
    }
    if (current && current.type === instrument.type) {
      current.instrument = instrument;
      current.ready?.setInstrument(instrument);
      return;
    }
    if (current) this.disposeTrackDevice(track.id);
    const ctx = this.getContext();
    const chain = this.getOrCreateTrackChain(track.id);
    const state: TrackDeviceState = {
      type: instrument.type,
      ready: null,
      instrument,
      device: factory(ctx, instrument, { events }).then(
        (device) => {
          if (this.trackDevices.get(track.id) !== state) {
            device.dispose();
            return null;
          }
          device.output.connect(chain.trackGain);
          device.setTempo(this.fxBpm, this.beatZeroSec);
          device.setInstrument(state.instrument);
          state.ready = device;
          return device;
        },
        (error: unknown) => {
          console.error("[AudioGraph] live device failed to start", error);
          return null;
        }
      )
    };
    this.trackDevices.set(track.id, state);
  }

  private disposeTrackDevice(trackId: string): void {
    const state = this.trackDevices.get(trackId);
    if (!state) return;
    this.trackDevices.delete(trackId);
    void state.device.then((device) => device?.dispose());
    for (const [clipId, clipTrackId] of this.liveClips) {
      if (clipTrackId === trackId) this.liveClips.delete(clipId);
    }
  }

  /**
   * Offline export: create every live device with its whole score, before
   * rendering starts. Clips handed to `addClips` afterwards are then skipped
   * for those tracks, since their notes are already queued.
   */
  async preloadLiveDevices(
    tracks: TimelineTrack[],
    clips: TimelineClip[],
    bpm: number
  ): Promise<Set<string>> {
    const preloaded = new Set<string>();
    for (const track of tracks) {
      if (track.type !== "midi" || !liveDeviceFactory(track.instrument)) continue;
      const events = clips
        .filter((clip) => clip.trackId === track.id && clip.mediaType === "midi")
        .flatMap((clip) =>
          midiClipNoteEvents(clip, bpm).map((event) => ({
            timeSec: event.timeMs / 1000,
            pitch: event.pitch,
            velocity: event.velocity,
            on: event.on
          }))
        );
      this.getOrCreateTrackChain(track.id);
      this.syncTrackDevice(track, events);
      await this.trackDevices.get(track.id)?.device;
      for (const clip of clips) {
        if (clip.trackId !== track.id) continue;
        preloaded.add(clip.id);
        this.liveClips.set(clip.id, track.id);
      }
    }
    return preloaded;
  }

  /** Send a live clip's notes from the playhead on to its track's device. */
  private async scheduleLiveClip(
    clip: TimelineClip,
    bpm: number,
    tracks: TimelineTrack[],
    currentTimeInput: number | (() => number),
    globalRate: number,
    shouldCancel?: () => boolean
  ): Promise<void> {
    const track = tracks.find((t) => t.id === clip.trackId);
    if (!track) return;
    this.syncTrackDevice(track);
    const device = await this.trackDevices.get(track.id)?.device;
    if (!device || shouldCancel?.() || this.liveClips.has(clip.id)) return;
    const ctx = this.getContext();
    const currentTimeMs =
      typeof currentTimeInput === "function" ? currentTimeInput() : currentTimeInput;
    const now = ctx.currentTime;
    const g = Math.max(0.0001, globalRate);
    this.beatZeroSec = now - currentTimeMs / 1000 / g;
    device.setTempo(bpm, this.beatZeroSec);
    const events = midiClipNoteEvents(clip, bpm, currentTimeMs).map((event) => ({
      timeSec: now + (event.timeMs - currentTimeMs) / 1000 / g,
      pitch: event.pitch,
      velocity: event.velocity,
      on: event.on
    }));
    this.liveClips.set(clip.id, track.id);
    device.schedule(events, clip.id);
  }

  /**
   * Stop + schedule to exactly match `clips`: any currently-scheduled source
   * whose clip isn't in the list is stopped first, then the new set is
   * decoded and scheduled via `addClips`. Used for a play/seek gesture's
   * initial window, where the caller wants playback to end up matching this
   * set exactly (superseding whatever an older gesture left running).
   */
  async scheduleClips(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    currentTimeMs: number,
    shouldCancel?: () => boolean,
    globalRate = 1
  ): Promise<void> {
    const activeIds = new Set(clips.map((c) => c.clip.id));
    this.stopClips(
      [...this.clipSources.keys(), ...this.liveClips.keys()].filter(
        (id) => !activeIds.has(id)
      )
    );

    await this.addClips(clips, tracks, currentTimeMs, shouldCancel, globalRate);
    if (shouldCancel?.()) return;
    await this.startAutomation(tracks, currentTimeMs, globalRate);
  }

  /**
   * Stop and release the sources of named clips, leaving every other clip
   * playing. This is how a clip whose audio changed mid-playback (a midi clip
   * whose notes, instrument or tempo were edited) is taken out before being
   * re-added with its new render.
   */
  stopClips(clipIds: Iterable<string>): void {
    for (const id of clipIds) {
      const liveTrackId = this.liveClips.get(id);
      if (liveTrackId !== undefined) {
        this.liveClips.delete(id);
        this.trackDevices.get(liveTrackId)?.ready?.clear(id);
        continue;
      }
      const sources = this.clipSources.get(id);
      if (!sources) continue;
      this.releaseClip(
        sources,
        this.clipGains.get(id),
        this.clipEffectChains.get(id)
      );
      this.clipSources.delete(id);
      this.clipGains.delete(id);
      this.clipEffectChains.delete(id);
    }
  }

  /**
   * Let an ended clip's effect tail ring out, or (when playback stops) ramp
   * the chain to silence, then disconnect it. The offline export keeps its
   * chains connected: rendering runs faster than the wall clock, so a timer
   * would cut a tail the mixdown has not reached yet.
   */
  private releaseEffectChain(chain: ClipEffectChain, letRing: boolean): void {
    if (!(this.ctx instanceof AudioContext)) {
      return;
    }
    if (letRing) {
      this.ringingChains.add(chain);
      setTimeout(() => {
        if (this.ringingChains.delete(chain)) {
          disconnectNodes(chain.nodes);
        }
      }, chain.tailSec * 1000 + DECLICK_RELEASE_MS);
      return;
    }
    this.ringingChains.delete(chain);
    const now = this.ctx.currentTime;
    try {
      rampToSilence(chain.output.gain, now, now + DECLICK_SEC);
    } catch {
      /* the chain is already released */
    }
    setTimeout(() => disconnectNodes(chain.nodes), DECLICK_RELEASE_MS);
  }

  /** Silence every tail still ringing from a clip that already ended. */
  private silenceRingingChains(): void {
    for (const chain of [...this.ringingChains]) {
      this.releaseEffectChain(chain, false);
    }
  }

  /**
   * Fade a clip out over {@link DECLICK_SEC}, stop its sources at the end of
   * the ramp, then disconnect them and its gain — a streamed segment
   * included, whose element node and gate would otherwise stay attached.
   */
  private releaseClip(
    sources: PlayingSource[],
    gain: GainNode | undefined,
    chain?: ClipEffectChain,
    letRing = false
  ): void {
    const now = this.ctx?.currentTime ?? 0;
    const endAt = now + DECLICK_SEC;
    if (chain) {
      this.releaseEffectChain(chain, letRing);
    }
    if (gain) {
      try {
        rampToSilence(gain.gain, now, endAt);
      } catch {
        /* the gain is already released */
      }
    }
    for (const src of sources) {
      try {
        src.stop(endAt);
      } catch {
        // source may already have stopped at its natural end
      }
    }
    setTimeout(() => {
      for (const src of sources) {
        try {
          src.disconnect();
        } catch {
          /* not connected */
        }
      }
      try {
        gain?.disconnect();
      } catch {
        /* not connected */
      }
    }, DECLICK_RELEASE_MS);
  }

  /**
   * Decode + schedule the subset of `clips` not already playing, without
   * stopping any other currently-scheduled source. This is the primitive
   * `scheduleClips` builds on; windowed audio top-up calls it directly so
   * bringing newly-in-range clips in never disturbs sources already playing
   * from an earlier `scheduleClips`/`addClips` call.
   */
  async addClips(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    currentTimeInput: number | (() => number),
    shouldCancel?: () => boolean,
    globalRate = 1
  ): Promise<void> {
    const ctx = this.getContext();
    const live = clips.filter(
      (scheduled): scheduled is Extract<ScheduledAudioClip, { live: { bpm: number } }> =>
        "live" in scheduled && scheduled.live !== undefined
    );
    if (live.length > 0) {
      this.updateTracks(tracks);
      await Promise.all(
        live.map((scheduled) =>
          this.scheduleLiveClip(
            scheduled.clip,
            scheduled.live.bpm,
            tracks,
            currentTimeInput,
            globalRate,
            shouldCancel
          )
        )
      );
    }
    const pcmClips = clips.filter(
      (scheduled): scheduled is PcmScheduledClip => !("live" in scheduled && scheduled.live)
    );
    // Global timeline speed (1 = normal). One wall-clock second covers
    // `g` timeline seconds, so every wall-clock duration below (lead,
    // remaining, fades) is divided by `g`, and the source's playbackRate is
    // multiplied by it. Source-space offsets/durations are unaffected — a
    // faster timeline reads the same buffer span, just quicker.
    const g = Math.max(0.0001, globalRate);
    this.updateTracks(tracks);
    // Only a live AudioContext can play a media element; the offline export
    // context always decodes.
    const streamingAvailable =
      typeof (ctx as Partial<AudioContext>).createMediaElementSource ===
      "function";

    const bufferPromises = pcmClips.map(
      async (
        scheduled
      ): Promise<{
        clipId: string;
        buffer: AudioBuffer | null;
        windowed: boolean;
        streamUrl?: string;
      }> => {
        const { clip } = scheduled;
        if (this.clipSources.has(clip.id)) {
          return { clipId: clip.id, buffer: null, windowed: false };
        }
        // A caller-supplied buffer is the clip's audio; nothing is fetched.
        if (scheduled.buffer) {
          return { clipId: clip.id, buffer: scheduled.buffer, windowed: true };
        }
        if (!clip.currentAssetId) {
          return { clipId: clip.id, buffer: null, windowed: false };
        }
        // A large file streams: nothing is fetched or decoded up front.
        if (
          streamingAvailable &&
          prefersStreamedPlayback(
            scheduled.assetSize,
            scheduled.assetDurationSec
          )
        ) {
          return {
            clipId: clip.id,
            buffer: null,
            windowed: false,
            streamUrl: scheduled.assetUrl
          };
        }
        const buffer = await this.loadBuffer(
          clip.currentAssetId,
          scheduled.assetUrl
        );
        return { clipId: clip.id, buffer, windowed: false };
      }
    );

    const loadedBuffers = await Promise.all(bufferPromises);
    // A newer play/pause/seek gesture superseded this call while buffers were
    // loading — registering now would schedule audio at a stale offset.
    if (shouldCancel?.()) {
      return;
    }
    const bufferMap = new Map(loadedBuffers.map((b) => [b.clipId, b]));
    // The playhead moves while buffers fetch and decode, and `now` below is
    // read after them. A reader is sampled here, beside `now`, so the position
    // and the audio clock describe the same instant.
    const currentTimeMs =
      typeof currentTimeInput === "function"
        ? currentTimeInput()
        : currentTimeInput;

    for (const { clip } of pcmClips) {
      if (this.clipSources.has(clip.id)) {
        continue;
      }

      const loaded = bufferMap.get(clip.id);
      const buffer = loaded?.buffer ?? null;
      const streamUrl = loaded?.streamUrl;
      if (!loaded || (!buffer && !streamUrl)) {
        continue;
      }

      // The clip's source position as constant-rate stretches. Without a
      // `timeRemap` that is one stretch carrying the clip's own rate (a baked
      // speed reads as 1:1, the asset already playing at the right speed) and
      // its in-point, so an ordinary clip is scheduled exactly as before.
      //
      // A caller-supplied buffer is already the clip's window: its first
      // sample is the clip's in-point. Reading `inPointMs` again would seek
      // that far into a buffer that no longer contains it — on a clip split
      // at its midpoint, past the end of the right half's buffer.
      const segments = loaded.windowed
        ? windowSegments(clip)
        : timeRemapAudioSegments(clip);

      const volumeLinear = clip.volumeDb
        ? Math.pow(10, clip.volumeDb / 20)
        : 1;
      const clipGain = ctx.createGain();
      clipGain.gain.value = volumeLinear;

      const now = ctx.currentTime;
      // Schedule each stretch's start on the audio clock. If it begins in the
      // future (relative to the playhead), defer src.start; otherwise start
      // immediately with a buffer offset for mid-clip seeks.
      //
      // `src.start(when, offset, duration)` takes offset/duration in
      // *buffer* seconds, while a segment's bounds are *timeline*
      // milliseconds. With playbackRate = r, 1 timeline second consumes r
      // buffer seconds, so we multiply by the segment's own rate.
      const clipLeadSec = Math.max(0, (clip.startMs - currentTimeMs) / 1000) / g;
      const remainingTimelineMs =
        clip.startMs + clip.durationMs - Math.max(currentTimeMs, clip.startMs);
      const remainingTimelineSec = Math.max(0, remainingTimelineMs / 1000);
      const startAt = now + clipLeadSec;
      // Wall-clock time at which playback ends — used to schedule fade-out.
      // The clip spans `remainingTimelineSec` timeline seconds, played back in
      // `remainingTimelineSec / g` wall-clock seconds at global rate `g`.
      const remainingWallSec = remainingTimelineSec / g;
      const clipEndAt = startAt + remainingWallSec;

      // Fades run along the clip's authored curve, clamped so two that would
      // cross meet in the middle instead — the same resolution the overlay in
      // the tracks region draws and the ffmpeg export renders.
      const fades = resolveClipFades(clip, clip.durationMs);

      // Where the fade-in's automation ends, computed once as `start +
      // duration` the way WebAudio computes it. The fade-out may not begin
      // before it: derived separately, two fades that meet can round one ulp
      // apart and overlap, which silences the first ramp or, for two value
      // curves, throws NotSupportedError.
      let fadeInEndAt = startAt;
      if (fades.fadeInMs > 0) {
        const fadeEndMs = clip.startMs + fades.fadeInMs;
        if (currentTimeMs < fadeEndMs) {
          // Seeking into a running fade resumes the curve at the progress
          // already covered rather than restarting it from silence.
          const offsetInFadeMs = Math.max(0, currentTimeMs - clip.startMs);
          const remainingSec =
            (fadeEndMs - Math.max(currentTimeMs, clip.startMs)) / 1000 / g;
          fadeInEndAt = startAt + remainingSec;
          rampAlongFade(
            clipGain.gain,
            fades.fadeInShape,
            offsetInFadeMs / fades.fadeInMs,
            1,
            volumeLinear,
            startAt,
            remainingSec
          );
        } else {
          clipGain.gain.setValueAtTime(volumeLinear, startAt);
        }
      }

      if (fades.fadeOutMs > 0) {
        const fadeSec = fades.fadeOutMs / 1000 / g;
        const fadeOutStartAt = Math.max(fadeInEndAt, clipEndAt - fadeSec);
        if (fadeOutStartAt < clipEndAt) {
          // A fade-out reads its curve backwards: full volume at the top of
          // the ramp down to silence at the clip's end. Playback starting
          // inside it resumes at the level the fade has already reached.
          const elapsedSec = Math.max(0, fadeOutStartAt - (clipEndAt - fadeSec));
          rampAlongFade(
            clipGain.gain,
            fades.fadeOutShape,
            Math.max(0, 1 - elapsedSec / fadeSec),
            0,
            volumeLinear,
            fadeOutStartAt,
            clipEndAt - fadeOutStartAt
          );
        }
      }

      const trackGain = this.getTrackGain(clip.trackId);
      // Clip effects run after the volume and fades, so a fade-out shapes the
      // dry sound and an echo or reverb tail decays on its own past it.
      const effectChain = buildClipEffectChain(ctx, clip.audioEffects);
      if (effectChain) {
        clipGain.connect(effectChain.input);
        effectChain.output.connect(trackGain);
      } else {
        clipGain.connect(trackGain);
      }

      const sources: PlayingSource[] = [];
      for (const segment of segments) {
        // WebAudio cannot play a buffer backwards: `playbackRate` takes no
        // useful negative value and there is no reverse source node, so a
        // stretch whose source runs backwards — or holds still — is silent.
        // Sounding it would mean decoding a mirrored copy of the buffer.
        if (segment.reverse) continue;
        const segRemainingMs =
          segment.timelineEndMs -
          Math.max(currentTimeMs, segment.timelineStartMs);
        if (segRemainingMs <= 0) continue;
        const intoSegmentSec =
          Math.max(0, currentTimeMs - segment.timelineStartMs) / 1000;
        const segLeadSec =
          Math.max(0, (segment.timelineStartMs - currentTimeMs) / 1000) / g;

        const offsetSec =
          segment.sourceStartMs / 1000 + intoSegmentSec * segment.rate;
        if (streamUrl) {
          sources.push(
            this.streamSegment(
              ctx as AudioContext,
              streamUrl,
              clipGain,
              now + segLeadSec,
              now + segLeadSec + segRemainingMs / 1000 / g,
              offsetSec,
              segment.rate * g
            )
          );
          continue;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = segment.rate * g;
        src.connect(clipGain);
        src.start(
          now + segLeadSec,
          offsetSec,
          (segRemainingMs / 1000) * segment.rate
        );
        sources.push(src);
      }

      // Once every source has played out, release the clip so its buffer is
      // not held until the next pause or seek. A source that ends after the
      // clip was stopped or replaced finds other sources registered and
      // leaves them alone.
      let playingCount = sources.length;
      const onSourceEnded = (): void => {
        playingCount -= 1;
        if (playingCount > 0 || this.clipSources.get(clip.id) !== sources) {
          return;
        }
        this.clipSources.delete(clip.id);
        this.clipGains.delete(clip.id);
        this.clipEffectChains.delete(clip.id);
        this.releaseClip(sources, clipGain, effectChain ?? undefined, true);
      };
      for (const src of sources) src.onended = onSourceEnded;

      this.clipSources.set(clip.id, sources);
      this.clipGains.set(clip.id, clipGain);
      if (effectChain) {
        this.clipEffectChains.set(clip.id, effectChain);
      }
    }
  }

  /**
   * Play one stretch of `url` through a media element into `clipGain`, heard
   * from `startAt` to `endAt` on the audio clock, starting `offsetSec` into
   * the file at `rate`.
   */
  private streamSegment(
    ctx: AudioContext,
    url: string,
    clipGain: GainNode,
    startAt: number,
    endAt: number,
    offsetSec: number,
    rate: number
  ): StreamedSegment {
    const element = this.createMediaElement();
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    // A buffer source changes pitch with its rate; match it.
    element.preservesPitch = false;
    element.src = url;
    const clamped = Math.min(
      MEDIA_ELEMENT_MAX_RATE,
      Math.max(MEDIA_ELEMENT_MIN_RATE, rate)
    );
    element.defaultPlaybackRate = clamped;
    element.playbackRate = clamped;
    const node = ctx.createMediaElementSource(element);
    const gate = ctx.createGain();
    node.connect(gate);
    gate.connect(clipGain);
    const segment = new StreamedSegment(element, node, gate);
    segment.schedule(ctx, startAt, endAt, offsetSec, clamped);
    return segment;
  }

  /**
   * Start a scrub grain: the mix of `clips` at `atMs`, faded in on the master
   * gain along a raised cosine, so a grain that starts mid-waveform does not
   * click. The caller fades it out with {@link releaseGrain}, then stops it
   * with {@link stopAll}. A streamed clip plays through a scrub element that
   * later grains reuse.
   */
  async playGrain(
    clips: ScheduledAudioClip[],
    tracks: TimelineTrack[],
    atMs: number,
    shouldCancel?: () => boolean
  ): Promise<void> {
    const ctx = this.getContext();
    if (typeof AudioContext !== "undefined" && ctx instanceof AudioContext) {
      await ctx.resume();
    }
    if (shouldCancel?.()) return;
    this.stopAll();
    const streamingAvailable =
      typeof (ctx as Partial<AudioContext>).createMediaElementSource ===
      "function";
    const decoded: ScheduledAudioClip[] = [];
    const streamed: Array<{ clip: TimelineClip; url: string }> = [];
    for (const scheduled of clips) {
      if (
        streamingAvailable &&
        scheduled.assetUrl !== undefined &&
        prefersStreamedPlayback(scheduled.assetSize, scheduled.assetDurationSec)
      ) {
        streamed.push({ clip: scheduled.clip, url: scheduled.assetUrl });
      } else {
        decoded.push(scheduled);
      }
    }
    await this.addClips(decoded, tracks, atMs, shouldCancel);
    if (shouldCancel?.()) return;
    for (const { clip, url } of streamed) {
      this.playStreamedGrain(ctx as AudioContext, clip, url, atMs);
    }
    const master = this.masterGain?.gain;
    if (!master) return;
    const now = ctx.currentTime;
    master.cancelScheduledValues(now);
    master.setValueCurveAtTime(
      raisedCosineCurve(0, this.masterVolume),
      now,
      GRAIN_ATTACK_SEC
    );
  }

  /** Fade the sounding grain out along a raised cosine over `fadeSec`. */
  releaseGrain(fadeSec: number): void {
    const ctx = this.ctx;
    const master = this.masterGain?.gain;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.cancelScheduledValues(now);
    master.setValueCurveAtTime(
      raisedCosineCurve(this.masterVolume, 0),
      now,
      fadeSec
    );
  }

  /**
   * Seek the clip's scrub element to its source position at `atMs` and play
   * it through the clip volume and the track chain. Clip fades and clip
   * effects are left out of a streamed grain.
   */
  private playStreamedGrain(
    ctx: AudioContext,
    clip: TimelineClip,
    url: string,
    atMs: number
  ): void {
    const segment = timeRemapAudioSegments(clip).find(
      (s) =>
        !s.reverse && s.timelineStartMs <= atMs && atMs < s.timelineEndMs
    );
    if (!segment) return;
    let voice = this.scrubVoices.get(clip.id);
    if (voice && voice.url !== url) {
      this.releaseScrubVoice(clip.id);
      voice = undefined;
    }
    if (!voice) {
      const element = this.createMediaElement();
      element.crossOrigin = "anonymous";
      element.preload = "auto";
      element.preservesPitch = false;
      element.src = url;
      const node = ctx.createMediaElementSource(element);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain);
      voice = { url, element, node, gain, trackId: null, grain: 0 };
      this.scrubVoices.set(clip.id, voice);
    }
    if (voice.trackId !== clip.trackId) {
      try {
        voice.gain.disconnect();
      } catch {
        /* not connected yet */
      }
      voice.gain.connect(this.getTrackGain(clip.trackId));
      voice.trackId = clip.trackId;
    }
    voice.grain += 1;
    const grain = voice.grain;
    const rate = Math.min(
      MEDIA_ELEMENT_MAX_RATE,
      Math.max(MEDIA_ELEMENT_MIN_RATE, segment.rate)
    );
    const volume = clip.volumeDb ? Math.pow(10, clip.volumeDb / 20) : 1;
    const gain = voice.gain.gain;
    holdParam(gain, ctx.currentTime);
    gain.setValueAtTime(0, ctx.currentTime);
    // The element sounds only once its seek completes. Opening the gain at
    // once would let the first samples after the seek start at full volume.
    const open = (): void => {
      if (voice.grain !== grain) return;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueCurveAtTime(
        raisedCosineCurve(0, volume),
        now,
        GRAIN_ATTACK_SEC
      );
    };
    const element = voice.element;
    element.addEventListener("seeked", open, { once: true });
    element.playbackRate = rate;
    element.currentTime =
      segment.sourceStartMs / 1000 +
      ((atMs - segment.timelineStartMs) / 1000) * segment.rate;
    void element.play().catch(() => {
      // A stop that races the start: the grain stays silent.
    });
  }

  /** Ramp every scrub element to silence, then pause it. */
  private silenceScrubVoices(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const voice of this.scrubVoices.values()) {
      try {
        rampToSilence(voice.gain.gain, now, now + DECLICK_SEC);
      } catch {
        /* the gain is already released */
      }
      const grain = voice.grain;
      setTimeout(() => {
        if (voice.grain === grain) voice.element.pause();
      }, DECLICK_RELEASE_MS);
    }
  }

  private releaseScrubVoice(clipId: string): void {
    const voice = this.scrubVoices.get(clipId);
    if (!voice) return;
    this.scrubVoices.delete(clipId);
    voice.element.pause();
    voice.element.removeAttribute("src");
    voice.element.load();
    try {
      voice.node.disconnect();
      voice.gain.disconnect();
    } catch {
      /* not connected */
    }
  }

  stopAll(): void {
    this.stopAutomation();
    this.liveClips.clear();
    for (const state of this.trackDevices.values()) state.ready?.clear();
    for (const [id, sources] of this.clipSources) {
      this.releaseClip(
        sources,
        this.clipGains.get(id),
        this.clipEffectChains.get(id)
      );
    }
    this.clipSources.clear();
    this.clipGains.clear();
    this.clipEffectChains.clear();
    this.silenceRingingChains();
    this.silenceScrubVoices();
    // A released grain leaves the master at silence. Restore it once the
    // sources above have ramped out, so playback starts at full volume.
    const ctx = this.ctx;
    const master = this.masterGain?.gain;
    if (ctx && master) {
      const now = ctx.currentTime;
      holdParam(master, now);
      master.setValueAtTime(this.masterVolume, now + DECLICK_SEC * 2);
    }
  }

  /**
   * Suspend once the clips {@link stopAll} just released have ramped out:
   * suspending at once would freeze the output mid-waveform. Any use of the
   * context before then (a play that follows at once) cancels it.
   */
  suspend(): void {
    const ctx = this.ctx;
    if (!(ctx instanceof AudioContext)) return;
    const use = this.contextUse;
    setTimeout(() => {
      if (this.contextUse === use && this.ctx === ctx) void ctx.suspend();
    }, DECLICK_RELEASE_MS);
  }

  resume(): void {
    this.contextUse += 1;
    if (this.ctx instanceof AudioContext) void this.ctx.resume();
  }

  dispose(): void {
    this.stopAll();
    for (const clipId of [...this.scrubVoices.keys()]) {
      this.releaseScrubVoice(clipId);
    }
    for (const trackId of [...this.trackDevices.keys()]) {
      this.disposeTrackDevice(trackId);
    }
    for (const chain of this.trackChains.values()) {
      disconnectNodes([chain.trackGain, chain.fader, chain.panner]);
      if (chain.meter) disconnectNodes([chain.meter.splitter]);
      for (const unit of chain.units) releaseEffectUnit(unit);
    }
    this.trackChains.clear();
    this.masterChain.units.forEach(releaseEffectUnit);
    this.masterChain = { effects: [], units: [] };
    if (this.ctx instanceof AudioContext) void this.ctx.close();
    this.ctx = null;
    this.masterGain = null;
    this.mixBus = null;
    this.masterFader = null;
    this.mixAnalyser = null;
    this.masterMeter = null;
  }
}
