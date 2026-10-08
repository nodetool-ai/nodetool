import { useMemo } from "react";
import type { StoreApi } from "zustand";

import useAuth from "../useAuth";
import { createGamePanelLayoutStore, type GamePanelLayoutState, type GameLayoutStorage } from "./GamePanelLayoutStore";

const stores = new Map<string, StoreApi<GamePanelLayoutState>>();
const browserStorage: GameLayoutStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => { window.localStorage.setItem(key, value); },
  removeItem: (key) => { window.localStorage.removeItem(key); }
};

export function getGamePanelLayoutStore(userId: string | null): StoreApi<GamePanelLayoutState> {
  const scopeKey = userId === null ? "anonymous" : `user:${userId}`;
  const existing = stores.get(scopeKey);
  if (existing) { return existing; }
  const store = createGamePanelLayoutStore(userId === null ? { anonymous: true } : { userId }, browserStorage);
  stores.set(scopeKey, store);
  return store;
}

export function useGamePanelLayoutStore(): StoreApi<GamePanelLayoutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getGamePanelLayoutStore(userId), [userId]);
}
