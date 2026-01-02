/**
 * Hook for managing audio playback for timeline preview.
 *
 * Handles loading, playing, and syncing audio elements with the timeline playhead.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clip, Track } from "../../stores/TimelineStore";

// ============================================================================
// Types
// ============================================================================

interface AudioEntry {
  audio: HTMLAudioElement;
  clipId: string;
  sourceUrl: string;
  loading: boolean;
  error: string | null;
}

interface UseAudioPlaybackOptions {
  /** All tracks from the project */
  tracks: Track[];
  /** Current playhead position in seconds */
  playheadPosition: number;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Master volume (0-1) */
  masterVolume: number;
  /** Whether audio is muted */
  isMuted: boolean;
}

interface UseAudioPlaybackResult {
  /** Number of audio clips currently playing */
  activeAudioCount: number;
}

// ============================================================================
// Audio Cache
// ============================================================================

const audioCache = new Map<string, HTMLAudioElement>();
const MAX_CACHE_SIZE = 10;

function getCachedAudio(url: string): HTMLAudioElement | null {
  return audioCache.get(url) ?? null;
}

function setCachedAudio(url: string, audio: HTMLAudioElement): void {
  if (audioCache.size >= MAX_CACHE_SIZE) {
    // Remove and cleanup oldest entry
    const firstKey = audioCache.keys().next().value;
    if (firstKey) {
      const oldAudio = audioCache.get(firstKey);
      if (oldAudio) {
        oldAudio.pause();
        oldAudio.src = "";
      }
      audioCache.delete(firstKey);
    }
  }
  audioCache.set(url, audio);
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing audio playback synced with timeline
 */
export function useAudioPlayback(
  options: UseAudioPlaybackOptions
): UseAudioPlaybackResult {
  const { tracks, playheadPosition, isPlaying, masterVolume, isMuted } = options;

  const [audioEntries, setAudioEntries] = useState<Map<string, AudioEntry>>(
    new Map()
  );
  const loadingRef = useRef<Set<string>>(new Set());
  const wasPlayingRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);

  // Get all audio clips from tracks
  const audioClips = useMemo(() => {
    const clips: { clip: Clip; track: Track }[] = [];
    for (const track of tracks) {
      if (track.type !== "audio" || track.muted) {
        continue;
      }
      for (const clip of track.clips) {
        clips.push({ clip, track });
      }
    }
    return clips;
  }, [tracks]);

  // Load audio for a clip
  const loadAudio = useCallback(async (clip: Clip) => {
    if (!clip.sourceUrl || loadingRef.current.has(clip.id)) {
      return;
    }

    // Check cache first
    const cached = getCachedAudio(clip.sourceUrl);
    if (cached) {
      setAudioEntries((prev) => {
        const next = new Map(prev);
        next.set(clip.id, {
          audio: cached,
          clipId: clip.id,
          sourceUrl: clip.sourceUrl,
          loading: false,
          error: null
        });
        return next;
      });
      return;
    }

    // Mark as loading
    loadingRef.current.add(clip.id);

    try {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      await new Promise<void>((resolve, reject) => {
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio: ${clip.sourceUrl}`));
        audio.src = clip.sourceUrl;
        audio.load();
      });

      // Cache the loaded audio
      setCachedAudio(clip.sourceUrl, audio);

      setAudioEntries((prev) => {
        const next = new Map(prev);
        next.set(clip.id, {
          audio,
          clipId: clip.id,
          sourceUrl: clip.sourceUrl,
          loading: false,
          error: null
        });
        return next;
      });
    } catch (err) {
      setAudioEntries((prev) => {
        const next = new Map(prev);
        next.set(clip.id, {
          audio: new Audio(),
          clipId: clip.id,
          sourceUrl: clip.sourceUrl,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load audio"
        });
        return next;
      });
    } finally {
      loadingRef.current.delete(clip.id);
    }
  }, []);

  // Load audio for all audio clips
  useEffect(() => {
    for (const { clip } of audioClips) {
      if (!audioEntries.has(clip.id)) {
        loadAudio(clip);
      }
    }
  }, [audioClips, audioEntries, loadAudio]);

  // Helper to get clip time from playhead position
  const getClipTime = useCallback((clip: Clip, playhead: number): number => {
    return clip.inPoint + (playhead - clip.startTime) * clip.speed;
  }, []);

  // Helper to check if clip is at playhead
  const isClipAtPlayhead = useCallback((clip: Clip, playhead: number): boolean => {
    const clipEnd = clip.startTime + clip.duration;
    return playhead >= clip.startTime && playhead < clipEnd;
  }, []);

  // Handle play/pause state changes
  useEffect(() => {
    const justStartedPlaying = isPlaying && !wasPlayingRef.current;
    const justStoppedPlaying = !isPlaying && wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;

    if (justStartedPlaying) {
      // Starting playback - sync all audio to current position and start
      for (const { clip, track } of audioClips) {
        if (!isClipAtPlayhead(clip, playheadPosition)) {
          continue;
        }

        const entry = audioEntries.get(clip.id);
        if (!entry || entry.loading || entry.error) {
          continue;
        }

        const audio = entry.audio;
        const clipTime = getClipTime(clip, playheadPosition);

        // Set volume
        const clipVolume = clip.volume ?? 1;
        const trackVolume = track.volume ?? 1;
        const effectiveVolume = isMuted ? 0 : masterVolume * trackVolume * clipVolume;
        audio.volume = Math.max(0, Math.min(1, effectiveVolume));

        // Seek to correct position and play
        audio.currentTime = clipTime;
        audio.play().catch(() => {
          // Autoplay may be blocked
        });
      }
    } else if (justStoppedPlaying) {
      // Stopping playback - pause all audio
      for (const [, entry] of audioEntries) {
        if (entry.audio && !entry.audio.paused) {
          entry.audio.pause();
        }
      }
    }
  }, [isPlaying, audioClips, audioEntries, playheadPosition, masterVolume, isMuted, getClipTime, isClipAtPlayhead]);

  // Handle seeking (significant playhead jumps) during playback
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    // Detect if this is a seek (big jump in position)
    const timeSinceLastSync = Math.abs(playheadPosition - lastSeekTimeRef.current);
    
    // If more than 0.5 seconds jump, treat as a seek
    if (timeSinceLastSync > 0.5) {
      for (const { clip, track } of audioClips) {
        const entry = audioEntries.get(clip.id);
        if (!entry || entry.loading || entry.error) {
          continue;
        }

        const audio = entry.audio;
        const shouldBePlaying = isClipAtPlayhead(clip, playheadPosition);

        if (shouldBePlaying) {
          const clipTime = getClipTime(clip, playheadPosition);
          
          // Update volume
          const clipVolume = clip.volume ?? 1;
          const trackVolume = track.volume ?? 1;
          const effectiveVolume = isMuted ? 0 : masterVolume * trackVolume * clipVolume;
          audio.volume = Math.max(0, Math.min(1, effectiveVolume));

          // Seek and ensure playing
          audio.currentTime = clipTime;
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        } else {
          // Should not be playing
          if (!audio.paused) {
            audio.pause();
          }
        }
      }
    }

    lastSeekTimeRef.current = playheadPosition;
  }, [playheadPosition, isPlaying, audioClips, audioEntries, masterVolume, isMuted, getClipTime, isClipAtPlayhead]);

  // Handle clips entering/exiting playhead during continuous playback
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    for (const { clip, track } of audioClips) {
      const entry = audioEntries.get(clip.id);
      if (!entry || entry.loading || entry.error) {
        continue;
      }

      const audio = entry.audio;
      const shouldBePlaying = isClipAtPlayhead(clip, playheadPosition);

      if (shouldBePlaying && audio.paused) {
        // Clip just entered playhead range - start it
        const clipTime = getClipTime(clip, playheadPosition);
        
        const clipVolume = clip.volume ?? 1;
        const trackVolume = track.volume ?? 1;
        const effectiveVolume = isMuted ? 0 : masterVolume * trackVolume * clipVolume;
        audio.volume = Math.max(0, Math.min(1, effectiveVolume));

        audio.currentTime = clipTime;
        audio.play().catch(() => {});
      } else if (!shouldBePlaying && !audio.paused) {
        // Clip just exited playhead range - stop it
        audio.pause();
      }
    }
  }, [playheadPosition, isPlaying, audioClips, audioEntries, masterVolume, isMuted, getClipTime, isClipAtPlayhead]);

  // Update volume when master volume or mute changes
  useEffect(() => {
    for (const { clip, track } of audioClips) {
      const entry = audioEntries.get(clip.id);
      if (!entry || entry.loading || entry.error) {
        continue;
      }

      const clipVolume = clip.volume ?? 1;
      const trackVolume = track.volume ?? 1;
      const effectiveVolume = isMuted ? 0 : masterVolume * trackVolume * clipVolume;
      entry.audio.volume = Math.max(0, Math.min(1, effectiveVolume));
    }
  }, [masterVolume, isMuted, audioClips, audioEntries]);

  // Count active audio clips
  const activeAudioCount = useMemo(() => {
    let count = 0;
    for (const { clip } of audioClips) {
      if (isClipAtPlayhead(clip, playheadPosition)) {
        count++;
      }
    }
    return count;
  }, [audioClips, playheadPosition, isClipAtPlayhead]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of audioEntries) {
        if (entry.audio) {
          entry.audio.pause();
        }
      }
    };
  }, [audioEntries]);

  return {
    activeAudioCount
  };
}

export default useAudioPlayback;
