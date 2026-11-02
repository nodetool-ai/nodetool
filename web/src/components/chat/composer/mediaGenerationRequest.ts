/**
 * The `media_generation` payload of a chat turn in `mode`, built from the
 * media store's current settings. Shared by the chat composer and the start
 * page so both send the same request for the same chips.
 */
import type { MediaGenerationRequest } from "../types/media.types";
import type useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import { resolveImageSize } from "../../../stores/MediaGenerationStore";

type MediaSettings = ReturnType<typeof useMediaGenerationStore.getState>;

export type MediaRequestSettings = Pick<
  MediaSettings,
  | "image"
  | "imageEdit"
  | "video"
  | "imageToVideo"
  | "referenceToVideo"
  | "retake"
  | "extend"
  | "audio"
  | "music"
  | "presetIds"
>;

export function buildMediaGenerationRequest(
  mode: MediaMode,
  settings: MediaRequestSettings
): MediaGenerationRequest {
  const {
    image: imageParams,
    imageEdit: imageEditParams,
    video: videoParams,
    imageToVideo: imageToVideoParams,
    referenceToVideo: referenceToVideoParams,
    retake: retakeParams,
    extend: extendParams,
    audio: audioParams,
    music: musicParams,
    presetIds
  } = settings;
  if (mode === "chat") {
    return { mode: "chat" };
  }
  if (mode === "image") {
    const { width, height } = resolveImageSize(
      imageParams.resolution,
      imageParams.aspectRatio
    );
    return {
      mode: "image",
      provider: imageParams.model?.provider ?? null,
      model: imageParams.model?.id ?? null,
      width,
      height,
      aspect_ratio: imageParams.aspectRatio,
      resolution: imageParams.resolution,
      variations: imageParams.variations,
      preset_ids: presetIds.image?.length ? presetIds.image : undefined
    };
  }
  if (mode === "image_edit") {
    const { width, height } = resolveImageSize(
      imageEditParams.resolution,
      imageEditParams.aspectRatio
    );
    return {
      mode: "image_edit",
      provider: imageEditParams.model?.provider ?? null,
      model: imageEditParams.model?.id ?? null,
      width,
      height,
      aspect_ratio: imageEditParams.aspectRatio,
      resolution: imageEditParams.resolution,
      variations: imageEditParams.variations,
      strength: imageEditParams.strength,
      num_inference_steps: imageEditParams.numInferenceSteps,
      preset_ids: presetIds.image_edit?.length
        ? presetIds.image_edit
        : undefined
    };
  }
  if (mode === "video") {
    return {
      mode: "video",
      provider: videoParams.model?.provider ?? null,
      model: videoParams.model?.id ?? null,
      aspect_ratio: videoParams.aspectRatio,
      resolution: videoParams.resolution,
      duration: videoParams.duration,
      preset_ids: presetIds.video?.length ? presetIds.video : undefined
    };
  }
  if (mode === "image_to_video") {
    return {
      mode: "image_to_video",
      provider: imageToVideoParams.model?.provider ?? null,
      model: imageToVideoParams.model?.id ?? null,
      aspect_ratio: imageToVideoParams.aspectRatio,
      resolution: imageToVideoParams.resolution,
      duration: imageToVideoParams.duration,
      num_inference_steps: imageToVideoParams.numInferenceSteps,
      preset_ids: presetIds.image_to_video?.length
        ? presetIds.image_to_video
        : undefined
    };
  }
  if (mode === "reference_to_video") {
    return {
      mode: "reference_to_video",
      provider: referenceToVideoParams.model?.provider ?? null,
      model: referenceToVideoParams.model?.id ?? null,
      aspect_ratio: referenceToVideoParams.aspectRatio,
      resolution: referenceToVideoParams.resolution,
      duration: referenceToVideoParams.duration,
      // Only sent when on: a model that cannot take it rejects the request,
      // so an off toggle must not state anything.
      use_reference_video_audio: referenceToVideoParams.useReferenceVideoAudio
        ? true
        : null,
      preset_ids: presetIds.reference_to_video?.length
        ? presetIds.reference_to_video
        : undefined
    };
  }
  if (mode === "retake") {
    return {
      mode: "retake",
      provider: retakeParams.model?.provider ?? null,
      model: retakeParams.model?.id ?? null,
      preset_ids: presetIds.retake?.length ? presetIds.retake : undefined
    };
  }
  if (mode === "extend") {
    return {
      mode: "extend",
      provider: extendParams.model?.provider ?? null,
      model: extendParams.model?.id ?? null,
      extend_direction: extendParams.direction,
      duration: extendParams.duration
    };
  }
  if (mode === "music") {
    return {
      mode,
      provider: musicParams.model?.provider ?? null,
      model: musicParams.model?.id ?? null,
      duration: musicParams.duration
    };
  }
  if (mode === "audio") {
    return {
      mode: "audio",
      provider: audioParams.model?.provider ?? null,
      model: audioParams.model?.id ?? null,
      voice: audioParams.voice,
      speed: audioParams.speed,
      audio_format: audioParams.format
    };
  }
  return { mode };
}
