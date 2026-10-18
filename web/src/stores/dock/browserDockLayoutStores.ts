import type { StoreApi } from "zustand";

import type { DockLayoutModel } from "./DockLayout";
import { createDockLayoutStore, type DockLayoutState, type DockLayoutStorage } from "./DockLayoutStore";

export const browserDockLayoutStorage: DockLayoutStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => { window.localStorage.setItem(key, value); },
  removeItem: (key) => { window.localStorage.removeItem(key); }
};

/** One persisted dock store per signed-in user (or anonymous visitor), created on first use and then reused. */
export function createDockLayoutStoreCache(model: DockLayoutModel, storage: DockLayoutStorage = browserDockLayoutStorage):
  (userId: string | null) => StoreApi<DockLayoutState> {
  const stores = new Map<string, StoreApi<DockLayoutState>>();
  return (userId) => {
    const scopeKey = userId === null ? "anonymous" : `user:${userId}`;
    const existing = stores.get(scopeKey);
    if (existing) { return existing; }
    const store = createDockLayoutStore(model, userId === null ? { anonymous: true } : { userId }, storage);
    stores.set(scopeKey, store);
    return store;
  };
}
