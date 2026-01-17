/**
 * TimelineClipboardStore manages clipboard operations for timeline clips.
 *
 * Responsibilities:
 * - Copy/cut clips to clipboard
 * - Paste clips at playhead position
 * - Support multi-clip operations
 */

import { create } from "zustand";
import useTimelineStore, { Clip, ClipType, TrackType } from "./TimelineStore";
import { generateTimelineId } from "../utils/timelineUtils";

// ============================================================================
// Types
// ============================================================================

export interface ClipboardClip {
  /** Original clip data */
  clip: Clip;
  /** Track type the clip came from */
  trackType: TrackType;
  /** Relative offset from the earliest clip (for multi-clip paste) */
  relativeStartTime: number;
}

export interface TimelineClipboardState {
  /** Clips currently in clipboard */
  clipboardClips: ClipboardClip[];
  /** Whether the clips were cut (should be removed from source on paste) */
  isCut: boolean;
  /** IDs of clips that were cut (to be removed after paste) */
  cutClipIds: { clipId: string; trackId: string }[];

  /** Copy selected clips to clipboard */
  copySelectedClips: () => void;

  /** Cut selected clips to clipboard */
  cutSelectedClips: () => void;

  /** Paste clips at playhead position */
  pasteClips: () => void;

  /** Check if clipboard has clips */
  hasClips: () => boolean;

  /** Clear clipboard */
  clearClipboard: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useTimelineClipboardStore = create<TimelineClipboardState>(
  (set, get) => ({
    clipboardClips: [],
    isCut: false,
    cutClipIds: [],

    copySelectedClips: () => {
      const timelineState = useTimelineStore.getState();
      const { project, selection } = timelineState;

      if (!project || selection.selectedClipIds.length === 0) {
        return;
      }

      const clipboardClips: ClipboardClip[] = [];
      let earliestStartTime = Infinity;

      // First pass: find the earliest start time
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (selection.selectedClipIds.includes(clip.id)) {
            if (clip.startTime < earliestStartTime) {
              earliestStartTime = clip.startTime;
            }
          }
        }
      }

      // Second pass: collect clips with relative offsets
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (selection.selectedClipIds.includes(clip.id)) {
            clipboardClips.push({
              clip: { ...clip },
              trackType: track.type,
              relativeStartTime: clip.startTime - earliestStartTime
            });
          }
        }
      }

      set({
        clipboardClips,
        isCut: false,
        cutClipIds: []
      });
    },

    cutSelectedClips: () => {
      const timelineState = useTimelineStore.getState();
      const { project, selection } = timelineState;

      if (!project || selection.selectedClipIds.length === 0) {
        return;
      }

      const clipboardClips: ClipboardClip[] = [];
      const cutClipIds: { clipId: string; trackId: string }[] = [];
      let earliestStartTime = Infinity;

      // First pass: find the earliest start time
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (selection.selectedClipIds.includes(clip.id)) {
            if (clip.startTime < earliestStartTime) {
              earliestStartTime = clip.startTime;
            }
          }
        }
      }

      // Second pass: collect clips with relative offsets
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (selection.selectedClipIds.includes(clip.id)) {
            clipboardClips.push({
              clip: { ...clip },
              trackType: track.type,
              relativeStartTime: clip.startTime - earliestStartTime
            });
            cutClipIds.push({
              clipId: clip.id,
              trackId: track.id
            });
          }
        }
      }

      set({
        clipboardClips,
        isCut: true,
        cutClipIds
      });
    },

    pasteClips: () => {
      const { clipboardClips, isCut, cutClipIds } = get();
      const timelineState = useTimelineStore.getState();
      const { project, playback, addClip, removeClip, selectClips } =
        timelineState;

      if (!project || clipboardClips.length === 0) {
        return;
      }

      const pasteTime = playback.playheadPosition;
      const newClipIds: string[] = [];

      // If this is a cut operation, remove the original clips first
      if (isCut && cutClipIds.length > 0) {
        for (const { clipId, trackId } of cutClipIds) {
          removeClip(trackId, clipId);
        }
        // Clear cut state after removing clips
        set({ isCut: false, cutClipIds: [] });
      }

      // Paste each clip
      for (const { clip, trackType, relativeStartTime } of clipboardClips) {
        // Find a compatible track
        const targetTrack = project.tracks.find(
          (t) => t.type === trackType && !t.locked
        );

        if (!targetTrack) {
          // Create a new track if none exists
          const trackId = useTimelineStore.getState().addTrack(trackType);
          if (!trackId) {
            continue;
          }
        }

        // Get the track again (in case we just created it)
        const updatedProject = useTimelineStore.getState().project;
        const pasteTrack = updatedProject?.tracks.find(
          (t) => t.type === trackType && !t.locked
        );

        if (!pasteTrack) {
          continue;
        }

        // Create new clip with new ID and updated start time
        const newClipData: Omit<Clip, "id"> = {
          ...clip,
          startTime: pasteTime + relativeStartTime
        };

        // Remove the id property to let addClip generate a new one
        const newClipId = addClip(pasteTrack.id, newClipData);

        if (newClipId) {
          newClipIds.push(newClipId);
        }
      }

      // Select the newly pasted clips
      if (newClipIds.length > 0) {
        selectClips(newClipIds);
      }
    },

    hasClips: () => {
      return get().clipboardClips.length > 0;
    },

    clearClipboard: () => {
      set({
        clipboardClips: [],
        isCut: false,
        cutClipIds: []
      });
    }
  })
);

export default useTimelineClipboardStore;
