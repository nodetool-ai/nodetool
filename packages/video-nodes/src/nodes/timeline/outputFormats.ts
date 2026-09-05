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
  "png_sequence"
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

/** Thrown when this ffmpeg build lacks the encoder the format needs. */
export class MissingEncoderError extends Error {
  readonly encoder: string;

  constructor(encoder: string, format: TimelineOutputFormat) {
    super(
      `This ffmpeg build has no "${encoder}" encoder, which the "${format}" ` +
        "format needs. Install an ffmpeg built with it, or render to another " +
        "format."
    );
    this.name = "MissingEncoderError";
    this.encoder = encoder;
  }
}

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
  /** What `videoRef`/`documentRef` reports as the artifact's format. */
  mimeType: string;
  /**
   * ffmpeg output arguments for the frame encoder — codec, profile and pixel
   * format. Empty for `png_sequence`, which never reaches ffmpeg.
   */
  encoderArgs: string[];
  /** The ffmpeg encoder that must exist, probed before the render starts. */
  requiredEncoder: string | null;
  /** Audio codec for the mux pass; null when the format carries no audio. */
  audioCodec: string | null;
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

  const bitrateArgs =
    typeof request.bitrate === "number" && request.bitrate > 0
      ? ["-b:v", String(Math.round(request.bitrate))]
      : [];
  const override = request.videoCodec?.trim();

  if (format === "png_sequence") {
    return {
      format,
      alpha,
      motionBlur,
      extension: "zip",
      mimeType: "application/zip",
      encoderArgs: [],
      requiredEncoder: null,
      audioCodec: null
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
      audioCodec: "libopus"
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
      audioCodec: "aac"
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
    audioCodec: "aac"
  };
}
