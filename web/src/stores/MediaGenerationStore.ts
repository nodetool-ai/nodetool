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
import type { ImageModelValue, Message } from "./ApiTypes";

/**
 * Media-generation request metadata that can be attached to outgoing chat
 * messages. The backend looks for this field on `chat_message` payloads and
 * routes the message to provider.textToImage / provider.textToVideo when
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
  | "video"
  | "audio_to_video"
  | "retake"
  | "extend"
  | "motion_control";

export type ImageResolution = "1K" | "2K" | "4K";
export type VideoResolution = "1080p" | "1440p" | "4K";

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

export interface MediaGenerationState {
  mode: MediaMode;
  image: ImageGenerationParams;
  video: VideoGenerationParams;
  setMode: (mode: MediaMode) => void;
  setImageParams: (params: Partial<ImageGenerationParams>) => void;
  setVideoParams: (params: Partial<VideoGenerationParams>) => void;
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

const useMediaGenerationStore = create<MediaGenerationState>()(
  persist(
    (set) => ({
      mode: "chat",
      image: DEFAULT_IMAGE_PARAMS,
      video: DEFAULT_VIDEO_PARAMS,
      setMode: (mode) => set({ mode }),
      setImageParams: (params) =>
        set((state) => ({ image: { ...state.image, ...params } })),
      setVideoParams: (params) =>
        set((state) => ({ video: { ...state.video, ...params } }))
    }),
    {
      name: "nodetool-media-generation",
      version: 1
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
