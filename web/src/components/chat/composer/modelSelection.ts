/**
 * modelSelection — turning a model the user picked in a menu dialog into the
 * params patch its store expects.
 *
 * A model carries constraints (which resolutions, aspect ratios and durations
 * it supports), so picking one has to clamp the current settings to what the
 * new model allows. That rule belongs in one place, so a second copy of the
 * clamping cannot drift from the first.
 */
import type { ImageModel, TTSModel, VideoModel } from "../../../stores/ApiTypes";
import type {
  ImageModelValue,
  TTSModelValue
} from "../../../stores/ApiTypes";
import type {
  VideoModelSelection,
  ImageResolution,
  VideoResolution
} from "../../../stores/MediaGenerationStore";
import { imageModelConstraints } from "./imageModelOptions";
import { clampToAllowed, videoModelConstraints } from "./videoModelOptions";

interface ImageSettings {
  resolution: ImageResolution;
  aspectRatio: string;
}

interface VideoSettings {
  resolution: VideoResolution;
  aspectRatio: string;
  duration: number;
}

interface ImageModelPatch extends ImageSettings {
  model: ImageModelValue;
}

interface VideoModelPatch extends VideoSettings {
  model: VideoModelSelection;
}

interface AudioModelPatch {
  model: TTSModelValue;
  voice: string;
}

/** The image params to write when `model` is picked over `current` settings. */
export function imageModelPatch(
  model: ImageModel,
  current: ImageSettings
): ImageModelPatch {
  const constraints = imageModelConstraints(model);
  return {
    model: {
      type: "image_model",
      id: model.id,
      provider: model.provider,
      name: model.name || "",
      path: model.path || "",
      ...constraints
    },
    resolution: clampToAllowed(current.resolution, constraints.resolutions),
    aspectRatio: clampToAllowed(current.aspectRatio, constraints.aspectRatios)
  };
}

/** The video params to write when `model` is picked over `current` settings. */
export function videoModelPatch(
  model: VideoModel,
  current: VideoSettings
): VideoModelPatch {
  const constraints = videoModelConstraints(model);
  return {
    model: {
      type: "video_model",
      id: model.id,
      provider: model.provider,
      name: model.name || "",
      ...constraints
    },
    duration: clampToAllowed(current.duration, constraints.durations),
    resolution: clampToAllowed(current.resolution, constraints.resolutions),
    aspectRatio: clampToAllowed(current.aspectRatio, constraints.aspectRatios)
  };
}

/**
 * The audio params to write when `model` is picked. A TTS model carries its
 * own voices, so the current voice is replaced by the new model's first one
 * rather than clamped — a voice from another model does not exist here.
 */
export function audioModelPatch(
  model: TTSModel,
  currentVoice: string
): AudioModelPatch {
  const voices = Array.isArray(model.voices) ? model.voices : [];
  return {
    model: {
      type: "tts_model",
      id: model.id,
      provider: model.provider,
      name: model.name || "",
      voices,
      capabilities: model.capabilities ?? undefined,
      languages: model.languages ?? undefined,
      sample_rate: model.sample_rate ?? null,
      requires_reference_text: model.requires_reference_text ?? false,
      selected_voice: voices[0] ?? currentVoice
    },
    voice: voices[0] ?? currentVoice
  };
}

/** The `{provider, id, name}` a picked model contributes to recents. */
export function recentModelEntry(model: {
  provider?: string | null;
  id?: string | null;
  name?: string | null;
}): { provider: string; id: string; name: string } {
  return {
    provider: model.provider || "",
    id: model.id || "",
    name: model.name || ""
  };
}
