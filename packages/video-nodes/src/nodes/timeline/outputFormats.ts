/**
 * What a timeline render is written as, and which of those carry alpha.
 *
 * The table is pure so the refusals can be tested without ffmpeg: picking a
 * format is a decision about the container, the encoder, the pixel format and
 * whether transparency survives, and all four have to agree. `mp4` is the one
 * that cannot agree — H.264 in MP4 has no alpha plane any player reads — so
 * asking for it with `alpha` is refused here rather than encoded opaque and
 * handed back as if it had worked.
 */

import {
  resolveMotionBlur,
  type ResolvedMotionBlur
} from "@nodetool-ai/timeline/render";

/** Containers `RenderTimeline` can write. */
export const TIMELINE_OUTPUT_FORMATS = [
  "mp4",
  "webm",
  "mov",
  "png_sequence",
  "wav"
] as const;

export type TimelineOutputFormat = (typeof TIMELINE_OUTPUT_FORMATS)[number];

/** The formats whose pixels keep a transparency channel. */
export const ALPHA_OUTPUT_FORMATS: readonly TimelineOutputFormat[] = [
  "webm",
  "mov",
  "png_sequence"
];

/** Thrown when the requested format cannot carry the requested alpha. */
export class AlphaFormatError extends Error {
  readonly format: TimelineOutputFormat;

  constructor(format: TimelineOutputFormat) {
    super(
      `The "${format}" format has no alpha channel. Render with transparency ` +
        `as one of: ${ALPHA_OUTPUT_FORMATS.join(", ")}.`
    );
    this.name = "AlphaFormatError";
    this.format = format;
  }
}

/** Thrown when this libav build lacks the encoder the format needs. */
export class MissingEncoderError extends Error {
  readonly encoder: string;

  constructor(encoder: string, format: TimelineOutputFormat) {
    super(
      `NodeTool's media build has no "${encoder}" encoder, which the ` +
        `"${format}" format needs. Render to another format, or pick another ` +
        "video codec."
    );
    this.name = "MissingEncoderError";
    this.encoder = encoder;
  }
}

/** Default audio sample rate for timeline renders (Hz). */
export const DEFAULT_AUDIO_SAMPLE_RATE = 48000;

/** Default PCM bit depth for WAV timeline exports. */
export const DEFAULT_WAV_BIT_DEPTH = 16;

/** Supported PCM bit depths for WAV exports (32 is 32-bit IEEE 754 float). */
export const WAV_BIT_DEPTHS = [16, 24, 32] as const;

export type WavBitDepth = (typeof WAV_BIT_DEPTHS)[number];

const WAV_CODEC_BY_BIT_DEPTH: Record<WavBitDepth, string> = {
  16: "pcm_s16le",
  24: "pcm_s24le",
  32: "pcm_f32le"
};

/** Audio sample rates (Hz) supported by each render format's audio encoder. */
export const AUDIO_SAMPLE_RATES_BY_FORMAT: Record<
  TimelineOutputFormat,
  readonly number[]
> = {
  mp4: [44100, 48000, 88200, 96000],
  mov: [44100, 48000, 88200, 96000],
  webm: [48000],
  png_sequence: [],
  wav: [44100, 48000, 88200, 96000, 192000]
};

/** Everything downstream of the format choice, resolved once. */
export interface ResolvedTimelineOutput {
  /**
   * Motion blur for this render, already clamped (D10). One sample is blur off,
   * which is what a request that names neither field resolves to.
   */
  motionBlur: ResolvedMotionBlur;
  format: TimelineOutputFormat;
  /** Whether the frames are composited over a transparent ground. */
  alpha: boolean;
  /** File extension of the rendered artifact, without the dot. */
  extension: string;
  /** What `videoRef`/`documentRef`/`audioRef` reports as the artifact's format. */
  mimeType: string;
  /**
   * ffmpeg output arguments for the frame encoder — codec, profile and pixel
   * format. Empty for `png_sequence` and `wav`, which never encode video frames.
   */
  encoderArgs: string[];
  /** The ffmpeg encoder that must exist, probed before the render starts. */
  requiredEncoder: string | null;
  /** Audio codec for the mux or audio-only pass; null when the format carries no audio. */
  audioCodec: string | null;
  /** Output audio sample rate in Hz (validated against the format's audio codec). */
  audioSampleRate: number;
  /** PCM bit depth for WAV exports (16, 24, or 32 float); null for non-WAV formats. */
  audioBitDepth: WavBitDepth | null;
}

export interface TimelineOutputRequest {
  format?: string | null;
  /**
   * Sub-frame instants to average into each frame, and how far the shutter
   * opens in degrees of the frame. Out-of-range values clamp rather than
   * refusing the render; absent is blur off.
   */
  motionBlurSamples?: number | null;
  shutterAngle?: number | null;
  alpha?: boolean;
  /** Override the container's default video encoder. */
  videoCodec?: string | null;
  /** Target video bitrate in bits per second; 0 or absent leaves it to ffmpeg. */
  bitrate?: number | null;
  /** Output audio sample rate in Hz; absent or 0 defaults to 48000. */
  audioSampleRate?: number | null;
  /** WAV PCM bit depth (16, 24, 32 / "32f"); absent or 0 defaults to 16. */
  audioBitDepth?: number | string | null;
}

function resolveAudioSampleRate(
  format: TimelineOutputFormat,
  raw: number | null | undefined
): number {
  if (format === "png_sequence") return DEFAULT_AUDIO_SAMPLE_RATE;
  const rate = raw === undefined || raw === null || raw === 0 ? DEFAULT_AUDIO_SAMPLE_RATE : raw;
  const allowed = AUDIO_SAMPLE_RATES_BY_FORMAT[format];
  if (!Number.isInteger(rate) || !allowed.includes(rate)) {
    throw new Error(
      `Unsupported audio sample rate ${String(rate)} Hz for "${format}". ` +
        `Choose one of: ${allowed.join(", ")}.`
    );
  }
  return rate;
}

function resolveWavBitDepth(raw: number | string | null | undefined): WavBitDepth {
  if (raw === undefined || raw === null || raw === 0 || raw === "") {
    return DEFAULT_WAV_BIT_DEPTH;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "16") return 16;
    if (normalized === "24") return 24;
    if (normalized === "32" || normalized === "32f") return 32;
  } else if (typeof raw === "number" && Number.isInteger(raw)) {
    if (raw === 16 || raw === 24 || raw === 32) return raw;
  }
  throw new Error(
    `Unsupported WAV audio bit depth "${String(raw)}". ` +
      `Choose one of: ${WAV_BIT_DEPTHS.join(", ")} (32 is 32-bit IEEE float).`
  );
}

/** Narrow a caller's string to a format, or say what the choices are. */
export function parseOutputFormat(raw: string | null | undefined): TimelineOutputFormat {
  const value = (raw ?? "mp4").trim().toLowerCase();
  const found = TIMELINE_OUTPUT_FORMATS.find((f) => f === value);
  if (!found) {
    throw new Error(
      `Unknown render format "${raw}". Choose one of: ` +
        `${TIMELINE_OUTPUT_FORMATS.join(", ")}.`
    );
  }
  return found;
}

/**
 * Resolve a format request into the container, encoder and pixel format that
 * carry it. Throws {@link AlphaFormatError} when the pair cannot exist.
 *
 * ProRes 4444 is the alpha-carrying profile (`-profile:v 4444`); without alpha
 * the render drops to 422 HQ, which is half the data for the same picture.
 * VP9 is the only WebM video codec with an alpha plane, so `webm` pins it
 * rather than taking a `videoCodec` override that would silently lose alpha.
 */
/**
 * Convert to BT.709 and say so in the file.
 *
 * The compositor hands ffmpeg sRGB RGBA. Told only a `-pix_fmt`, ffmpeg picks
 * the BT.601 matrix (its default for an untagged input) and writes no colour
 * metadata, so a player that assumes BT.709 for HD — which is every player —
 * shows greens and reds that are not the ones the editor previewed. The scaler
 * does the conversion; the three tags record it, since an untagged file is
 * guessed at all over again by the next tool that reads it. Limited range is
 * what a YUV video carries and what a player expects.
 */
const BT709_ARGS: readonly string[] = [
  "-vf",
  "scale=out_color_matrix=bt709:out_range=tv",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709"
];

export function resolveTimelineOutput(
  request: TimelineOutputRequest = {}
): ResolvedTimelineOutput {
  const format = parseOutputFormat(request.format);
  const alpha = request.alpha === true;
  const motionBlur = resolveMotionBlur({
    samplesPerFrame: request.motionBlurSamples ?? undefined,
    shutterAngle: request.shutterAngle ?? undefined
  });
  if (alpha && !ALPHA_OUTPUT_FORMATS.includes(format)) {
    throw new AlphaFormatError(format);
  }
  const audioSampleRate = resolveAudioSampleRate(format, request.audioSampleRate);

  const bitrateArgs =
    typeof request.bitrate === "number" && request.bitrate > 0
      ? ["-b:v", String(Math.round(request.bitrate))]
      : [];
  const override = request.videoCodec?.trim();

  if (format === "wav") {
    const audioBitDepth = resolveWavBitDepth(request.audioBitDepth);
    const wavCodec = WAV_CODEC_BY_BIT_DEPTH[audioBitDepth];
    return {
      format,
      alpha: false,
      motionBlur,
      extension: "wav",
      mimeType: "audio/wav",
      encoderArgs: [],
      requiredEncoder: wavCodec,
      audioCodec: wavCodec,
      audioSampleRate,
      audioBitDepth
    };
  }

  if (format === "png_sequence") {
    return {
      format,
      alpha,
      motionBlur,
      extension: "zip",
      mimeType: "application/zip",
      encoderArgs: [],
      requiredEncoder: null,
      audioCodec: null,
      audioSampleRate,
      audioBitDepth: null
    };
  }

  if (format === "webm") {
    return {
      format,
      alpha,
      motionBlur,
      extension: "webm",
      mimeType: "video/webm",
      encoderArgs: [
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        alpha ? "yuva420p" : "yuv420p",
        ...BT709_ARGS,
        ...bitrateArgs
      ],
      requiredEncoder: "libvpx-vp9",
      // WebM carries Opus and Vorbis; AAC is not a legal Matroska/WebM track.
      audioCodec: "libopus",
      audioSampleRate,
      audioBitDepth: null
    };
  }

  if (format === "mov") {
    return {
      format,
      alpha,
      motionBlur,
      extension: "mov",
      mimeType: "video/quicktime",
      encoderArgs: [
        "-c:v",
        "prores_ks",
        "-profile:v",
        alpha ? "4444" : "3",
        "-pix_fmt",
        alpha ? "yuva444p10le" : "yuv422p10le",
        ...BT709_ARGS,
        ...bitrateArgs
      ],
      requiredEncoder: "prores_ks",
      audioCodec: "aac",
      audioSampleRate,
      audioBitDepth: null
    };
  }

  const codec = override && override.length > 0 ? override : "libx264";
  return {
    format,
    alpha: false,
    motionBlur,
    extension: "mp4",
    mimeType: "video/mp4",
    encoderArgs: [
      "-c:v",
      codec,
      ...(codec === "libx264" ? ["-preset", "veryfast"] : []),
      "-pix_fmt",
      "yuv420p",
      ...BT709_ARGS,
      ...bitrateArgs
    ],
    requiredEncoder: codec,
    audioCodec: "aac",
    audioSampleRate,
    audioBitDepth: null
  };
}
