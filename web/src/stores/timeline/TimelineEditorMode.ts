import { createContext, useContext } from "react";
import { create } from "zustand";

import useAuth from "../useAuth";

/**
 * Simple mode shows the document bar with the format chips, the preview with
 * play and timecode, and the tracks. Expert mode is the full editor: the dock
 * and its workspaces, the inspector, DAW mode, the track controls and the
 * status bar.
 */
export type TimelineEditorMode = "simple" | "expert";

export const DEFAULT_TIMELINE_EDITOR_MODE: TimelineEditorMode = "simple";

const KEY_PREFIX = "nodetool.timeline-mode.v1";

/** The localStorage key holding one user's choice. */
export function timelineEditorModeKey(userId: string | null): string {
  return `${KEY_PREFIX}:${userId === null ? "anonymous" : `user:${userId}`}`;
}

function readMode(key: string): TimelineEditorMode {
  try {
    const saved = globalThis.localStorage?.getItem(key);
    return saved === "expert" || saved === "simple"
      ? saved
      : DEFAULT_TIMELINE_EDITOR_MODE;
  } catch {
    return DEFAULT_TIMELINE_EDITOR_MODE;
  }
}

function writeMode(key: string, mode: TimelineEditorMode): void {
  try {
    globalThis.localStorage?.setItem(key, mode);
  } catch {
    // Private windows and full storage keep the choice for this session only.
  }
}

interface TimelineEditorModeState {
  /** Modes read or set this session, by storage key. */
  modes: Record<string, TimelineEditorMode>;
  setMode: (key: string, mode: TimelineEditorMode) => void;
}

export const useTimelineEditorModeStore = create<TimelineEditorModeState>(
  (set) => ({
    modes: {},
    setMode: (key, mode) => {
      writeMode(key, mode);
      set((state) => ({ modes: { ...state.modes, [key]: mode } }));
    }
  })
);

export interface TimelineEditorModeApi {
  mode: TimelineEditorMode;
  setMode: (mode: TimelineEditorMode) => void;
}

/** The signed-in user's editor mode, shared by every open timeline. */
export function useTimelineEditorMode(): TimelineEditorModeApi {
  const userId = useAuth((state) => state.user?.id ?? null);
  const key = timelineEditorModeKey(userId);
  const stored = useTimelineEditorModeStore((state) => state.modes[key]);
  const setStoredMode = useTimelineEditorModeStore((state) => state.setMode);
  return {
    mode: stored ?? readMode(key),
    setMode: (mode) => setStoredMode(key, mode)
  };
}

/**
 * True inside an editor in Simple mode. The editor provides it, so the tracks
 * and the preview drop their expert controls only there. Other surfaces that
 * mount them (DAW lab views, the storyboard) keep every control.
 */
export const TimelineSimpleModeContext = createContext(false);

export const useTimelineSimpleMode = (): boolean =>
  useContext(TimelineSimpleModeContext);
