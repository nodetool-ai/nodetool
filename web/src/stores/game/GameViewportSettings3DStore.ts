import { useMemo } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import useAuth from "../useAuth";
import type { GameLayoutStorage } from "./GamePanelLayoutStore";
import { GAME_GIZMO_PIVOTS_3D, type GameGizmoMode3D, type GameGizmoPivot3D, type GameGizmoSpace3D, type GameSnapIncrements3D } from "./gameGizmo3D";

/** Bounds for each snap increment. Rotation is in degrees, scale is a factor step. */
export const GAME_SNAP_LIMITS_3D: Readonly<Record<GameGizmoMode3D, { readonly min: number; readonly max: number }>> = {
  translate: { min: 0.001, max: 100 },
  rotate: { min: 0.1, max: 180 },
  scale: { min: 0.001, max: 10 }
};

export const DEFAULT_GAME_VIEWPORT_SETTINGS_3D: GameViewportSettings3D = {
  space: "world",
  pivot: "center",
  snap: true,
  increments: { translate: 0.25, rotate: 15, scale: 0.25 },
  surfaceSnap: false,
  orbitSelection: false,
  orthographic: false
};

/** Gizmo and camera choices of the 3D scene view. They are editor preferences, not part of the game document. */
export interface GameViewportSettings3D {
  readonly space: GameGizmoSpace3D;
  readonly pivot: GameGizmoPivot3D;
  readonly snap: boolean;
  readonly increments: GameSnapIncrements3D;
  /** Move drags place the selection on the surface under the pointer. */
  readonly surfaceSnap: boolean;
  /** The orbit camera turns around the selection centre whenever the selection changes. */
  readonly orbitSelection: boolean;
  readonly orthographic: boolean;
}

type GameViewportToggle3D = "snap" | "surfaceSnap" | "orbitSelection" | "orthographic";

export interface GameViewportSettings3DState extends GameViewportSettings3D {
  readonly toggle: (key: GameViewportToggle3D) => void;
  readonly setSpace: (space: GameGizmoSpace3D) => void;
  readonly toggleSpace: () => void;
  readonly setPivot: (pivot: GameGizmoPivot3D) => void;
  readonly cyclePivot: () => void;
  /** Clamps the value into `GAME_SNAP_LIMITS_3D` and ignores a value that is not a finite number. */
  readonly setIncrement: (mode: GameGizmoMode3D, value: number) => void;
  readonly reset: () => void;
}

const settingsSchema = z.object({
  space: z.enum(["world", "local"]),
  pivot: z.enum(GAME_GIZMO_PIVOTS_3D),
  snap: z.boolean(),
  increments: z.object({
    translate: z.number().min(GAME_SNAP_LIMITS_3D.translate.min).max(GAME_SNAP_LIMITS_3D.translate.max),
    rotate: z.number().min(GAME_SNAP_LIMITS_3D.rotate.min).max(GAME_SNAP_LIMITS_3D.rotate.max),
    scale: z.number().min(GAME_SNAP_LIMITS_3D.scale.min).max(GAME_SNAP_LIMITS_3D.scale.max)
  }),
  surfaceSnap: z.boolean(),
  orbitSelection: z.boolean(),
  orthographic: z.boolean()
});

/** Keeps each valid stored setting so one bad field does not discard the others. */
function hydrateSettings(value: unknown): GameViewportSettings3D {
  if (typeof value !== "object" || value === null || Array.isArray(value)) { return DEFAULT_GAME_VIEWPORT_SETTINGS_3D; }
  const stored = value as Record<string, unknown>;
  const result: Record<string, unknown> = { ...DEFAULT_GAME_VIEWPORT_SETTINGS_3D };
  for (const key of ["space", "pivot", "snap", "surfaceSnap", "orbitSelection", "orthographic"] as const) {
    if (settingsSchema.shape[key].safeParse(stored[key]).success) { result[key] = stored[key]; }
  }
  const increments = typeof stored.increments === "object" && stored.increments !== null ? stored.increments as Record<string, unknown> : {};
  result.increments = Object.fromEntries((["translate", "rotate", "scale"] as const).map((mode) => {
    const parsed = settingsSchema.shape.increments.shape[mode].safeParse(increments[mode]);
    return [mode, parsed.success ? parsed.data : DEFAULT_GAME_VIEWPORT_SETTINGS_3D.increments[mode]];
  }));
  return result as unknown as GameViewportSettings3D;
}

export function createGameViewportSettings3DStore(scope: { readonly userId: string } | { readonly anonymous: true },
  storage: GameLayoutStorage): StoreApi<GameViewportSettings3DState> {
  const namespace = "userId" in scope ? `user:${encodeURIComponent(scope.userId)}` : "anonymous";
  const guardedStorage: GameLayoutStorage = {
    getItem(key) {
      try { return storage.getItem(key); }
      catch { return null; }
    },
    setItem(key, value) {
      try { storage.setItem(key, value); }
      catch { /* Settings stay in memory when browser storage is unavailable. */ }
    },
    removeItem(key) {
      try { storage.removeItem(key); }
      catch { /* Nothing depends on removing persisted settings. */ }
    }
  };
  return createStore<GameViewportSettings3DState>()(persist((set, get) => ({
    ...DEFAULT_GAME_VIEWPORT_SETTINGS_3D,
    toggle(key) { set({ [key]: !get()[key] }); },
    setSpace(space) { if (get().space !== space) { set({ space }); } },
    toggleSpace() { set({ space: get().space === "world" ? "local" : "world" }); },
    setPivot(pivot) { if (get().pivot !== pivot) { set({ pivot }); } },
    cyclePivot() {
      const index = GAME_GIZMO_PIVOTS_3D.indexOf(get().pivot);
      set({ pivot: GAME_GIZMO_PIVOTS_3D[(index + 1) % GAME_GIZMO_PIVOTS_3D.length] });
    },
    setIncrement(mode, value) {
      if (!Number.isFinite(value)) { return; }
      const limits = GAME_SNAP_LIMITS_3D[mode];
      const clamped = Math.min(limits.max, Math.max(limits.min, value));
      if (get().increments[mode] !== clamped) { set({ increments: { ...get().increments, [mode]: clamped } }); }
    },
    reset() { set({ ...DEFAULT_GAME_VIEWPORT_SETTINGS_3D }); }
  }), {
    name: `nodetool.game-viewport3d.v1:${namespace}`,
    version: 1,
    storage: createJSONStorage(() => guardedStorage),
    partialize: (state) => ({ space: state.space, pivot: state.pivot, snap: state.snap, increments: state.increments,
      surfaceSnap: state.surfaceSnap, orbitSelection: state.orbitSelection, orthographic: state.orthographic }),
    merge(persisted, current) { return { ...current, ...hydrateSettings(persisted) }; }
  }));
}

const stores = new Map<string, StoreApi<GameViewportSettings3DState>>();
const browserStorage: GameLayoutStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => { window.localStorage.setItem(key, value); },
  removeItem: (key) => { window.localStorage.removeItem(key); }
};

export function getGameViewportSettings3DStore(userId: string | null): StoreApi<GameViewportSettings3DState> {
  const scopeKey = userId === null ? "anonymous" : `user:${userId}`;
  const existing = stores.get(scopeKey);
  if (existing) { return existing; }
  const store = createGameViewportSettings3DStore(userId === null ? { anonymous: true } : { userId }, browserStorage);
  stores.set(scopeKey, store);
  return store;
}

export function useGameViewportSettings3DStore(): StoreApi<GameViewportSettings3DState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getGameViewportSettings3DStore(userId), [userId]);
}
