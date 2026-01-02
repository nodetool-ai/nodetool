/**
 * Hook for managing audio playback for timeline preview.
 *
 * Handles loading, playing, and syncing audio elements with the timeline playhead.
 */

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
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
  /** Directly mute/unmute all audio - call this from click handler to bypass React batching */
  setMutedImmediate: (muted: boolean) => void;
}

// ============================================================================
// Audio Cache - keyed by CLIP ID (not URL) to avoid sharing between split clips
// ============================================================================

const audioCache = new Map<string, HTMLAudioElement>();
const MAX_CACHE_SIZE = 20;

function getCachedAudio(clipId: string): HTMLAudioElement | null {
  return audioCache.get(clipId) ?? null;
}

function setCachedAudio(clipId: string, audio: HTMLAudioElement): void {
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
  audioCache.set(clipId, audio);
}

function removeCachedAudio(clipId: string): void {
  const audio = audioCache.get(clipId);
  if (audio) {
    audio.pause();
    audio.src = "";
    audioCache.delete(clipId);
  }
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
  
  // Keep mute state in a ref for immediate access during playback
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;

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

  // Load audio for a clip - each clip gets its own Audio element
  const loadAudio = useCallback(async (clip: Clip) => {
    if (!clip.sourceUrl || loadingRef.current.has(clip.id)) {
      return;
    }

    // Check cache by clip ID (not URL - split clips need separate elements)
    const cached = getCachedAudio(clip.id);
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

      // Cache by clip ID so each clip has its own audio element
      setCachedAudio(clip.id, audio);

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

  // Clean up audio entries for clips that no longer exist
  useEffect(() => {
    const currentClipIds = new Set(audioClips.map(({ clip }) => clip.id));
    
    for (const [clipId, entry] of audioEntries) {
      if (!currentClipIds.has(clipId)) {
        // Clip was removed (e.g., deleted or split was undone)
        if (entry.audio) {
          entry.audio.pause();
        }
        removeCachedAudio(clipId);
        setAudioEntries((prev) => {
          const next = new Map(prev);
          next.delete(clipId);
          return next;
        });
      }
    }
  }, [audioClips, audioEntries]);

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

        // Set volume and mute state (use ref for most current value)
        const clipVolume = clip.volume ?? 1;
        const trackVolume = track.volume ?? 1;
        const effectiveVolume = masterVolume * trackVolume * clipVolume;
        audio.volume = Math.max(0, Math.min(1, effectiveVolume));
        audio.muted = isMutedRef.current;
        
        // Set playback rate to match clip speed
        audio.playbackRate = clip.speed;

        // Seek to correct position and play
        audio.currentTime = clipTime;
        audio.play().then(() => {
          // Ensure muted state is correct after play starts
          audio.muted = isMutedRef.current;
        }).catch(() => {
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
          
          // Update volume and mute state (use ref for most current value)
          const clipVolume = clip.volume ?? 1;
          const trackVolume = track.volume ?? 1;
          const effectiveVolume = masterVolume * trackVolume * clipVolume;
          audio.volume = Math.max(0, Math.min(1, effectiveVolume));
          audio.muted = isMutedRef.current;
          
          // Set playback rate to match clip speed
          audio.playbackRate = clip.speed;

          // Seek and ensure playing
          audio.currentTime = clipTime;
          if (audio.paused) {
            audio.play().then(() => {
              audio.muted = isMutedRef.current;
            }).catch(() => {});
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
        const effectiveVolume = masterVolume * trackVolume * clipVolume;
        audio.volume = Math.max(0, Math.min(1, effectiveVolume));
        audio.muted = isMutedRef.current;
        
        // Set playback rate to match clip speed
        audio.playbackRate = clip.speed;

        audio.currentTime = clipTime;
        audio.play().then(() => {
          audio.muted = isMutedRef.current;
        }).catch(() => {});
      } else if (!shouldBePlaying && !audio.paused) {
        // Clip just exited playhead range - stop it
        audio.pause();
      }
    }
  }, [playheadPosition, isPlaying, audioClips, audioEntries, masterVolume, isMuted, getClipTime, isClipAtPlayhead]);

  // Store audio entries in a ref for immediate access
  const audioEntriesRef = useRef<Map<string, AudioEntry>>(new Map());
  audioEntriesRef.current = audioEntries;

  // Direct mute function - bypasses React's state batching
  // Call this from click handlers for immediate audio mute/unmute
  const setMutedImmediate = useCallback((muted: boolean) => {
    // Update the ref immediately
    isMutedRef.current = muted;
    
    // Directly manipulate all audio elements - no waiting for React
    for (const [, entry] of audioEntriesRef.current) {
      if (entry?.audio) {
        entry.audio.muted = muted;
      }
    }
    // Also update all cached audio elements
    for (const [, audio] of audioCache) {
      if (audio) {
        audio.muted = muted;
      }
    }
  }, []);

  // Sync mute state when prop changes (for non-click-triggered updates)
  useLayoutEffect(() => {
    // Update all audio elements with current mute state
    for (const [, entry] of audioEntriesRef.current) {
      if (entry?.audio) {
        entry.audio.muted = isMuted;
      }
    }
    for (const [, audio] of audioCache) {
      if (audio) {
        audio.muted = isMuted;
      }
    }
  }, [isMuted]);

  // Update volume when master volume changes (separate from mute)
  useEffect(() => {
    for (const [clipId, entry] of audioEntries) {
      if (!entry || entry.loading || entry.error) {
        continue;
      }

      // Find the clip and track for this entry
      const clipData = audioClips.find(c => c.clip.id === clipId);
      if (clipData) {
        const { clip, track } = clipData;
        const clipVolume = clip.volume ?? 1;
        const trackVolume = track.volume ?? 1;
        const effectiveVolume = masterVolume * trackVolume * clipVolume;
        entry.audio.volume = Math.max(0, Math.min(1, effectiveVolume));
      } else {
        entry.audio.volume = masterVolume;
      }
    }
  }, [masterVolume, audioClips, audioEntries]);

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
    activeAudioCount,
    setMutedImmediate
  };
}

export default useAudioPlayback;
