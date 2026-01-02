/**
 * Hook for extracting and caching video thumbnails.
 *
 * Uses HTML5 video element and canvas to extract frames at specific times.
 * Thumbnails are cached in memory (with optional IndexedDB support in future).
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export interface VideoThumbnail {
  /** Time position in seconds */
  time: number;
  /** Image data URL (base64) */
  dataUrl: string;
  /** Width of the thumbnail */
  width: number;
  /** Height of the thumbnail */
  height: number;
}

export interface VideoThumbnailData {
  /** Array of extracted thumbnails */
  thumbnails: VideoThumbnail[];
  /** Duration of the video in seconds */
  duration: number;
  /** Native video width */
  videoWidth: number;
  /** Native video height */
  videoHeight: number;
}

interface ThumbnailCacheEntry {
  data: VideoThumbnailData;
  timestamp: number;
}

// ============================================================================
// Cache
// ============================================================================

// In-memory cache for thumbnail data
const thumbnailCache = new Map<string, ThumbnailCacheEntry>();
const MAX_CACHE_SIZE = 20;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Gets cached thumbnail data
 */
function getCachedThumbnails(url: string): VideoThumbnailData | null {
  const entry = thumbnailCache.get(url);
  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    thumbnailCache.delete(url);
    return null;
  }

  return entry.data;
}

/**
 * Caches thumbnail data
 */
function setCachedThumbnails(url: string, data: VideoThumbnailData): void {
  // Evict old entries if cache is full
  if (thumbnailCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = thumbnailCache.keys().next().value;
    if (oldestKey) {
      thumbnailCache.delete(oldestKey);
    }
  }

  thumbnailCache.set(url, {
    data,
    timestamp: Date.now()
  });
}

// ============================================================================
// Thumbnail Extraction
// ============================================================================

/**
 * Extracts a single frame from a video at a specific time
 */
async function extractFrame(
  video: HTMLVideoElement,
  time: number,
  thumbnailWidth: number
): Promise<VideoThumbnail> {
  return new Promise((resolve, reject) => {
    // Set the time to seek to
    video.currentTime = time;

    const onSeeked = () => {
      try {
        // Calculate thumbnail dimensions maintaining aspect ratio
        const aspectRatio = video.videoWidth / video.videoHeight;
        const width = thumbnailWidth;
        const height = Math.round(width / aspectRatio);

        // Create canvas and draw frame
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get canvas context");
        }

        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);

        resolve({
          time,
          dataUrl,
          width,
          height
        });
      } catch (err) {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        reject(err);
      }
    };

    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Video seek error"));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
  });
}

/**
 * Extracts multiple thumbnails from a video URL
 * Tries with crossOrigin first (for CORS-enabled servers), falls back to without
 */
async function extractThumbnails(
  videoUrl: string,
  numThumbnails: number = 10,
  thumbnailWidth: number = 120
): Promise<VideoThumbnailData> {
  // Try with CORS first (allows canvas operations on cross-origin videos)
  try {
    return await extractThumbnailsWithCORS(videoUrl, numThumbnails, thumbnailWidth, true);
  } catch (corsError) {
    // If CORS fails, try without (may work for same-origin or blob URLs)
    console.warn("CORS-enabled video load failed, trying without crossOrigin:", corsError);
    try {
      return await extractThumbnailsWithCORS(videoUrl, numThumbnails, thumbnailWidth, false);
    } catch (noCorsError) {
      // Both failed, throw the original error
      throw corsError;
    }
  }
}

/**
 * Internal function to extract thumbnails with or without CORS
 */
async function extractThumbnailsWithCORS(
  videoUrl: string,
  numThumbnails: number,
  thumbnailWidth: number,
  useCORS: boolean
): Promise<VideoThumbnailData> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    if (useCORS) {
      video.crossOrigin = "anonymous";
    }
    video.preload = "metadata";
    video.muted = true;

    // Timeout to prevent hanging on slow loads
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Video load timeout: ${videoUrl}`));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.src = "";
      video.load();
    };

    video.addEventListener("loadedmetadata", async () => {
      try {
        const duration = video.duration;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Check if we got valid metadata
        if (!isFinite(duration) || duration <= 0) {
          cleanup();
          reject(new Error("Invalid video duration"));
          return;
        }

        // Calculate time intervals for thumbnails
        const interval = duration / numThumbnails;
        const thumbnails: VideoThumbnail[] = [];

        for (let i = 0; i < numThumbnails; i++) {
          const time = i * interval + interval / 2;
          try {
            const thumbnail = await extractFrame(video, time, thumbnailWidth);
            thumbnails.push(thumbnail);
          } catch (err) {
            // Continue with other frames if one fails
            console.warn(`Failed to extract frame at ${time}s:`, err);
          }
        }

        cleanup();
        
        // If no thumbnails were extracted (likely CORS/tainting issue), reject
        if (thumbnails.length === 0) {
          reject(new Error("No thumbnails could be extracted (possible CORS issue)"));
          return;
        }

        resolve({
          thumbnails,
          duration,
          videoWidth,
          videoHeight
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error(`Failed to load video: ${videoUrl}`));
    });

    video.src = videoUrl;
  });
}

/**
 * Generates placeholder thumbnail data for testing
 */
function generatePlaceholderThumbnails(
  duration: number,
  numThumbnails: number = 10
): VideoThumbnailData {
  const interval = duration / numThumbnails;
  const thumbnails: VideoThumbnail[] = [];

  for (let i = 0; i < numThumbnails; i++) {
    thumbnails.push({
      time: i * interval + interval / 2,
      dataUrl: "", // Empty - will show placeholder
      width: 120,
      height: 68
    });
  }

  return {
    thumbnails,
    duration,
    videoWidth: 1920,
    videoHeight: 1080
  };
}

// ============================================================================
// Hook
// ============================================================================

interface UseVideoThumbnailsOptions {
  /** URL of the video file */
  url: string;
  /** Duration hint (used if URL is empty) */
  durationHint?: number;
  /** Number of thumbnails to extract (default: 10) */
  numThumbnails?: number;
  /** Width of each thumbnail in pixels (default: 120) */
  thumbnailWidth?: number;
  /** Use placeholder data instead of real extraction */
  usePlaceholder?: boolean;
}

interface UseVideoThumbnailsResult {
  /** Thumbnail data */
  thumbnails: VideoThumbnailData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook for extracting video thumbnails
 */
export function useVideoThumbnails(
  options: UseVideoThumbnailsOptions
): UseVideoThumbnailsResult {
  const {
    url,
    durationHint = 10,
    numThumbnails = 10,
    thumbnailWidth = 120,
    usePlaceholder = false
  } = options;

  const [thumbnails, setThumbnails] = useState<VideoThumbnailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortedRef = useRef(false);

  const fetchThumbnails = useCallback(async () => {
    abortedRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      // Use placeholder data if requested or if URL is empty
      if (usePlaceholder || !url) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const placeholderData = generatePlaceholderThumbnails(
          durationHint,
          numThumbnails
        );
        if (!abortedRef.current) {
          setThumbnails(placeholderData);
        }
        return;
      }

      // Check cache first
      const cached = getCachedThumbnails(url);
      if (cached) {
        setThumbnails(cached);
        setIsLoading(false);
        return;
      }

      // Extract thumbnails from video
      const data = await extractThumbnails(url, numThumbnails, thumbnailWidth);

      if (abortedRef.current) return;

      // Cache the result
      setCachedThumbnails(url, data);

      setThumbnails(data);
    } catch (err) {
      if (abortedRef.current) return;

      console.error("Failed to extract thumbnails:", err);
      setError(err instanceof Error ? err.message : "Failed to load video");

      // Fall back to placeholder thumbnails
      const placeholderData = generatePlaceholderThumbnails(
        durationHint,
        numThumbnails
      );
      setThumbnails(placeholderData);
    } finally {
      if (!abortedRef.current) {
        setIsLoading(false);
      }
    }
  }, [url, durationHint, numThumbnails, thumbnailWidth, usePlaceholder]);

  useEffect(() => {
    fetchThumbnails();

    return () => {
      abortedRef.current = true;
    };
  }, [fetchThumbnails]);

  return {
    thumbnails,
    isLoading,
    error,
    refetch: fetchThumbnails
  };
}

export default useVideoThumbnails;

// Export utility functions for external use
export { extractThumbnails, generatePlaceholderThumbnails, getCachedThumbnails };
