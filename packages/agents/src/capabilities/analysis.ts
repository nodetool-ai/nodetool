/**
 * The `analysis` capability module — measuring media instead of generating it.
 *
 * `understand_video` asks a model what a clip is about; these answer what it
 * *is*. Duration, sample rate, resolution and frame rate, but also where the
 * energy sits over time, what frequencies are in it, where the silences and
 * onsets are, how the picture moves, and where the cuts fall. A model cannot
 * derive any of that from watching, and until now an agent could only get at
 * it by shelling out to `ffprobe` and parsing text, or by authoring a workflow
 * around `nodetool.audio.GetAudioInfo` — which reports four fields and needs
 * the file to be a WAV to report duration at all.
 *
 * Decoding is Mediabunny's, so none of this needs ffmpeg on the host. That is
 * the difference between a capability an agent can rely on and one that
 * returns zeros when a managed runtime tool was never installed.
 *
 * The math is in `../analysis/`: `audio-dsp.ts` and `video-frames.ts` are pure
 * functions over samples and pixels, tested against signals whose answers are
 * known analytically. This file resolves the media, chooses the analysis
 * parameters, and shapes the answer.
 *
 * Every answer is bounded. A model asking about a feature film should get a
 * few hundred numbers describing it, not a hundred thousand — series are
 * decimated to a point budget, decoding stops at a duration cap, and both say
 * so in the result rather than silently returning part of the truth.
 */

import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import {
  amplitudeToDb,
  bandEnergies,
  detectOnsets,
  energyFrames,
  estimateTempo,
  floorPowerOfTwo,
  hannWindow,
  invertSegments,
  magnitudeSpectrum,
  measureLoudness,
  peakSummary,
  round,
  silenceSegments,
  spectralFeatures,
  spectralFlux,
  toMono,
  toPlanar,
  type AudioSegment
} from "../analysis/audio-dsp.js";
import {
  decodeAudio,
  forEachVideoFrame,
  probeContainer,
  sampleTimestamps,
  type ContainerInfo,
  type DecodedAudio
} from "../analysis/media-decode.js";
import {
  detectCuts,
  dominantColors,
  downscaleLuma,
  frameStats,
  frameTransitions,
  lumaHistogram,
  runsOf,
  shotsFromCuts,
  type AnalyzedFrame
} from "../analysis/video-frames.js";
import { filesystemPathForUri } from "../sandbox-media-ref.js";
import { isNonBlankString } from "../utils/type-guards.js";
import {
  analysisSpecs,
  analyzeAudioSpec,
  analyzeAudioSpectrumSpec,
  analyzeVideoSpec,
  detectAudioEventsSpec,
  detectVideoScenesSpec,
  DEFAULT_CUT_THRESHOLD,
  DEFAULT_MIN_SILENCE,
  DEFAULT_SAMPLE_FPS,
  DEFAULT_SCENE_SAMPLE_FPS,
  DEFAULT_SILENCE_DB,
  MAX_ENERGY_POINTS,
  MAX_EVENTS,
  MAX_SPECTRUM_POINTS,
  MAX_VIDEO_FRAMES
} from "./analysis.specs.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";

type ToolError = { error: string };

/** Seconds of media one call decodes when the caller names no cap. */
const DEFAULT_MAX_SECONDS = 600;

/** Largest media file an analysis call will read. */
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;

/** A number the caller may have supplied, clamped into a usable range. */
function clamp(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** `-Infinity` is not a measurement; JSON says so with null. */
function finiteOrNull(value: number, digits = 2): number | null {
  return Number.isFinite(value) ? round(value, digits) : null;
}

/**
 * Resolve the caller's media reference to bytes.
 *
 * The accepted forms are `read_media_bytes`'s, for the same reason: a model
 * that just generated something holds an `asset://` URI or a bare asset id,
 * and making it convert one into the other is a wasted round trip. A
 * filesystem path is refused rather than contained — `read_file` is the gated
 * way to a workspace file, and a second containment rule beside
 * `resolveGuestPath` is the thing worth not having.
 */
async function loadMedia(
  run: CapabilityRun,
  raw: unknown,
  field: string
): Promise<Uint8Array | ToolError> {
  if (!isNonBlankString(raw)) {
    return { error: `${field} is required and must be a non-empty string.` };
  }
  const trimmed = raw.trim();
  if (filesystemPathForUri(trimmed) !== null) {
    return {
      error:
        `${field} does not take filesystem paths (${trimmed}). Pass an ` +
        `asset:// URI, an asset id, a /api/storage/ key, a URL, or a data: URI.`
    };
  }
  const ref = trimmed.includes("://")
    ? { uri: trimmed }
    : { uri: trimmed, asset_id: trimmed };
  let bytes: Uint8Array | null;
  try {
    bytes = await loadMediaRefBytes(ref, run.context);
  } catch (error) {
    return {
      error: `Could not read ${trimmed}: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
  if (!bytes || bytes.byteLength === 0) {
    return {
      error:
        `${trimmed} resolved to no bytes. Pass the asset:// URI a ` +
        `generation returned, or use list_assets to find one.`
    };
  }
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return {
      error: `${trimmed} is ${bytes.byteLength} bytes, over the ${MAX_MEDIA_BYTES}-byte analysis limit.`
    };
  }
  return bytes;
}

const isError = (value: unknown): value is ToolError =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ToolError).error === "string";

/**
 * Decimate a series to at most `budget` points by keeping the entry each
 * bucket is best represented by.
 *
 * Averaging would be wrong here: the question an envelope answers is "where is
 * it loud", and averaging a peak with its neighbours hides the peak. `pick`
 * chooses which member of a bucket survives — the loudest frame, the busiest
 * transition — so a decimated series still shows the extremes at roughly the
 * right time.
 */
function decimate<T>(
  series: readonly T[],
  budget: number,
  pick: (a: T, b: T) => T
): T[] {
  if (budget <= 0) return [];
  if (series.length <= budget) return [...series];
  const bucketSize = series.length / budget;
  const out: T[] = [];
  for (let index = 0; index < budget; index += 1) {
    const from = Math.floor(index * bucketSize);
    const to = Math.min(series.length, Math.floor((index + 1) * bucketSize));
    let best = series[from];
    for (let n = from + 1; n < to; n += 1) best = pick(best, series[n]);
    out.push(best);
  }
  return out;
}

/** Trim a list to the answer's event budget, saying how many were dropped. */
function capped<T>(items: readonly T[]): { items: T[]; truncated: boolean } {
  return items.length <= MAX_EVENTS
    ? { items: [...items], truncated: false }
    : { items: items.slice(0, MAX_EVENTS), truncated: true };
}

/** Decode audio out of a file, reporting the two ways it can have none. */
async function loadAudio(
  run: CapabilityRun,
  params: Record<string, unknown>,
  field: string
): Promise<{ audio: DecodedAudio; bytes: Uint8Array } | ToolError> {
  const bytes = await loadMedia(run, params[field], field);
  if (isError(bytes)) return bytes;
  const maxSeconds = clamp(params["max_seconds"], DEFAULT_MAX_SECONDS, 1, 3600);
  let audio: DecodedAudio | null;
  try {
    audio = await decodeAudio(bytes, maxSeconds);
  } catch (error) {
    return {
      error: `Could not decode the audio: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
  if (!audio) {
    return { error: "That file has no audio track." };
  }
  if (audio.samples.length === 0) {
    return { error: "That file's audio track decoded to no samples." };
  }
  return { audio, bytes };
}

/** How the answer reports what it decoded and whether it saw all of it. */
function audioSource(audio: DecodedAudio): Record<string, unknown> {
  return {
    duration: round(audio.trackDuration),
    analyzed_duration: round(audio.duration),
    sample_rate: audio.sampleRate,
    channels: audio.channels,
    codec: audio.codec,
    truncated: audio.truncated
  };
}

// ---------------------------------------------------------------------------
// analyze_audio
// ---------------------------------------------------------------------------

const analyzeAudio: CapabilityExport = {
  spec: analyzeAudioSpec,
  impl: async (run, params) => {
    const loaded = await loadAudio(run, params, "audio");
    if (isError(loaded)) return loaded;
    const { audio } = loaded;

    const mono = toMono(audio.samples, audio.channels);
    const frameMs = clamp(params["frame_ms"], 50, 5, 1000);
    const frameSamples = Math.max(
      1,
      Math.round((frameMs / 1000) * audio.sampleRate)
    );
    const frames = energyFrames(
      mono,
      audio.sampleRate,
      frameSamples,
      frameSamples
    );
    const summary = peakSummary(mono);
    const loudness = measureLoudness(
      toPlanar(audio.samples, audio.channels),
      audio.sampleRate
    );

    const budget = clamp(params["max_points"], 200, 1, MAX_ENERGY_POINTS);
    const envelope = decimate(frames, budget, (a, b) =>
      b.peak > a.peak ? b : a
    ).map((frame) => ({
      time: round(frame.time),
      rms_db: round(amplitudeToDb(frame.rms), 1),
      peak_db: round(amplitudeToDb(frame.peak), 1)
    }));

    const loudest = frames.reduce(
      (best, frame) => (frame.rms > best.rms ? frame : best),
      frames[0]
    );
    const quietest = frames.reduce(
      (best, frame) => (frame.rms < best.rms ? frame : best),
      frames[0]
    );

    return {
      ...audioSource(audio),
      loudness: {
        integrated_lufs: finiteOrNull(loudness.integratedLufs),
        loudness_range_lu: round(loudness.loudnessRangeLu, 2),
        momentary_max_lufs: finiteOrNull(loudness.momentaryMaxLufs),
        short_term_max_lufs: finiteOrNull(loudness.shortTermMaxLufs),
        peak_dbfs: round(amplitudeToDb(summary.peak), 2),
        rms_dbfs: round(amplitudeToDb(summary.rms), 2),
        crest_factor_db: round(summary.crestFactorDb, 2),
        clipped_samples: summary.clippedSamples,
        clipped_fraction: round(
          summary.clippedSamples / Math.max(1, mono.length),
          6
        ),
        dc_offset: round(summary.dcOffset, 5)
      },
      loudest_moment: loudest
        ? { time: round(loudest.time), rms_db: round(amplitudeToDb(loudest.rms), 1) }
        : null,
      quietest_moment: quietest
        ? {
            time: round(quietest.time),
            rms_db: round(amplitudeToDb(quietest.rms), 1)
          }
        : null,
      envelope: {
        frame_ms: round(frameMs, 1),
        points: envelope.length,
        decimated: frames.length > envelope.length,
        series: envelope
      },
      notes: [
        "integrated_lufs is ITU-R BS.1770-4 gated loudness; null means the " +
          "audio is shorter than one 400 ms block or is silent.",
        "peak_dbfs is sample peak, not true peak — an inter-sample overshoot " +
          "can be higher."
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// analyze_audio_spectrum
// ---------------------------------------------------------------------------

const analyzeAudioSpectrum: CapabilityExport = {
  spec: analyzeAudioSpectrumSpec,
  impl: async (run, params) => {
    const loaded = await loadAudio(run, params, "audio");
    if (isError(loaded)) return loaded;
    const { audio } = loaded;

    const mono = toMono(audio.samples, audio.channels);
    const fftSize = floorPowerOfTwo(
      clamp(params["fft_size"], 2048, 256, 16384)
    );
    if (mono.length < fftSize) {
      return {
        error: `That audio is ${mono.length} samples, shorter than the ${fftSize}-sample analysis window. Pass a smaller fft_size.`
      };
    }
    const window = hannWindow(fftSize);
    const hop = fftSize / 2;
    const frameCount = Math.floor((mono.length - fftSize) / hop) + 1;

    // One running sum instead of a per-frame spectrum array: the average
    // spectrum is what the band split and the dominant frequency are read
    // from, and holding every frame's bins would be the largest allocation in
    // the call for no gain.
    const average = new Float32Array(fftSize / 2 + 1);
    const series: {
      time: number;
      centroid_hz: number;
      rolloff_hz: number;
      flatness: number;
      bandwidth_hz: number;
      peak_hz: number;
      energy: number;
    }[] = [];
    let previous: Float32Array | null = null;
    const flux: number[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const offset = index * hop;
      const magnitude = magnitudeSpectrum(mono, offset, window);
      for (let bin = 0; bin < average.length; bin += 1) {
        average[bin] += magnitude[bin] ?? 0;
      }
      const features = spectralFeatures(magnitude, audio.sampleRate, fftSize);
      series.push({
        time: offset / audio.sampleRate,
        centroid_hz: features.centroidHz,
        rolloff_hz: features.rolloffHz,
        flatness: features.flatness,
        bandwidth_hz: features.bandwidthHz,
        peak_hz: features.peakHz,
        energy: features.energy
      });
      if (previous) flux.push(spectralFlux(magnitude, previous));
      previous = magnitude;
    }
    for (let bin = 0; bin < average.length; bin += 1) {
      average[bin] /= Math.max(1, frameCount);
    }

    const bands = bandEnergies(average, audio.sampleRate, fftSize);
    const bandTotal = bands.reduce((sum, entry) => sum + entry.energy, 0);
    const overall = spectralFeatures(average, audio.sampleRate, fftSize);

    const budget = clamp(params["max_points"], 120, 0, MAX_SPECTRUM_POINTS);
    const points = decimate(series, budget, (a, b) =>
      b.energy > a.energy ? b : a
    ).map((point) => ({
      time: round(point.time),
      centroid_hz: round(point.centroid_hz, 1),
      rolloff_hz: round(point.rolloff_hz, 1),
      flatness: round(point.flatness, 4),
      bandwidth_hz: round(point.bandwidth_hz, 1),
      peak_hz: round(point.peak_hz, 1)
    }));

    /** The energy-weighted mean of one feature across every analysed frame. */
    const weightedMean = (read: (point: (typeof series)[number]) => number): number => {
      const total = series.reduce((sum, point) => sum + point.energy, 0);
      if (total <= 0) return 0;
      return (
        series.reduce((sum, point) => sum + read(point) * point.energy, 0) /
        total
      );
    };

    return {
      ...audioSource(audio),
      fft_size: fftSize,
      bin_hz: round(audio.sampleRate / fftSize, 3),
      frames_analyzed: frameCount,
      dominant_frequency_hz: round(overall.peakHz, 1),
      spectral: {
        centroid_hz: round(weightedMean((point) => point.centroid_hz), 1),
        rolloff_85_hz: round(weightedMean((point) => point.rolloff_hz), 1),
        flatness: round(weightedMean((point) => point.flatness), 4),
        bandwidth_hz: round(weightedMean((point) => point.bandwidth_hz), 1)
      },
      bands: bands.map((entry) => ({
        name: entry.band.name,
        low_hz: entry.band.lowHz,
        high_hz: Number.isFinite(entry.band.highHz)
          ? entry.band.highHz
          : round(audio.sampleRate / 2, 0),
        energy_share: round(
          bandTotal > 0 ? entry.energy / bandTotal : 0,
          4
        ),
        level_db: round(amplitudeToDb(entry.energy), 1)
      })),
      series: points,
      notes: [
        "energy_share is each band's fraction of the summed magnitude — the " +
          "bands' shares add to 1, they are not absolute levels.",
        "flatness runs 0 (a pure tone) to 1 (white noise)."
      ],
      spectral_flux_frames: flux.length
    };
  }
};

// ---------------------------------------------------------------------------
// detect_audio_events
// ---------------------------------------------------------------------------

/** Round a segment list for the wire. */
function wireSegments(segments: readonly AudioSegment[]): Record<string, number>[] {
  return segments.map((segment) => ({
    start: round(segment.start),
    end: round(segment.end),
    duration: round(segment.duration)
  }));
}

const detectAudioEvents: CapabilityExport = {
  spec: detectAudioEventsSpec,
  impl: async (run, params) => {
    const loaded = await loadAudio(run, params, "audio");
    if (isError(loaded)) return loaded;
    const { audio } = loaded;

    const mono = toMono(audio.samples, audio.channels);
    const frameSamples = Math.max(
      1,
      Math.round(0.02 * audio.sampleRate)
    );
    const frames = energyFrames(
      mono,
      audio.sampleRate,
      frameSamples,
      frameSamples
    );
    const frameDuration = frameSamples / audio.sampleRate;

    const thresholdDb = clamp(params["silence_db"], DEFAULT_SILENCE_DB, -100, 0);
    const minSilence = clamp(
      params["min_silence_seconds"],
      DEFAULT_MIN_SILENCE,
      0.01,
      60
    );
    const silence = silenceSegments(
      frames,
      thresholdDb,
      minSilence,
      frameDuration
    );
    const sounding = invertSegments(silence, audio.duration);

    // Onsets come off a spectral-flux curve rather than the energy envelope: a
    // new note at the same level as the one before it moves the spectrum and
    // not the RMS, so an energy-only detector misses legato entirely.
    const fftSize = 1024;
    const window = hannWindow(fftSize);
    const hop = fftSize / 4;
    const hopSeconds = hop / audio.sampleRate;
    const flux: number[] = [];
    const times: number[] = [];
    let previous: Float32Array | null = null;
    for (let offset = 0; offset + fftSize <= mono.length; offset += hop) {
      const magnitude = magnitudeSpectrum(mono, offset, window);
      if (previous) {
        flux.push(spectralFlux(magnitude, previous));
        times.push(offset / audio.sampleRate);
      }
      previous = magnitude;
    }

    const sensitivity = clamp(params["onset_sensitivity"], 1.5, 0.1, 10);
    const onsets = detectOnsets(flux, times, sensitivity);
    const wantTempo = params["detect_tempo"] !== false;
    const tempo = wantTempo
      ? estimateTempo(flux, hopSeconds)
      : { bpm: 0, confidence: 0 };
    // A tempo needs repeated events to be a tempo. Autocorrelating the flux of
    // a steady tone — which is numerical noise around zero — still peaks
    // somewhere, and that peak scores a confident-looking 0.4 for a signal
    // with no beat in it at all. Four onsets is three intervals, the least
    // that can agree about a period.
    const MIN_TEMPO_ONSETS = 4;

    const cappedSilence = capped(silence);
    const cappedSounding = capped(sounding);
    const cappedOnsets = capped(onsets);

    return {
      ...audioSource(audio),
      silence: {
        threshold_db: round(thresholdDb, 1),
        min_duration: round(minSilence, 3),
        total_duration: round(
          silence.reduce((sum, segment) => sum + segment.duration, 0)
        ),
        count: silence.length,
        truncated: cappedSilence.truncated,
        segments: wireSegments(cappedSilence.items)
      },
      sounding: {
        count: sounding.length,
        truncated: cappedSounding.truncated,
        segments: wireSegments(cappedSounding.items)
      },
      onsets: {
        count: onsets.length,
        truncated: cappedOnsets.truncated,
        times: cappedOnsets.items.map((time) => round(time))
      },
      tempo: wantTempo
        ? {
            bpm: round(tempo.bpm, 1),
            confidence: round(tempo.confidence, 3),
            // Naming the floor beats printing a BPM the caller has no way to
            // judge: speech and ambience both produce a confident-looking
            // number from an autocorrelation that found nothing periodic.
            reliable:
              tempo.confidence >= 0.15 &&
              tempo.bpm > 0 &&
              onsets.length >= MIN_TEMPO_ONSETS
          }
        : null,
      notes: [
        "silence is measured on the mono downmix's RMS over 20 ms windows.",
        "tempo.reliable false means the material is not rhythmic enough for " +
          `the BPM to mean anything — fewer than ${MIN_TEMPO_ONSETS} onsets, ` +
          "or an autocorrelation that found no periodicity."
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/** How the answer reports the container, for both video capabilities. */
function videoSource(
  info: ContainerInfo,
  decodedFrames: number,
  sampleFps: number
): Record<string, unknown> {
  return {
    format: info.format,
    duration: round(info.duration),
    size_bytes: info.sizeBytes,
    video: info.video
      ? {
          codec: info.video.codec,
          width: info.video.width,
          height: info.video.height,
          rotation: info.video.rotation,
          frame_rate: info.video.frameRate === null
            ? null
            : round(info.video.frameRate, 3),
          aspect_ratio:
            info.video.height > 0
              ? round(info.video.width / info.video.height, 4)
              : null
        }
      : null,
    audio: info.audio
      ? {
          codec: info.audio.codec,
          channels: info.audio.channels,
          sample_rate: info.audio.sampleRate
        }
      : null,
    has_audio: info.audio !== null,
    sampling: {
      fps: round(sampleFps, 3),
      frames_analyzed: decodedFrames
    }
  };
}

/**
 * Decode a video at `sampleFps` and reduce each frame to numbers.
 *
 * The frames are never all held at once — `forEachVideoFrame` closes each one
 * after the callback, and what survives is the 64×36 luma map and the
 * histogram a comparison needs. Colour buckets are accumulated across frames
 * rather than per frame, so a palette costs one map for the whole clip.
 */
async function analyzeFrames(
  bytes: Uint8Array,
  info: ContainerInfo,
  sampleFps: number,
  paletteSize: number
): Promise<{
  frames: AnalyzedFrame[];
  palette: { hex: string; share: number }[];
}> {
  const timestamps = sampleTimestamps(
    info.duration,
    sampleFps,
    MAX_VIDEO_FRAMES
  );
  const frames: AnalyzedFrame[] = [];
  const buckets = new Map<string, number>();
  await forEachVideoFrame(bytes, timestamps, (frame) => {
    const small = downscaleLuma(frame.rgba, frame.width, frame.height);
    frames.push({
      time: frame.time,
      stats: frameStats(frame.rgba, frame.width, frame.height),
      luma: small,
      histogram: lumaHistogram(small)
    });
    if (paletteSize > 0) {
      for (const entry of dominantColors(
        frame.rgba,
        frame.width,
        frame.height,
        paletteSize
      )) {
        buckets.set(entry.hex, (buckets.get(entry.hex) ?? 0) + entry.share);
      }
    }
  });
  const total = [...buckets.values()].reduce((sum, share) => sum + share, 0);
  const palette = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, paletteSize)
    .map(([hex, share]) => ({
      hex,
      share: round(total > 0 ? share / total : 0, 4)
    }));
  return { frames, palette };
}

/** Read the container, reporting a file with no video track as an error. */
async function loadVideo(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<{ bytes: Uint8Array; info: ContainerInfo } | ToolError> {
  const bytes = await loadMedia(run, params["video"], "video");
  if (isError(bytes)) return bytes;
  let info: ContainerInfo;
  try {
    info = await probeContainer(bytes);
  } catch (error) {
    return {
      error: `Could not read that video: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
  if (!info.video) {
    return {
      error:
        "That file has no video track. For an audio-only file call " +
        "analyze_audio instead."
    };
  }
  return { bytes, info };
}

const analyzeVideo: CapabilityExport = {
  spec: analyzeVideoSpec,
  impl: async (run, params) => {
    const loaded = await loadVideo(run, params);
    if (isError(loaded)) return loaded;
    const { bytes, info } = loaded;

    const sampleFps = clamp(params["sample_fps"], DEFAULT_SAMPLE_FPS, 0.1, 30);
    const paletteSize = clamp(params["palette_size"], 5, 0, 12);
    const { frames, palette } = await analyzeFrames(
      bytes,
      info,
      sampleFps,
      paletteSize
    );
    if (frames.length === 0) {
      return {
        ...videoSource(info, 0, sampleFps),
        error: "No frames decoded from that video track."
      };
    }
    const transitions = frameTransitions(frames);

    const budget = clamp(params["max_points"], 200, 1, MAX_VIDEO_FRAMES);
    const motionByTime = new Map(
      transitions.map((transition) => [transition.time, transition.motion])
    );
    const series = decimate(frames, budget, (a, b) =>
      (motionByTime.get(b.time) ?? 0) > (motionByTime.get(a.time) ?? 0) ? b : a
    ).map((frame) => ({
      time: round(frame.time),
      brightness: round(frame.stats.brightness, 4),
      contrast: round(frame.stats.contrast, 4),
      saturation: round(frame.stats.saturation, 4),
      motion: round(motionByTime.get(frame.time) ?? 0, 5)
    }));

    const mean = (read: (frame: AnalyzedFrame) => number): number =>
      frames.reduce((sum, frame) => sum + read(frame), 0) / frames.length;
    const extreme = (
      read: (frame: AnalyzedFrame) => number,
      better: (a: number, b: number) => boolean
    ): AnalyzedFrame =>
      frames.reduce((best, frame) =>
        better(read(frame), read(best)) ? frame : best
      );

    const darkest = extreme((frame) => frame.stats.brightness, (a, b) => a < b);
    const brightest = extreme((frame) => frame.stats.brightness, (a, b) => a > b);
    const busiest = transitions.reduce(
      (best, transition) => (transition.motion > best.motion ? transition : best),
      transitions[0] ?? { time: 0, motion: 0, histogramDistance: 0 }
    );

    return {
      ...videoSource(info, frames.length, sampleFps),
      picture: {
        brightness: round(mean((frame) => frame.stats.brightness), 4),
        contrast: round(mean((frame) => frame.stats.contrast), 4),
        saturation: round(mean((frame) => frame.stats.saturation), 4),
        clipped_highlights: round(
          mean((frame) => frame.stats.clippedHighlights),
          4
        ),
        crushed_shadows: round(mean((frame) => frame.stats.crushedShadows), 4),
        motion: round(
          transitions.length > 0
            ? transitions.reduce((sum, t) => sum + t.motion, 0) /
                transitions.length
            : 0,
          5
        )
      },
      palette,
      darkest_moment: {
        time: round(darkest.time),
        brightness: round(darkest.stats.brightness, 4)
      },
      brightest_moment: {
        time: round(brightest.time),
        brightness: round(brightest.stats.brightness, 4)
      },
      busiest_moment: {
        time: round(busiest.time),
        motion: round(busiest.motion, 5)
      },
      series: {
        points: series.length,
        decimated: frames.length > series.length,
        values: series
      },
      notes: [
        "brightness is mean Rec. 709 luma and contrast is its standard " +
          "deviation, both 0..1.",
        "motion is the mean absolute luma difference between consecutive " +
          "sampled frames, so it scales with sample_fps."
      ]
    };
  }
};

const detectVideoScenes: CapabilityExport = {
  spec: detectVideoScenesSpec,
  impl: async (run, params) => {
    const loaded = await loadVideo(run, params);
    if (isError(loaded)) return loaded;
    const { bytes, info } = loaded;

    const sampleFps = clamp(
      params["sample_fps"],
      DEFAULT_SCENE_SAMPLE_FPS,
      0.1,
      30
    );
    const paletteSize = clamp(params["palette_size"], 3, 0, 8);
    const threshold = clamp(
      params["threshold"],
      DEFAULT_CUT_THRESHOLD,
      0.01,
      1
    );
    const minShot = clamp(params["min_shot_seconds"], 0.4, 0, 60);

    const timestamps = sampleTimestamps(
      info.duration,
      sampleFps,
      MAX_VIDEO_FRAMES
    );
    const frames: AnalyzedFrame[] = [];
    const palettePerFrame: { hex: string; share: number }[][] = [];
    await forEachVideoFrame(bytes, timestamps, (frame) => {
      const small = downscaleLuma(frame.rgba, frame.width, frame.height);
      frames.push({
        time: frame.time,
        stats: frameStats(frame.rgba, frame.width, frame.height),
        luma: small,
        histogram: lumaHistogram(small)
      });
      palettePerFrame.push(
        paletteSize > 0
          ? dominantColors(frame.rgba, frame.width, frame.height, paletteSize)
          : []
      );
    });
    if (frames.length === 0) {
      return {
        ...videoSource(info, 0, sampleFps),
        error: "No frames decoded from that video track."
      };
    }

    const transitions = frameTransitions(frames);
    const cuts = detectCuts(transitions, threshold, minShot);
    const shots = shotsFromCuts(frames, transitions, cuts, info.duration);
    const frameDuration = timestamps.length > 1
      ? info.duration / timestamps.length
      : info.duration;

    const black = runsOf(
      frames,
      (index) => frames[index].stats.brightness < 0.02,
      frameDuration,
      Math.max(frameDuration, 0.1)
    );
    // A freeze is consecutive frames that differ by essentially nothing. The
    // threshold is not zero: a lossy codec re-encodes an identical frame into
    // slightly different pixels, so an exact-equality test finds freezes only
    // in uncompressed sources.
    const frozen = runsOf(
      frames,
      (index) =>
        index > 0 && (transitions[index - 1]?.motion ?? 1) < 0.0015,
      frameDuration,
      Math.max(frameDuration * 2, 0.4)
    );

    const cappedShots = capped(shots);

    return {
      ...videoSource(info, frames.length, sampleFps),
      threshold,
      cuts: {
        count: cuts.length,
        times: cuts.slice(0, MAX_EVENTS).map((time) => round(time))
      },
      shots: {
        count: shots.length,
        truncated: cappedShots.truncated,
        mean_duration: round(
          shots.length > 0
            ? shots.reduce((sum, shot) => sum + shot.duration, 0) / shots.length
            : 0
        ),
        list: cappedShots.items.map((shot) => {
          const inside = frames
            .map((frame, index) => ({ frame, index }))
            .filter(
              ({ frame }) => frame.time >= shot.start && frame.time < shot.end
            );
          const middle = inside[Math.floor(inside.length / 2)];
          return {
            index: shot.index,
            start: round(shot.start),
            end: round(shot.end),
            duration: round(shot.duration),
            brightness: round(shot.brightness, 4),
            motion: round(shot.motion, 5),
            // The frame a thumbnail should come from: the middle of the shot,
            // past whatever transition opened it.
            representative_time: round(middle?.frame.time ?? shot.start),
            palette: middle
              ? (palettePerFrame[middle.index] ?? []).map((entry) => ({
                  hex: entry.hex,
                  share: round(entry.share, 4)
                }))
              : []
          };
        })
      },
      black_frames: {
        count: black.length,
        runs: black.slice(0, MAX_EVENTS).map((run_) => ({
          start: round(run_.start),
          end: round(run_.end),
          duration: round(run_.duration)
        }))
      },
      frozen_frames: {
        count: frozen.length,
        runs: frozen.slice(0, MAX_EVENTS).map((run_) => ({
          start: round(run_.start),
          end: round(run_.end),
          duration: round(run_.duration)
        }))
      },
      notes: [
        `Cuts are placed at sampled frames, so a time is within ${round(1 / sampleFps, 3)}s of the real edit.`,
        "A dissolve reads as one cut somewhere inside it, not as its start.",
        "Cuts come from the luma histogram, so a hard camera move inside one " +
          "shot does not count as an edit."
      ]
    };
  }
};

export const module: CapabilityModule = {
  module: "analysis",
  exports: [
    analyzeAudio,
    analyzeAudioSpectrum,
    detectAudioEvents,
    analyzeVideo,
    detectVideoScenes
  ]
};

export { analysisSpecs };
