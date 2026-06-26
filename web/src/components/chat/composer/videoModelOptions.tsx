/**
 * videoModelOptions — shared derivation of the duration / resolution / aspect
 * controls offered for a video model.
 *
 * One source of truth for both the media chat composer ({@link MediaChatComposer})
 * and the timeline quick-generate header (`TopBarPrompt`), so the two surfaces
 * present identical, model-constrained options and can't drift apart.
 */

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TvIcon from "@mui/icons-material/Tv";
import type { VideoModel } from "../../../stores/ApiTypes";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  type AspectRatioOption,
  type VideoModelSelection,
  type VideoResolution
} from "../../../stores/MediaGenerationStore";
import type { MediaOption } from "./MediaOptionMenu";

/** Extract per-model option constraints (manifest enums) from a raw model. */
export function videoModelConstraints(model: VideoModel): {
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
} {
  const durations = model.durations?.filter((d) => Number.isFinite(d));
  const resolutions = model.resolutions ?? undefined;
  const aspectRatios = model.aspect_ratios ?? undefined;
  return {
    durations: durations && durations.length > 0 ? durations : undefined,
    resolutions:
      resolutions && resolutions.length > 0 ? resolutions : undefined,
    aspectRatios:
      aspectRatios && aspectRatios.length > 0 ? aspectRatios : undefined
  };
}

/** Keep `value` if the model allows it; otherwise snap to the first allowed. */
export function clampToAllowed<T>(value: T, allowed?: Array<T | string>): T {
  if (!allowed || allowed.length === 0) return value;
  if ((allowed as unknown[]).includes(value)) return value;
  return allowed[0] as T;
}

/** Build aspect-ratio menu options from a model's allowed list. */
export function buildAspectOptions(
  allowed: string[],
  fallback: AspectRatioOption[]
): AspectRatioOption[] {
  const options = allowed
    .map((id) => {
      const known = fallback.find((a) => a.id === id);
      if (known) return known;
      const m = id.match(/^(\d+):(\d+)$/);
      return m
        ? { id, label: id, width: Number(m[1]), height: Number(m[2]) }
        : null;
    })
    .filter((x): x is AspectRatioOption => x != null);
  return options.length > 0 ? options : fallback;
}

/** Normalize a raw model into the stored selection shape (with its constraints). */
export function normalizeVideoModel(model: VideoModel): VideoModelSelection {
  return {
    type: "video_model",
    id: model.id,
    provider: model.provider,
    name: model.name || "",
    ...videoModelConstraints(model)
  };
}

/**
 * Build the duration / resolution / aspect menu options for a selected video
 * model, falling back to the full sets when the model declares no constraints.
 */
export function buildVideoModelOptions(
  model: VideoModelSelection | null | undefined
): {
  durationOptions: MediaOption<number>[];
  resolutionOptions: MediaOption<VideoResolution>[];
  aspectOptions: AspectRatioOption[];
} {
  const durations =
    model?.durations && model.durations.length > 0
      ? model.durations
      : VIDEO_DURATIONS;
  const resolutions =
    model?.resolutions && model.resolutions.length > 0
      ? (model.resolutions as VideoResolution[])
      : VIDEO_RESOLUTIONS;
  const aspectOptions =
    model?.aspectRatios && model.aspectRatios.length > 0
      ? buildAspectOptions(model.aspectRatios, VIDEO_ASPECT_RATIOS)
      : VIDEO_ASPECT_RATIOS;
  return {
    durationOptions: durations.map((d) => ({
      id: d,
      label: `${d} Sec`,
      icon: <AccessTimeIcon fontSize="small" />
    })),
    resolutionOptions: resolutions.map((r) => ({
      id: r,
      label: r,
      icon: <TvIcon fontSize="small" />
    })),
    aspectOptions
  };
}
