import { useMemo } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import useAuth from "../useAuth";
import type { GameLayoutStorage } from "./GamePanelLayoutStore";
import {
  findGameBindingConflict, GAME_COMMANDS_BY_ID, resolveGameBindings, sameGameBinding,
  type GameKeyBinding, type GameShortcutOverrides
} from "../../components/game/shell/gameCommands";

const MAX_BINDINGS = 4;
const binding = z.object({
  code: z.string().min(1).max(32),
  mod: z.boolean().optional(),
  shift: z.boolean().optional(),
  alt: z.boolean().optional()
}).strict();

export interface GameShortcutState {
  readonly overrides: GameShortcutOverrides;
  /** Replaces a command's shortcuts. Throws a readable message when another command in a shared editor uses one. */
  readonly setBindings: (commandId: string, bindings: readonly GameKeyBinding[]) => void;
  readonly resetBindings: (commandId: string) => void;
  readonly resetAll: () => void;
}

/** Keeps each valid override for a known command so one bad entry does not discard the others. */
function hydrateOverrides(value: unknown): GameShortcutOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) { return {}; }
  const result: Record<string, readonly GameKeyBinding[]> = {};
  for (const [id, entry] of Object.entries(value)) {
    const parsed = z.array(binding).max(MAX_BINDINGS).safeParse(entry);
    if (GAME_COMMANDS_BY_ID.has(id) && parsed.success) { result[id] = parsed.data; }
  }
  for (const [id, bindings] of Object.entries(result)) {
    const resolved = resolveGameBindings(result);
    if (bindings.some((entry) => findGameBindingConflict(id, entry, resolved))) { delete result[id]; }
  }
  return result;
}

export function createGameShortcutStore(scope: { readonly userId: string } | { readonly anonymous: true },
  storage: GameLayoutStorage): StoreApi<GameShortcutState> {
  const namespace = "userId" in scope ? `user:${encodeURIComponent(scope.userId)}` : "anonymous";
  const guardedStorage: GameLayoutStorage = {
    getItem(key) {
      try { return storage.getItem(key); }
      catch { return null; }
    },
    setItem(key, value) {
      try { storage.setItem(key, value); }
      catch { /* Shortcuts stay in memory when browser storage is unavailable. */ }
    },
    removeItem(key) {
      try { storage.removeItem(key); }
      catch { /* Nothing depends on removing persisted shortcuts. */ }
    }
  };
  return createStore<GameShortcutState>()(persist((set, get) => ({
    overrides: {},
    setBindings(commandId, bindings) {
      const command = GAME_COMMANDS_BY_ID.get(commandId);
      if (!command) { throw new Error(`Unknown game editor command ${commandId}`); }
      const parsed = z.array(binding).max(MAX_BINDINGS).parse(bindings);
      const unique = parsed.filter((entry, index) => parsed.findIndex((other) => sameGameBinding(other, entry)) === index);
      const resolved = resolveGameBindings(get().overrides);
      for (const entry of unique) {
        const conflict = findGameBindingConflict(commandId, entry, resolved);
        if (conflict) { throw new Error(`${conflict.title} already uses this shortcut`); }
      }
      set({ overrides: { ...get().overrides, [commandId]: unique } });
    },
    resetBindings(commandId) {
      const command = GAME_COMMANDS_BY_ID.get(commandId);
      if (!command || !(commandId in get().overrides)) { return; }
      const resolved = resolveGameBindings(get().overrides);
      const conflict = command.defaultBindings.map((entry) => findGameBindingConflict(commandId, entry, resolved)).find(Boolean);
      if (conflict) { throw new Error(`${conflict.title} already uses the default shortcut`); }
      const rest: Record<string, readonly GameKeyBinding[]> = { ...get().overrides };
      delete rest[commandId];
      set({ overrides: rest });
    },
    resetAll() {
      if (Object.keys(get().overrides).length > 0) { set({ overrides: {} }); }
    }
  }), {
    name: `nodetool.game-shortcuts.v1:${namespace}`,
    version: 1,
    storage: createJSONStorage(() => guardedStorage),
    partialize: (state) => ({ overrides: state.overrides }),
    merge(persisted, current) {
      if (typeof persisted !== "object" || persisted === null) { return current; }
      return { ...current, overrides: hydrateOverrides((persisted as { readonly overrides?: unknown }).overrides) };
    }
  }));
}

const stores = new Map<string, StoreApi<GameShortcutState>>();
const browserStorage: GameLayoutStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => { window.localStorage.setItem(key, value); },
  removeItem: (key) => { window.localStorage.removeItem(key); }
};

export function getGameShortcutStore(userId: string | null): StoreApi<GameShortcutState> {
  const scopeKey = userId === null ? "anonymous" : `user:${userId}`;
  const existing = stores.get(scopeKey);
  if (existing) { return existing; }
  const store = createGameShortcutStore(userId === null ? { anonymous: true } : { userId }, browserStorage);
  stores.set(scopeKey, store);
  return store;
}

export function useGameShortcutStore(): StoreApi<GameShortcutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getGameShortcutStore(userId), [userId]);
}
