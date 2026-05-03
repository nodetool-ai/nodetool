/**
 * MediaGenerationStore — mobile version.
 *
 * Mirrors the web MediaGenerationStore but simplified for mobile.
 * Holds the mode (chat / image / video) and per-mode parameters.
 * Persisted via zustand/persist + AsyncStorage.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MediaMode = 'chat' | 'image' | 'video';

export type ImageResolution = '1K' | '2K' | '4K';
export type VideoResolution = '1080p' | '1440p' | '4K';

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
}

export interface AspectRatioOption {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const IMAGE_ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
  { id: '3:4', label: '3:4', width: 3, height: 4 },
];

export const VIDEO_ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
];

export const IMAGE_RESOLUTIONS: ImageResolution[] = ['1K', '2K', '4K'];
export const VIDEO_RESOLUTIONS: VideoResolution[] = ['1080p', '1440p', '4K'];
export const VIDEO_DURATIONS: number[] = [2, 3, 4, 5, 6, 8];
export const IMAGE_VARIATIONS: number[] = [1, 2, 4];

const IMAGE_RESOLUTION_TO_PIXELS: Record<ImageResolution, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

export interface ImageGenerationParams {
  resolution: ImageResolution;
  aspectRatio: string;
  variations: number;
}

export interface VideoGenerationParams {
  resolution: VideoResolution;
  aspectRatio: string;
  duration: number;
}

interface MediaGenerationState {
  mode: MediaMode;
  image: ImageGenerationParams;
  video: VideoGenerationParams;
  setMode: (mode: MediaMode) => void;
  setImageParams: (params: Partial<ImageGenerationParams>) => void;
  setVideoParams: (params: Partial<VideoGenerationParams>) => void;
}

const DEFAULT_IMAGE_PARAMS: ImageGenerationParams = {
  resolution: '1K',
  aspectRatio: '1:1',
  variations: 1,
};

const DEFAULT_VIDEO_PARAMS: VideoGenerationParams = {
  resolution: '1080p',
  aspectRatio: '16:9',
  duration: 5,
};

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

export const useMediaGenerationStore = create<MediaGenerationState>()(
  persist(
    (set) => ({
      mode: 'chat',
      image: DEFAULT_IMAGE_PARAMS,
      video: DEFAULT_VIDEO_PARAMS,
      setMode: (mode) => set({ mode }),
      setImageParams: (params) =>
        set((state) => ({ image: { ...state.image, ...params } })),
      setVideoParams: (params) =>
        set((state) => ({ video: { ...state.video, ...params } })),
    }),
    {
      name: 'nodetool-mobile-media-generation',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
