/**
 * TimelineInstance
 *
 * Per-instance state wiring for the timeline editor. Each editor surface — a
 * workspace timeline tab or the standalone `/timeline/:sequenceId` page — gets
 * its own isolated bundle of stores so several sequences can be edited in
 * parallel without sharing tracks/clips, undo history, selection, zoom, or
 * playhead.
 *
 * Mirrors `SketchInstance` (and the node editor's `NodeStore` / `NodeContext`
 * pattern): factory stores, a React context carrying the active instance, a
 * `TimelineProvider`, and hooks that read reactively from the context instance
 * while their imperative statics route to the active instance.
 *
 * Generation-job state (`useTimelineGenerationStore`) stays a singleton: its
 * entries are keyed by globally-unique clip ids. When a background tab's job
 * completes while another timeline is focused, the status mirror targets the
 * active instance and harmlessly no-ops on the non-matching clip id — no data
 * is corrupted.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo
} from "react";
import type { TemporalState } from "zundo";

import { createInstanceHook } from "../instanceStoreHook";
import {
  createTimelineStore,
  timelineTemporalOf,
  type TimelineStoreApi,
  type TimelineStoreState,
  type TimelinePartializedState
} from "./TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIState,
  type TimelineUIStoreApi
} from "./TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackState,
  type TimelinePlaybackStoreApi
} from "./TimelinePlaybackStore";

// ── Instance bundle ─────────────────────────────────────────────────────────

export interface TimelineInstance {
  doc: TimelineStoreApi;
  ui: TimelineUIStoreApi;
  playback: TimelinePlaybackStoreApi;
}

const createTimelineInstance = (): TimelineInstance => ({
  doc: createTimelineStore(),
  ui: createTimelineUIStore(),
  playback: createTimelinePlaybackStore()
});

/**
 * Keep UI clip references valid: whenever the document's clips change
 * (delete, undo/redo, track removal, sequence load), drop selection, hover,
 * and word-selection entries that point at clips which no longer exist.
 * Returns the unsubscribe function.
 */
export const attachUiPruning = (
  doc: TimelineStoreApi,
  ui: TimelineUIStoreApi
): (() => void) =>
  doc.subscribe((state, prev) => {
    if (state.clips === prev.clips) return;
    const ids = new Set(state.clips.map((c) => c.id));
    const uiState = ui.getState();
    if (uiState.hoveredClipId && !ids.has(uiState.hoveredClipId)) {
      uiState.setHoveredClipId(null);
    }
    const selected = [...uiState.selectedClipIds];
    const valid = selected.filter((id) => ids.has(id));
    if (valid.length !== selected.length) {
      uiState.setSelection(valid);
    }
    const ws = uiState.wordSelection;
    if (ws && (!ids.has(ws.anchor.clipId) || !ids.has(ws.focus.clipId))) {
      uiState.clearWordSelection();
    }
  });

let defaultInstance: TimelineInstance | null = null;
const getDefaultInstance = (): TimelineInstance =>
  (defaultInstance ??= createTimelineInstance());

// ── Activation stack ────────────────────────────────────────────────────────

const activationStack: TimelineInstance[] = [];

const pushActive = (instance: TimelineInstance): void => {
  activationStack.push(instance);
};

const popActive = (instance: TimelineInstance): void => {
  const idx = activationStack.lastIndexOf(instance);
  if (idx !== -1) activationStack.splice(idx, 1);
};

const currentInstance = (): TimelineInstance =>
  activationStack[activationStack.length - 1] ?? getDefaultInstance();

// ── Context ─────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __TIMELINE_CONTEXT__?: React.Context<TimelineInstance | null>;
  }
}

const __HMR__ =
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "production" &&
  process.env.NODE_ENV !== "test";

const TimelineContext: React.Context<TimelineInstance | null> = (() => {
  if (__HMR__ && window.__TIMELINE_CONTEXT__) {
    return window.__TIMELINE_CONTEXT__;
  }
  const ctx = createContext<TimelineInstance | null>(null);
  if (__HMR__) {
    window.__TIMELINE_CONTEXT__ = ctx;
  }
  return ctx;
})();

/** The instance for the surrounding provider, or the shared default. */
const useTimelineInstance = (): TimelineInstance =>
  useContext(TimelineContext) ?? getDefaultInstance();

interface TimelineProviderProps {
  /**
   * Whether this surface is the focused/visible one. While active, the
   * instance is the target of imperative statics (undo/redo, generation
   * mirror, save). Defaults to `true` for the always-focused standalone page.
   */
  active?: boolean;
  children: React.ReactNode;
}

export const TimelineProvider = ({
  active = true,
  children
}: TimelineProviderProps) => {
  const instance = useMemo(() => createTimelineInstance(), []);

  useEffect(() => attachUiPruning(instance.doc, instance.ui), [instance]);

  useEffect(() => {
    if (!active) return;
    pushActive(instance);
    return () => popActive(instance);
  }, [active, instance]);

  return (
    <TimelineContext.Provider value={instance}>
      {children}
    </TimelineContext.Provider>
  );
};

// ── Store hooks ─────────────────────────────────────────────────────────────

// Document store --------------------------------------------------------------

export const useTimelineStore = createInstanceHook<TimelineStoreState>(
  () => useTimelineInstance().doc,
  () => currentInstance().doc
);

/** Raw document store for the surrounding instance. */
export const useTimelineStoreApi = (): TimelineStoreApi =>
  useTimelineInstance().doc;

/** Undo/redo temporal state of the active timeline instance. */
export const getTimelineTemporal = (): TemporalState<TimelinePartializedState> =>
  timelineTemporalOf(currentInstance().doc);

// UI store --------------------------------------------------------------------

export const useTimelineUIStore = createInstanceHook<TimelineUIState>(
  () => useTimelineInstance().ui,
  () => currentInstance().ui
);

/** Raw UI store for the surrounding instance. */
export const useTimelineUIStoreApi = (): TimelineUIStoreApi =>
  useTimelineInstance().ui;

/** Returns true when the given clip ID is selected (surrounding instance). */
export const useIsClipSelected = (id: string): boolean =>
  useTimelineUIStore((state) => state.selectedClipIds.has(id));

// Playback store --------------------------------------------------------------

export const useTimelinePlaybackStore =
  createInstanceHook<TimelinePlaybackState>(
    () => useTimelineInstance().playback,
    () => currentInstance().playback
  );

/** Raw playback store for the surrounding instance. */
export const useTimelinePlaybackStoreApi = (): TimelinePlaybackStoreApi =>
  useTimelineInstance().playback;
