/**
 * Hook for handling asset drops onto the timeline.
 * Converts assets to timeline clips based on their content type.
 */

import { useCallback } from "react";
import { Asset } from "../../stores/ApiTypes";
import useTimelineStore, { ClipType, TrackType, Clip } from "../../stores/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";

// Default duration for image clips (seconds)
const DEFAULT_IMAGE_DURATION = 5;

// Default duration when media duration can't be determined
const DEFAULT_MEDIA_DURATION = 30;

// Media can be extended up to source duration - use high default when unknown
const MAX_SOURCE_DURATION = 3600; // 1 hour - effectively unlimited for most use cases

/**
 * Gets the actual duration of an audio or video file
 */
export async function getMediaDuration(url: string, type: "audio" | "video"): Promise<number> {
  return new Promise((resolve) => {
    if (type === "audio") {
      const audio = new Audio();
      audio.preload = "metadata";
      
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        audio.src = ""; // Cleanup
        resolve(isFinite(duration) ? duration : MAX_SOURCE_DURATION);
      };
      
      audio.onerror = () => {
        resolve(MAX_SOURCE_DURATION); // Fallback on error
      };
      
      // Timeout fallback
      setTimeout(() => resolve(MAX_SOURCE_DURATION), 5000);
      
      audio.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      
      video.onloadedmetadata = () => {
        const duration = video.duration;
        video.src = ""; // Cleanup
        resolve(isFinite(duration) ? duration : MAX_SOURCE_DURATION);
      };
      
      video.onerror = () => {
        resolve(MAX_SOURCE_DURATION); // Fallback on error
      };
      
      // Timeout fallback
      setTimeout(() => resolve(MAX_SOURCE_DURATION), 5000);
      
      video.src = url;
    }
  });
}

/**
 * Determines the clip type from an asset's content_type
 */
export function getClipTypeFromAsset(asset: Asset): ClipType | null {
  const contentType = asset.content_type || "";
  
  if (contentType.startsWith("video/")) {
    return "video";
  }
  if (contentType.startsWith("audio/")) {
    return "audio";
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }
  
  return null;
}

/**
 * Determines the track type from a clip type
 */
export function getTrackTypeFromClipType(clipType: ClipType): TrackType {
  return clipType as TrackType;
}

/**
 * Creates clip data from an asset
 */
export function createClipFromAsset(
  asset: Asset,
  clipType: ClipType,
  startTime: number = 0,
  options?: {
    duration?: number;
    sourceDuration?: number;
  }
): Omit<Clip, "id"> {
  const { duration, sourceDuration: providedSourceDuration } = options ?? {};
  
  // For images, use short default duration but allow unlimited source
  // For audio/video, use the actual source duration if available
  const isImage = clipType === "image";
  const actualSourceDuration = providedSourceDuration ?? MAX_SOURCE_DURATION;
  
  // Clip duration: for images use default, for media use source duration or default
  const clipDuration = duration ?? (isImage 
    ? DEFAULT_IMAGE_DURATION 
    : Math.min(actualSourceDuration, DEFAULT_MEDIA_DURATION)
  );
  
  return {
    type: clipType,
    sourceRef: null, // Could be enhanced to use proper refs
    sourceUrl: asset.get_url || "",
    name: asset.name || "Untitled",
    startTime,
    duration: clipDuration,
    inPoint: 0,
    outPoint: clipDuration,
    sourceDuration: isImage ? MAX_SOURCE_DURATION : actualSourceDuration,
    speed: 1,
    volume: clipType === "audio" ? 1 : undefined,
    opacity: clipType === "video" || clipType === "image" ? 1 : undefined
  };
}

/**
 * Extracts asset from a drag event's dataTransfer
 */
export function getAssetFromDragEvent(e: React.DragEvent): Asset | null {
  const assetJSON = e.dataTransfer.getData("asset");
  if (!assetJSON) {
    return null;
  }
  
  try {
    return JSON.parse(assetJSON) as Asset;
  } catch {
    return null;
  }
}

/**
 * Hook for handling asset drops onto the timeline
 */
export function useTimelineAssetDrop() {
  const { addTrack, addClip, project } = useTimelineStore();
  const { addNotification } = useNotificationStore();

  /**
   * Handles dropping an asset onto a specific track
   */
  const handleDropOnTrack = useCallback(
    async (e: React.DragEvent, trackId: string, dropTimePosition: number) => {
      e.preventDefault();
      e.stopPropagation();

      const asset = getAssetFromDragEvent(e);
      if (!asset) {
        return false;
      }

      const clipType = getClipTypeFromAsset(asset);
      if (!clipType) {
        addNotification({
          type: "warning",
          alert: true,
          content: `Cannot add ${asset.content_type} to timeline. Only video, audio, and image files are supported.`
        });
        return false;
      }

      // Check if the clip type matches the track type
      const track = project?.tracks.find(t => t.id === trackId);
      if (track && track.type !== clipType) {
        addNotification({
          type: "warning",
          alert: true,
          content: `Cannot add ${clipType} clip to ${track.type} track.`
        });
        return false;
      }

      // Get actual media duration for audio/video
      let sourceDuration: number | undefined;
      if (clipType === "audio" || clipType === "video") {
        const url = asset.get_url;
        if (url) {
          sourceDuration = await getMediaDuration(url, clipType);
        }
      }

      const clipData = createClipFromAsset(asset, clipType, dropTimePosition, { sourceDuration });
      const clipId = addClip(trackId, clipData);

      if (clipId) {
        addNotification({
          type: "success",
          alert: false,
          content: `Added "${asset.name}" to timeline`
        });
        return true;
      } else {
        addNotification({
          type: "warning",
          alert: true,
          content: "Could not add clip. There may be an overlapping clip at this position."
        });
        return false;
      }
    },
    [addClip, addNotification, project]
  );

  /**
   * Handles dropping an asset onto the timeline (creates track if needed)
   */
  const handleDropOnTimeline = useCallback(
    async (e: React.DragEvent, dropTimePosition: number = 0) => {
      e.preventDefault();
      e.stopPropagation();

      const asset = getAssetFromDragEvent(e);
      if (!asset) {
        return false;
      }

      const clipType = getClipTypeFromAsset(asset);
      if (!clipType) {
        addNotification({
          type: "warning",
          alert: true,
          content: `Cannot add ${asset.content_type} to timeline. Only video, audio, and image files are supported.`
        });
        return false;
      }

      const trackType = getTrackTypeFromClipType(clipType);
      
      // Find an existing compatible track or create a new one
      let targetTrackId = project?.tracks.find(
        t => t.type === trackType && !t.locked
      )?.id;

      if (!targetTrackId) {
        // Create a new track
        targetTrackId = addTrack(trackType);
        if (!targetTrackId) {
          addNotification({
            type: "error",
            alert: true,
            content: "Failed to create track for the dropped asset."
          });
          return false;
        }
      }

      // Get actual media duration for audio/video
      let sourceDuration: number | undefined;
      if (clipType === "audio" || clipType === "video") {
        const url = asset.get_url;
        if (url) {
          sourceDuration = await getMediaDuration(url, clipType);
        }
      }

      const clipData = createClipFromAsset(asset, clipType, dropTimePosition, { sourceDuration });
      const clipId = addClip(targetTrackId, clipData);

      if (clipId) {
        addNotification({
          type: "success",
          alert: false,
          content: `Added "${asset.name}" to timeline`
        });
        return true;
      } else {
        addNotification({
          type: "warning",
          alert: true,
          content: "Could not add clip. There may be an overlapping clip at this position."
        });
        return false;
      }
    },
    [addClip, addTrack, addNotification, project]
  );

  /**
   * Checks if a drag event contains a compatible asset
   */
  const canAcceptDrop = useCallback((e: React.DragEvent): boolean => {
    // Check if the drag contains asset data
    const types = e.dataTransfer.types;
    return types.includes("asset") || types.includes("application/json");
  }, []);

  /**
   * Drag over handler - prevents default to allow drop
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, [canAcceptDrop]);

  /**
   * Drag enter handler for visual feedback
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
    }
  }, [canAcceptDrop]);

  /**
   * Drag leave handler
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return {
    handleDropOnTrack,
    handleDropOnTimeline,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    canAcceptDrop
  };
}

export default useTimelineAssetDrop;

