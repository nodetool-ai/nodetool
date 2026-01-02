/**
 * Hook for managing media sources for timeline preview.
 *
 * Handles loading and caching of image and video elements for clips,
 * providing ready-to-render sources for the preview window.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Clip } from "../../stores/TimelineStore";

// ============================================================================
// Types
// ============================================================================

export type MediaSource = HTMLImageElement | HTMLVideoElement | null;

export interface MediaSourceEntry {
  source: MediaSource;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Cache
// ============================================================================

// Cache for loaded media elements
const mediaCache = new Map<string, MediaSource>();
const MAX_CACHE_SIZE = 20;

function getCachedMedia(url: string): MediaSource {
  return mediaCache.get(url) ?? null;
}

function setCachedMedia(url: string, source: MediaSource): void {
  if (mediaCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = mediaCache.keys().next().value;
    if (firstKey) {
      mediaCache.delete(firstKey);
    }
  }
  if (source) {
    mediaCache.set(url, source);
  }
}

// ============================================================================
// Media Loading
// ============================================================================

/**
 * Load an image element from URL
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

    img.src = url;
  });
}

/**
 * Load a video element from URL
 */
async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true; // Must be muted for autoplay to work
    video.playsInline = true;

    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error(`Failed to load video: ${url}`));

    video.src = url;
    video.load();
  });
}

// ============================================================================
// Hook
// ============================================================================

interface UseMediaSourcesOptions {
  /** Array of clips to load media for */
  clips: Clip[];
}

interface UseMediaSourcesResult {
  /** Get the media source for a clip */
  getSource: (clipId: string) => MediaSource;
  /** Check if a clip's media is loading */
  isLoading: (clipId: string) => boolean;
  /** Get error for a clip */
  getError: (clipId: string) => string | null;
  /** Preload media for a clip */
  preload: (clip: Clip) => void;
  /** Seek video to specific time */
  seekVideo: (clipId: string, time: number) => void;
}

/**
 * Hook for managing media sources for timeline preview
 */
export function useMediaSources(
  options: UseMediaSourcesOptions
): UseMediaSourcesResult {
  const { clips } = options;

  const [sources, setSources] = useState<Map<string, MediaSourceEntry>>(
    new Map()
  );
  const loadingRef = useRef<Set<string>>(new Set());

  // Load media for a clip
  const loadClipMedia = useCallback(async (clip: Clip) => {
    if (!clip.sourceUrl || loadingRef.current.has(clip.id)) {
      return;
    }

    // Check cache first
    const cached = getCachedMedia(clip.sourceUrl);
    if (cached) {
      setSources((prev) => {
        const next = new Map(prev);
        next.set(clip.id, { source: cached, loading: false, error: null });
        return next;
      });
      return;
    }

    // Mark as loading
    loadingRef.current.add(clip.id);
    setSources((prev) => {
      const next = new Map(prev);
      next.set(clip.id, { source: null, loading: true, error: null });
      return next;
    });

    try {
      let source: MediaSource = null;

      if (clip.type === "image") {
        source = await loadImage(clip.sourceUrl);
      } else if (clip.type === "video") {
        source = await loadVideo(clip.sourceUrl);
      }

      // Cache the loaded media
      setCachedMedia(clip.sourceUrl, source);

      setSources((prev) => {
        const next = new Map(prev);
        next.set(clip.id, { source, loading: false, error: null });
        return next;
      });
    } catch (err) {
      setSources((prev) => {
        const next = new Map(prev);
        next.set(clip.id, {
          source: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load media"
        });
        return next;
      });
    } finally {
      loadingRef.current.delete(clip.id);
    }
  }, []);

  // Load media for all clips
  useEffect(() => {
    for (const clip of clips) {
      if (clip.type === "image" || clip.type === "video") {
        loadClipMedia(clip);
      }
    }
  }, [clips, loadClipMedia]);

  // Get source for a clip
  const getSource = useCallback(
    (clipId: string): MediaSource => {
      return sources.get(clipId)?.source ?? null;
    },
    [sources]
  );

  // Check if loading
  const isLoading = useCallback(
    (clipId: string): boolean => {
      return sources.get(clipId)?.loading ?? false;
    },
    [sources]
  );

  // Get error
  const getError = useCallback(
    (clipId: string): string | null => {
      return sources.get(clipId)?.error ?? null;
    },
    [sources]
  );

  // Preload clip media
  const preload = useCallback(
    (clip: Clip) => {
      loadClipMedia(clip);
    },
    [loadClipMedia]
  );

  // Seek video to specific time
  const seekVideo = useCallback(
    (clipId: string, time: number) => {
      const entry = sources.get(clipId);
      if (entry?.source instanceof HTMLVideoElement) {
        entry.source.currentTime = time;
      }
    },
    [sources]
  );

  return {
    getSource,
    isLoading,
    getError,
    preload,
    seekVideo
  };
}

export default useMediaSources;
