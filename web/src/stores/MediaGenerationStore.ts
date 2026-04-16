/**
 * MediaGenerationStore
 *
 * Holds the "media-generation mode" selection and per-mode parameters used by
 * the chat composer to author text-to-image and text-to-video requests. The
 * values here are piped through GlobalChatStore.sendMessage as extra metadata
 * on the chat_message payload so the server can route the prompt to
 * provider.textToImage / provider.textToVideo instead of a plain LLM round.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ImageModelValue, Message, TTSModelValue } from "./ApiTypes";

/**
 * Media-generation request metadata that can be attached to outgoing chat
 * messages. The backend looks for this field on `chat_message` payloads and
 * routes the message to provider.textToImage / provider.textToVideo /
 * provider.imageToImage / provider.imageToVideo / provider.textToSpeech when
 * `mode` is a media mode. Mirrors the Python-side `MediaGenerationRequest`.
 */
export interface MediaGenerationRequest {
  mode: MediaMode;
  provider?: string | null;
  model?: string | null;
  width?: number | null;
  height?: number | null;
  aspect_ratio?: string | null;
  resolution?: string | null;
  variations?: number | null;
  duration?: number | null;
  voice?: string | null;
  speed?: number | null;
  audio_format?: string | null;
  strength?: number | null;
  num_inference_steps?: number | null;
  source_asset_id?: string | null;
  extras?: Record<string, unknown> | null;
}

/**
 * Extended outgoing chat message that carries media generation metadata.
 * The auto-generated `Message` type does not include the `media_generation`
 * field; this intersection layers it on so TypeScript preserves it through
 * the send pipeline.
 */
export type ChatOutgoingMessage = Message & {
  media_generation?: MediaGenerationRequest | null;
};

export type MediaMode =
  | "chat"
  | "image"
  | "image_edit"
  | "video"
  | "image_to_video"
  | "audio"
  | "audio_to_video"
  | "retake"
  | "extend"
  | "motion_control";

export type ImageResolution = "1K" | "2K" | "4K";
export type VideoResolution = "1080p" | "1440p" | "4K";
export type AudioFormat = "mp3" | "wav" | "pcm" | "opus";

export interface AspectRatioOption {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const IMAGE_ASPECT_RATIOS: AspectRatioOption[] = [
  { id: "21:9", label: "21:9", width: 21, height: 9 },
  { id: "16:9", label: "16:9", width: 16, height: 9 },
  { id: "3:2", label: "3:2", width: 3, height: 2 },
  { id: "7:5", label: "7:5", width: 7, height: 5 },
  { id: "4:3", label: "4:3", width: 4, height: 3 },
  { id: "5:4", label: "5:4", width: 5, height: 4 },
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "9:16", label: "9:16", width: 9, height: 16 },
  { id: "2:3", label: "2:3", width: 2, height: 3 },
  { id: "5:7", label: "5:7", width: 5, height: 7 },
  { id: "3:4", label: "3:4", width: 3, height: 4 },
  { id: "4:5", label: "4:5", width: 4, height: 5 }
];

export const VIDEO_ASPECT_RATIOS: AspectRatioOption[] = [
  { id: "21:9", label: "21:9", width: 21, height: 9 },
  { id: "16:9", label: "16:9", width: 16, height: 9 },
  { id: "4:3", label: "4:3", width: 4, height: 3 },
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "9:16", label: "9:16", width: 9, height: 16 },
  { id: "3:4", label: "3:4", width: 3, height: 4 }
];

export const IMAGE_RESOLUTIONS: ImageResolution[] = ["1K", "2K", "4K"];
export const VIDEO_RESOLUTIONS: VideoResolution[] = ["1080p", "1440p", "4K"];
export const VIDEO_DURATIONS: number[] = [2, 3, 4, 5, 6, 8];
export const IMAGE_VARIATIONS: number[] = [1, 2, 4, 6, 8];

/** Common voice ids surfaced as defaults across providers. */
export const DEFAULT_TTS_VOICES: string[] = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer"
];

/** Speed presets (multiplier applied to natural speech pace). */
export const AUDIO_SPEEDS: number[] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

/** Output container formats supported by the backend audio path. */
export const AUDIO_FORMATS: AudioFormat[] = ["mp3", "wav", "opus", "pcm"];

/** Strength controls how much an image-to-image edit deviates from the source. */
export const IMAGE_EDIT_STRENGTHS: number[] = [0.25, 0.5, 0.65, 0.75, 0.85, 1.0];

/** Steps presets for image-to-image / image-to-video samplers. */
export const INFERENCE_STEPS: number[] = [10, 20, 30, 40, 50];

/**
 * Base short edge in pixels for each named resolution.
 * Used with aspect ratio to derive width/height for provider calls.
 */
export const IMAGE_RESOLUTION_TO_PIXELS: Record<ImageResolution, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096
};

export const VIDEO_RESOLUTION_TO_PIXELS: Record<VideoResolution, number> = {
  "1080p": 1080,
  "1440p": 1440,
  "4K": 2160
};

export interface ImageGenerationParams {
  model: ImageModelValue | null;
  resolution: ImageResolution;
  aspectRatio: string;
  variations: number;
}

export interface VideoModelSelection {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

export interface VideoGenerationParams {
  model: VideoModelSelection | null;
  resolution: VideoResolution;
  aspectRatio: string;
  duration: number;
}

export interface AudioGenerationParams {
  model: TTSModelValue | null;
  voice: string;
  speed: number;
  format: AudioFormat;
}

export interface ImageEditParams {
  model: ImageModelValue | null;
  resolution: ImageResolution;
  aspectRatio: string;
  strength: number;
  numInferenceSteps: number;
  variations: number;
}

export interface ImageToVideoGenerationParams {
  model: VideoModelSelection | null;
  resolution: VideoResolution;
  aspectRatio: string;
  duration: number;
  numInferenceSteps: number;
}

export interface MediaGenerationState {
  mode: MediaMode;
  image: ImageGenerationParams;
  imageEdit: ImageEditParams;
  video: VideoGenerationParams;
  imageToVideo: ImageToVideoGenerationParams;
  audio: AudioGenerationParams;
  setMode: (mode: MediaMode) => void;
  setImageParams: (params: Partial<ImageGenerationParams>) => void;
  setImageEditParams: (params: Partial<ImageEditParams>) => void;
  setVideoParams: (params: Partial<VideoGenerationParams>) => void;
  setImageToVideoParams: (params: Partial<ImageToVideoGenerationParams>) => void;
  setAudioParams: (params: Partial<AudioGenerationParams>) => void;
}

const DEFAULT_IMAGE_PARAMS: ImageGenerationParams = {
  model: null,
  resolution: "1K",
  aspectRatio: "16:9",
  variations: 4
};

const DEFAULT_VIDEO_PARAMS: VideoGenerationParams = {
  model: null,
  resolution: "1080p",
  aspectRatio: "16:9",
  duration: 8
};

const DEFAULT_AUDIO_PARAMS: AudioGenerationParams = {
  model: null,
  voice: "alloy",
  speed: 1.0,
  format: "mp3"
};

const DEFAULT_IMAGE_EDIT_PARAMS: ImageEditParams = {
  model: null,
  resolution: "1K",
  aspectRatio: "1:1",
  strength: 0.65,
  numInferenceSteps: 30,
  variations: 1
};

const DEFAULT_IMAGE_TO_VIDEO_PARAMS: ImageToVideoGenerationParams = {
  model: null,
  resolution: "1080p",
  aspectRatio: "16:9",
  duration: 4,
  numInferenceSteps: 30
};

const useMediaGenerationStore = create<MediaGenerationState>()(
  persist(
    (set) => ({
      mode: "chat",
      image: DEFAULT_IMAGE_PARAMS,
      imageEdit: DEFAULT_IMAGE_EDIT_PARAMS,
      video: DEFAULT_VIDEO_PARAMS,
      imageToVideo: DEFAULT_IMAGE_TO_VIDEO_PARAMS,
      audio: DEFAULT_AUDIO_PARAMS,
      setMode: (mode) => set({ mode }),
      setImageParams: (params) =>
        set((state) => ({ image: { ...state.image, ...params } })),
      setImageEditParams: (params) =>
        set((state) => ({ imageEdit: { ...state.imageEdit, ...params } })),
      setVideoParams: (params) =>
        set((state) => ({ video: { ...state.video, ...params } })),
      setImageToVideoParams: (params) =>
        set((state) => ({
          imageToVideo: { ...state.imageToVideo, ...params }
        })),
      setAudioParams: (params) =>
        set((state) => ({ audio: { ...state.audio, ...params } }))
    }),
    {
      name: "nodetool-media-generation",
      version: 2,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<MediaGenerationState>;
        if (version < 2) {
          return {
            ...state,
            audio: { ...DEFAULT_AUDIO_PARAMS, ...(state.audio ?? {}) },
            imageEdit: {
              ...DEFAULT_IMAGE_EDIT_PARAMS,
              ...(state.imageEdit ?? {})
            },
            imageToVideo: {
              ...DEFAULT_IMAGE_TO_VIDEO_PARAMS,
              ...(state.imageToVideo ?? {})
            }
          } as MediaGenerationState;
        }
        return state as MediaGenerationState;
      }
    }
  )
);

/**
 * Compute width/height pixel pair for the named image resolution + aspect.
 * The shorter edge equals the resolution's base pixels.
 */
export function resolveImageSize(
  resolution: ImageResolution,
  aspectRatio: string
): { width: number; height: number } {
  const base = IMAGE_RESOLUTION_TO_PIXELS[resolution];
  const preset = IMAGE_ASPECT_RATIOS.find((a) => a.id === aspectRatio);
  if (!preset) {
    return { width: base, height: base };
  }
  const { width: aw, height: ah } = preset;
  if (aw >= ah) {
    const height = base;
    const width = Math.round((height * aw) / ah);
    return { width, height };
  }
  const width = base;
  const height = Math.round((width * ah) / aw);
  return { width, height };
}

export default useMediaGenerationStore;
