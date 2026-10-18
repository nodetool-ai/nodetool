import { useMemo } from "react";
import type { StoreApi } from "zustand";

import useAuth from "../useAuth";
import { browserDockLayoutStorage, createDockLayoutStoreCache } from "../dock/browserDockLayoutStores";
import { dockLayoutStorageKey, type DockLayoutState, type DockLayoutStorage } from "../dock/DockLayoutStore";
import { TIMELINE_SIDE_PANEL_IDS, timelineDockLayoutModel } from "./TimelineDockLayout";

/** Where the timeline's visibility toggles were stored before the editor used the dock. */
const LEGACY_LAYOUT_KEY = "nodetool.timeline.layout";

/**
 * Carries the old transcript and side panel toggles into a dock that has no
 * saved layout yet: a panel the user had closed starts hidden.
 */
export function applyLegacyPanelVisibility(store: StoreApi<DockLayoutState>, storage: DockLayoutStorage): void {
  let legacy: { transcriptVisible?: unknown; sidePanelVisible?: unknown } | undefined;
  try {
    const raw = storage.getItem(LEGACY_LAYOUT_KEY);
    legacy = raw ? (JSON.parse(raw) as { state?: typeof legacy }).state : undefined;
  } catch {
    return;
  }
  const { dispatch } = store.getState();
  if (legacy?.transcriptVisible === false) { dispatch({ type: "hide", panelId: "transcript" }); }
  if (legacy?.sidePanelVisible === false) {
    for (const panelId of TIMELINE_SIDE_PANEL_IDS) { dispatch({ type: "hide", panelId }); }
  }
}

/** One persisted dock store per signed-in user, migrating the legacy toggles on its first creation. */
export function createTimelineDockLayoutStoreCache(storage: DockLayoutStorage = browserDockLayoutStorage):
  (userId: string | null) => StoreApi<DockLayoutState> {
  const stores = createDockLayoutStoreCache(timelineDockLayoutModel, storage);
  const created = new Set<string | null>();
  return (userId) => {
    if (created.has(userId)) { return stores(userId); }
    created.add(userId);
    let saved: string | null = null;
    try { saved = storage.getItem(dockLayoutStorageKey(timelineDockLayoutModel, userId === null ? { anonymous: true } : { userId })); }
    catch { /* Unreadable storage behaves like a first visit. */ }
    const store = stores(userId);
    if (saved === null) { applyLegacyPanelVisibility(store, storage); }
    return store;
  };
}

export const getTimelineDockLayoutStore = createTimelineDockLayoutStoreCache();

export function useTimelineDockLayoutStore(): StoreApi<DockLayoutState> {
  const userId = useAuth((state) => state.user?.id ?? null);
  return useMemo(() => getTimelineDockLayoutStore(userId), [userId]);
}
