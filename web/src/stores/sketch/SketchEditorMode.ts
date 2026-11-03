import { create } from "zustand";

import useAuth from "../useAuth";

/**
 * Simple mode shows the canvas, a short tool rail and a layer list with the
 * active layer's prompt. Expert mode is the full dock with every panel.
 */
export type SketchEditorMode = "simple" | "expert";

export const DEFAULT_SKETCH_EDITOR_MODE: SketchEditorMode = "simple";

const KEY_PREFIX = "nodetool.sketch-mode.v1";

/** The localStorage key holding one user's choice. */
export function sketchEditorModeKey(userId: string | null): string {
  return `${KEY_PREFIX}:${userId === null ? "anonymous" : `user:${userId}`}`;
}

function readMode(key: string): SketchEditorMode {
  try {
    const saved = globalThis.localStorage?.getItem(key);
    return saved === "expert" || saved === "simple" ? saved : DEFAULT_SKETCH_EDITOR_MODE;
  } catch {
    return DEFAULT_SKETCH_EDITOR_MODE;
  }
}

function writeMode(key: string, mode: SketchEditorMode): void {
  try {
    globalThis.localStorage?.setItem(key, mode);
  } catch {
    // Private windows and full storage keep the choice for this session only.
  }
}

interface SketchEditorModeState {
  /** Modes read or set this session, by storage key. */
  modes: Record<string, SketchEditorMode>;
  setMode: (key: string, mode: SketchEditorMode) => void;
}

export const useSketchEditorModeStore = create<SketchEditorModeState>((set) => ({
  modes: {},
  setMode: (key, mode) => {
    writeMode(key, mode);
    set((state) => ({ modes: { ...state.modes, [key]: mode } }));
  }
}));

export interface SketchEditorModeApi {
  mode: SketchEditorMode;
  setMode: (mode: SketchEditorMode) => void;
}

/** The signed-in user's editor mode, shared by every open sketch editor. */
export function useSketchEditorMode(): SketchEditorModeApi {
  const userId = useAuth((state) => state.user?.id ?? null);
  const key = sketchEditorModeKey(userId);
  const stored = useSketchEditorModeStore((state) => state.modes[key]);
  const setStoredMode = useSketchEditorModeStore((state) => state.setMode);
  return {
    mode: stored ?? readMode(key),
    setMode: (mode) => setStoredMode(key, mode)
  };
}
