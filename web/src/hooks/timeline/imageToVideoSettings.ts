/**
 * Settings and placement for turning an image clip into a video clip.
 *
 * The video takes the image clip's span on the timeline and the image's own
 * proportions. A model that lists the durations, aspect ratios or resolutions
 * it accepts gets the nearest listed value; a model that lists none gets the
 * exact value (duration) or nothing, so it follows the source image.
 */
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

export interface ImageToVideoModelLimits {
  durations?: readonly number[] | null;
  aspectRatios?: readonly string[] | null;
  resolutions?: readonly string[] | null;
}

export interface ImageToVideoSettings {
  /** Seconds sent to the model. */
  requestSeconds: number;
  /** Length of the new video clip. Equal to the image clip's unless the model cannot render that length. */
  clipDurationMs: number;
  aspectRatio?: string;
  resolution?: string;
}

/**
 * Seconds an image-to-video request asks for. Rounded up so the rendered
 * video covers the whole clip.
 */
export function imageToVideoRequestSeconds(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 1000 - 1e-6));
}

const parseRatio = (value: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(
    value.trim()
  );
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
};

/** The listed aspect ratio closest to `width / height`, compared on a log scale. */
export function nearestAspectRatio(
  width: number,
  height: number,
  options: readonly string[]
): string | undefined {
  if (!(width > 0) || !(height > 0)) {
    return undefined;
  }
  const target = Math.log(width / height);
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const option of options) {
    const ratio = parseRatio(option);
    if (ratio === null) {
      continue;
    }
    const distance = Math.abs(Math.log(ratio) - target);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

const resolutionLines = (value: string): number | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "4k" || normalized === "2160p") {
    return 2160;
  }
  if (normalized === "2k" || normalized === "1440p") {
    return 1440;
  }
  const match = /^(\d+)p$/.exec(normalized);
  return match ? Number(match[1]) : null;
};

/**
 * The largest listed resolution tier the image fills without upscaling,
 * measured on its short side, or the smallest tier for a smaller image.
 * Nothing for an image whose size is unknown: the lowest tier is not a
 * neutral default.
 */
export function nearestResolution(
  width: number,
  height: number,
  options: readonly string[]
): string | undefined {
  const tiers = options
    .map((option) => ({ option, lines: resolutionLines(option) }))
    .filter(
      (tier): tier is { option: string; lines: number } => tier.lines !== null
    )
    .sort((a, b) => a.lines - b.lines);
  if (tiers.length === 0) {
    return undefined;
  }
  const shortSide = Math.min(width, height);
  if (!(shortSide > 0)) {
    return undefined;
  }
  const fitting = tiers.filter((tier) => tier.lines <= shortSide);
  return (fitting[fitting.length - 1] ?? tiers[0]).option;
}

/**
 * The request length for a clip of `durationMs`, and the clip length that goes
 * with it. The clip keeps its length when the model renders the rounded-up
 * seconds. Otherwise the shortest listed duration that covers the clip is
 * used, or the longest one when none does, and the clip takes that length.
 */
export function snapImageToVideoDuration(
  durationMs: number,
  durations: readonly number[] | null | undefined
): { requestSeconds: number; clipDurationMs: number } {
  const seconds = imageToVideoRequestSeconds(durationMs);
  const listed = (durations ?? [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (listed.length === 0 || listed.includes(seconds)) {
    return { requestSeconds: seconds, clipDurationMs: durationMs };
  }
  const covering = listed.find((value) => value >= durationMs / 1000);
  const chosen = covering ?? listed[listed.length - 1];
  return { requestSeconds: chosen, clipDurationMs: chosen * 1000 };
}

export function imageToVideoSettings(
  image: { durationMs: number; width?: number; height?: number },
  limits: ImageToVideoModelLimits
): ImageToVideoSettings {
  const { requestSeconds, clipDurationMs } = snapImageToVideoDuration(
    image.durationMs,
    limits.durations
  );
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  return {
    requestSeconds,
    clipDurationMs,
    aspectRatio: nearestAspectRatio(width, height, limits.aspectRatios ?? []),
    resolution: nearestResolution(width, height, limits.resolutions ?? [])
  };
}

export type ImageToVideoPlacement =
  | { kind: "existing"; trackId: string }
  | { kind: "insert"; atIndex: number };

/**
 * Where the video goes: the video track drawn directly above the image's
 * track when it is visible, unlocked and free over the span, otherwise a new
 * video track inserted directly above. Index 0 draws on top, so "above" is
 * the lower index.
 */
export function placeImageToVideoClip(
  tracks: readonly Pick<
    TimelineTrack,
    "id" | "type" | "index" | "locked" | "visible"
  >[],
  clips: readonly Pick<TimelineClip, "trackId" | "startMs" | "durationMs">[],
  image: Pick<TimelineClip, "trackId" | "startMs">,
  durationMs: number
): ImageToVideoPlacement {
  const ordered = [...tracks].sort((a, b) => a.index - b.index);
  const imageSlot = ordered.findIndex((track) => track.id === image.trackId);
  if (imageSlot < 0) {
    return { kind: "insert", atIndex: 0 };
  }
  const above = ordered[imageSlot - 1];
  const endMs = image.startMs + durationMs;
  if (
    above &&
    above.type === "video" &&
    !above.locked &&
    above.visible &&
    !clips.some(
      (clip) =>
        clip.trackId === above.id &&
        clip.startMs < endMs &&
        clip.startMs + clip.durationMs > image.startMs
    )
  ) {
    return { kind: "existing", trackId: above.id };
  }
  return { kind: "insert", atIndex: imageSlot };
}
