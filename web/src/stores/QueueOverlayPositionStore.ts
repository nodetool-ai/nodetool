import { create } from "zustand";

import useAuth from "./useAuth";
import {
  parseDockedPosition,
  type DockedPosition
} from "../utils/dockedPanelPosition";

const KEY_PREFIX = "nodetool.queue-overlay-position.v1";

/** The localStorage key holding one user's queue overlay position. */
export function queueOverlayPositionKey(userId: string | null): string {
  return `${KEY_PREFIX}:${userId === null ? "anonymous" : `user:${userId}`}`;
}

function readPosition(key: string): DockedPosition | null {
  try {
    const saved = globalThis.localStorage?.getItem(key);
    return saved ? parseDockedPosition(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function writePosition(key: string, position: DockedPosition | null): void {
  try {
    if (position) {
      globalThis.localStorage?.setItem(key, JSON.stringify(position));
    } else {
      globalThis.localStorage?.removeItem(key);
    }
  } catch {
    // Private windows and full storage keep the position for this session only.
  }
}

interface QueueOverlayPositionState {
  /** Positions read or set this session by storage key. Null is the default position. */
  positions: Record<string, DockedPosition | null>;
  setPosition: (key: string, position: DockedPosition | null) => void;
}

export const useQueueOverlayPositionStore = create<QueueOverlayPositionState>(
  (set) => ({
    positions: {},
    setPosition: (key, position) => {
      writePosition(key, position);
      set((state) => ({ positions: { ...state.positions, [key]: position } }));
    }
  })
);

export interface QueueOverlayPositionApi {
  /** The user's dropped position, or null for the default. */
  position: DockedPosition | null;
  setPosition: (position: DockedPosition | null) => void;
}

/** The signed-in user's queue overlay position, shared by every open workflow. */
export function useQueueOverlayPosition(): QueueOverlayPositionApi {
  const userId = useAuth((state) => state.user?.id ?? null);
  const key = queueOverlayPositionKey(userId);
  const stored = useQueueOverlayPositionStore((state) => state.positions[key]);
  const setStored = useQueueOverlayPositionStore((state) => state.setPosition);
  return {
    position: stored === undefined ? readPosition(key) : stored,
    setPosition: (position) => setStored(key, position)
  };
}
