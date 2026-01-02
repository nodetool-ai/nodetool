/**
 * Hook for handling timeline keyboard shortcuts.
 *
 * Provides standard NLE-style keyboard shortcuts:
 * - Space: Play/Pause
 * - Home: Stop
 * - Arrow keys: Step frames
 * - Delete/Backspace: Delete selected clips
 * - Ctrl+C: Copy selected clips
 * - Ctrl+X: Cut selected clips
 * - Ctrl+V: Paste clips at playhead
 * - Ctrl+D: Duplicate selected clips
 * - Ctrl+A: Select all clips
 * - Escape: Deselect all
 * - S: Split clip at playhead
 * - I: Set loop in point
 * - O: Set loop out point
 * - L: Toggle loop
 * - +/-: Zoom in/out
 * - F: Zoom to fit
 */

import { useCallback, useEffect } from "react";
import useTimelineStore from "../../stores/TimelineStore";
import { useTimelineClipboardStore } from "../../stores/TimelineClipboardStore";

interface UseTimelineKeyboardShortcutsOptions {
  /** Whether keyboard shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Gets all clip IDs from the project
 */
function getAllClipIds(
  project: ReturnType<typeof useTimelineStore.getState>["project"]
): string[] {
  if (!project) return [];

  const clipIds: string[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      clipIds.push(clip.id);
    }
  }
  return clipIds;
}

/**
 * Hook for handling timeline keyboard shortcuts
 */
export function useTimelineKeyboardShortcuts(
  options: UseTimelineKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;

  const {
    project,
    playback,
    selection,
    togglePlayback,
    stop,
    stepFrame,
    setLoopRegion,
    toggleLoop,
    zoomIn,
    zoomOut,
    zoomToFit,
    deleteSelectedClips,
    selectClips,
    clearClipSelection,
    splitClip,
    duplicateClip,
    getClipById
  } = useTimelineStore();

  const { copySelectedClips, cutSelectedClips, pasteClips } =
    useTimelineClipboardStore();

  // Split selected clips at playhead
  const splitSelectedClipsAtPlayhead = useCallback(() => {
    if (!project || selection.selectedClipIds.length === 0) return;

    const playheadTime = playback.playheadPosition;

    for (const clipId of selection.selectedClipIds) {
      const result = getClipById(clipId);
      if (result) {
        const { track, clip } = result;
        // Only split if playhead is within the clip
        const clipEnd = clip.startTime + clip.duration;
        if (playheadTime > clip.startTime && playheadTime < clipEnd) {
          splitClip(track.id, clipId, playheadTime);
        }
      }
    }
  }, [project, selection.selectedClipIds, playback.playheadPosition, getClipById, splitClip]);

  // Duplicate selected clips
  const duplicateSelectedClips = useCallback(() => {
    if (!project || selection.selectedClipIds.length === 0) return;

    const newClipIds: string[] = [];
    for (const clipId of selection.selectedClipIds) {
      const result = getClipById(clipId);
      if (result) {
        const { track } = result;
        const newClipId = duplicateClip(track.id, clipId);
        if (newClipId) {
          newClipIds.push(newClipId);
        }
      }
    }

    // Select the newly duplicated clips
    if (newClipIds.length > 0) {
      selectClips(newClipIds);
    }
  }, [project, selection.selectedClipIds, getClipById, duplicateClip, selectClips]);

  // Select all clips
  const selectAllClips = useCallback(() => {
    const allClipIds = getAllClipIds(project);
    if (allClipIds.length > 0) {
      selectClips(allClipIds);
    }
  }, [project, selectClips]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ctrl/Cmd shortcuts
      if (isCtrlOrCmd) {
        switch (key) {
          case "c":
            // Copy
            e.preventDefault();
            copySelectedClips();
            break;
          case "x":
            // Cut
            e.preventDefault();
            cutSelectedClips();
            break;
          case "v":
            // Paste
            e.preventDefault();
            pasteClips();
            break;
          case "d":
            // Duplicate
            e.preventDefault();
            duplicateSelectedClips();
            break;
          case "a":
            // Select all
            e.preventDefault();
            selectAllClips();
            break;
          case "z":
            // Undo/Redo handled by TimelineStore's temporal
            break;
        }
        return;
      }

      // Non-modifier shortcuts
      switch (key) {
        case " ":
          e.preventDefault();
          togglePlayback();
          break;
        case "home":
          e.preventDefault();
          stop();
          break;
        case "arrowleft":
          e.preventDefault();
          stepFrame(-1);
          break;
        case "arrowright":
          e.preventDefault();
          stepFrame(1);
          break;
        case "delete":
        case "backspace":
          if (selection.selectedClipIds.length > 0) {
            e.preventDefault();
            deleteSelectedClips();
          }
          break;
        case "escape":
          e.preventDefault();
          clearClipSelection();
          break;
        case "s":
          // Split at playhead
          e.preventDefault();
          splitSelectedClipsAtPlayhead();
          break;
        case "i": {
          // Set loop in point
          e.preventDefault();
          const currentEnd =
            playback.loopEnd > 0 ? playback.loopEnd : project?.duration || 60;
          setLoopRegion(playback.playheadPosition, currentEnd);
          break;
        }
        case "o":
          // Set loop out point
          e.preventDefault();
          setLoopRegion(playback.loopStart, playback.playheadPosition);
          break;
        case "l":
          e.preventDefault();
          toggleLoop();
          break;
        case "f":
          e.preventDefault();
          zoomToFit();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
      }
    },
    [
      project,
      playback.playheadPosition,
      playback.loopStart,
      playback.loopEnd,
      selection.selectedClipIds,
      togglePlayback,
      stop,
      stepFrame,
      deleteSelectedClips,
      clearClipSelection,
      setLoopRegion,
      toggleLoop,
      zoomIn,
      zoomOut,
      zoomToFit,
      copySelectedClips,
      cutSelectedClips,
      pasteClips,
      duplicateSelectedClips,
      selectAllClips,
      splitSelectedClipsAtPlayhead
    ]
  );

  // Register keyboard event listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  return {
    copySelectedClips,
    cutSelectedClips,
    pasteClips,
    duplicateSelectedClips,
    selectAllClips,
    splitSelectedClipsAtPlayhead,
    clearClipSelection
  };
}

export default useTimelineKeyboardShortcuts;
