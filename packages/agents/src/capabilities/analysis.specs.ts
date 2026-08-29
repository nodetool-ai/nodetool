/**
 * The `analysis` module's specs — data only, no implementation.
 *
 * Split out for the reason every module splits: the registry's eager spec
 * table imports this file and never the implementation, so nothing the
 * decoders pull in reaches the entry graph.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

/** Envelope frames one `analyze_audio` answer will carry. */
export const MAX_ENERGY_POINTS = 400;

/** Spectral frames one `analyze_audio_spectrum` answer will carry. */
export const MAX_SPECTRUM_POINTS = 300;

/** Segments, onsets, shots or runs one answer will carry. */
export const MAX_EVENTS = 500;

/** Frames a video pass will decode, however long the clip is. */
export const MAX_VIDEO_FRAMES = 1200;

/** Video frames sampled per second when the caller names no rate. */
export const DEFAULT_SAMPLE_FPS = 2;

/** Video frames sampled per second by `detect_video_scenes`. */
export const DEFAULT_SCENE_SAMPLE_FPS = 4;

/** Histogram distance at which a frame pair is called a cut. */
export const DEFAULT_CUT_THRESHOLD = 0.3;

/** dBFS below which an envelope frame counts as silence. */
export const DEFAULT_SILENCE_DB = -45;

/** Seconds a quiet stretch must last to be reported as silence. */
export const DEFAULT_MIN_SILENCE = 0.3;

const MEDIA_PROPERTY = {
  type: "string" as const,
  description:
    "The media to read: an asset id, an `asset://<id>` URI, the " +
    "`/api/storage/` key a tool returned, a URL, or a `data:` URI."
};

export const ANALYZE_AUDIO_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    audio: MEDIA_PROPERTY,
    frame_ms: {
      type: "number",
      description:
        "Analysis window in milliseconds (default 50, min 5, max 1000). The " +
        "envelope's time resolution."
    },
    max_points: {
      type: "number",
      description: `Envelope points to return (default 200, max ${MAX_ENERGY_POINTS}). The envelope is decimated to fit, keeping each bucket's peak.`
    },
    max_seconds: {
      type: "number",
      description:
        "Decode at most this many seconds from the start (default 600). The " +
        "answer says whether it was truncated."
    }
  },
  required: ["audio"]
};

export const analyzeAudioSpec: CapabilitySpec = {
  name: "analyze_audio",
  description:
    "Measure an audio file or a video's soundtrack: duration, sample rate, " +
    "channels and codec, plus where the energy actually is — an RMS/peak " +
    "envelope over time, the loudest and quietest moments, EBU R128 " +
    "integrated loudness (LUFS) and loudness range, peak dBFS, crest factor, " +
    "clipped samples and DC offset. Use it to answer how long something is, " +
    "how loud it is against a delivery target, whether it clips, and which " +
    "part of it is loud. Decodes with Mediabunny, so it needs no ffmpeg.",
  inputSchema: ANALYZE_AUDIO_SCHEMA,
  category: "read",
  userMessage: () => "Analyzing audio"
};

export const ANALYZE_AUDIO_SPECTRUM_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    audio: MEDIA_PROPERTY,
    fft_size: {
      type: "number",
      description:
        "FFT window in samples, rounded down to a power of two (default " +
        "2048, min 256, max 16384). Larger means finer frequency resolution " +
        "and coarser timing."
    },
    max_points: {
      type: "number",
      description: `Spectral frames to return (default 120, max ${MAX_SPECTRUM_POINTS}). Set 0 for the average spectrum only.`
    },
    max_seconds: {
      type: "number",
      description: "Decode at most this many seconds from the start (default 600)."
    }
  },
  required: ["audio"]
};

export const analyzeAudioSpectrumSpec: CapabilitySpec = {
  name: "analyze_audio_spectrum",
  description:
    "Read what frequencies are in an audio file: the average magnitude " +
    "spectrum split into ten named octave bands (sub_bass through air) with " +
    "each band's share of the energy, the dominant frequency, and spectral " +
    "centroid, rolloff, flatness and bandwidth both averaged and as a series " +
    "over time. Use it to tell bright from dark, tonal from noisy, or to " +
    "find a rumble, a hiss or a missing bottom end. Pair with analyze_audio, " +
    "which answers how loud rather than what colour.",
  inputSchema: ANALYZE_AUDIO_SPECTRUM_SCHEMA,
  category: "read",
  userMessage: () => "Analyzing audio spectrum"
};

export const DETECT_AUDIO_EVENTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    audio: MEDIA_PROPERTY,
    silence_db: {
      type: "number",
      description: `dBFS below which a moment counts as silence (default ${DEFAULT_SILENCE_DB}).`
    },
    min_silence_seconds: {
      type: "number",
      description: `Shortest silence worth reporting (default ${DEFAULT_MIN_SILENCE}).`
    },
    onset_sensitivity: {
      type: "number",
      description:
        "Standard deviations above the local mean a spectral-flux peak must " +
        "reach to count as an onset (default 1.5). Lower finds more."
    },
    detect_tempo: {
      type: "boolean",
      description: "Estimate tempo from the onset envelope (default true)."
    },
    max_seconds: {
      type: "number",
      description: "Decode at most this many seconds from the start (default 600)."
    }
  },
  required: ["audio"]
};

export const detectAudioEventsSpec: CapabilitySpec = {
  name: "detect_audio_events",
  description:
    "Find where things happen in audio: silent stretches and the sounding " +
    "segments between them (both with start, end and duration), onset times " +
    "from spectral flux, and a tempo estimate in BPM with a confidence — low " +
    "confidence means the material is not rhythmic and the BPM should be " +
    "ignored. Use it to trim dead air, cut to the beat, count takes, or find " +
    "where speech starts.",
  inputSchema: DETECT_AUDIO_EVENTS_SCHEMA,
  category: "read",
  userMessage: () => "Detecting audio events"
};

export const ANALYZE_VIDEO_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    video: MEDIA_PROPERTY,
    sample_fps: {
      type: "number",
      description: `Frames to decode per second of video (default ${DEFAULT_SAMPLE_FPS}, max 30). At most ${MAX_VIDEO_FRAMES} frames are decoded whatever the rate.`
    },
    max_points: {
      type: "number",
      description:
        "Timeline points to return (default 200). The per-frame series is " +
        "decimated to fit."
    },
    palette_size: {
      type: "number",
      description: "Dominant colours to report (default 5, max 12)."
    }
  },
  required: ["video"]
};

export const analyzeVideoSpec: CapabilitySpec = {
  name: "analyze_video",
  description:
    "Measure a video: duration, resolution, frame rate, rotation and codecs " +
    "for both tracks, plus what it looks like over time — brightness, " +
    "contrast, saturation and motion energy per sampled frame, the overall " +
    "dominant colour palette, and the darkest, brightest and busiest " +
    "moments. Use it to check a delivery spec, find where the action is, or " +
    "tell a static lockoff from a handheld take. Decodes with Mediabunny, so " +
    "it needs no ffmpeg or ffprobe. For where the cuts are, call " +
    "detect_video_scenes; for the soundtrack, call analyze_audio on the same " +
    "file.",
  inputSchema: ANALYZE_VIDEO_SCHEMA,
  category: "read",
  userMessage: () => "Analyzing video"
};

export const DETECT_VIDEO_SCENES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    video: MEDIA_PROPERTY,
    sample_fps: {
      type: "number",
      description: `Frames to decode per second (default ${DEFAULT_SCENE_SAMPLE_FPS}, max 30). A cut is placed at a sampled frame, so this bounds the accuracy.`
    },
    threshold: {
      type: "number",
      description: `Luma-histogram distance, 0..1, at which a frame pair is a cut (default ${DEFAULT_CUT_THRESHOLD}). Lower finds more, including dissolves.`
    },
    min_shot_seconds: {
      type: "number",
      description:
        "Shortest shot to report (default 0.4). Keeps one dissolve from " +
        "reading as a burst of cuts."
    },
    palette_size: {
      type: "number",
      description: "Dominant colours to report per shot (default 3, max 8). 0 skips them."
    }
  },
  required: ["video"]
};

export const detectVideoScenesSpec: CapabilitySpec = {
  name: "detect_video_scenes",
  description:
    "Find the cuts in a video and describe each shot: start, end, duration, " +
    "mean brightness, mean motion and dominant colours, plus runs of black " +
    "frames and of frozen frames. Cuts are decided from the luma histogram, " +
    "so a whip pan inside one shot does not read as an edit. Use it to build " +
    "a shot list, find a slate or a black gap, pick a thumbnail per shot, or " +
    "reverse-engineer a reference edit's pacing.",
  inputSchema: DETECT_VIDEO_SCENES_SCHEMA,
  category: "read",
  userMessage: () => "Detecting video scenes"
};

export const analysisSpecs: readonly CapabilitySpec[] = [
  analyzeAudioSpec,
  analyzeAudioSpectrumSpec,
  detectAudioEventsSpec,
  analyzeVideoSpec,
  detectVideoScenesSpec
];
