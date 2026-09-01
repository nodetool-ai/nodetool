/**
 * useLoadTimelineIntoStore
 *
 * Bridges the tRPC-fetched `TimelineSequence` document into the surrounding
 * instance's `TimelineStore`. Reloads when the sequence id changes and resets
 * the store on unmount so a reused instance starts clean.
 */
import { useEffect } from "react";

import {
  useTimelineStoreApi,
  timelineTemporalOf
} from "../../stores/timeline/TimelineStore";
import { markTimelineLoadMigrated } from "./useTimelineAutosave";

import type { TimelineSequence } from "@nodetool-ai/timeline";
import type { RouterOutputs } from "../../trpc/client";

/**
 * The wire shape from `trpc.timeline.get` types the loose forward-compat
 * strings (animation `preset`/`easing`, transition and mask kinds) exactly as
 * the store's `TimelineSequence` does, and the compiler tolerates a value it
 * cannot read at sample time — so the wire→store cast on load is safe.
 */
export type WireSequence = RouterOutputs["timeline"]["get"];

type TimelineStoreApi = ReturnType<typeof useTimelineStoreApi>;

/**
 * Replace the store's contents with `sequence` and clear undo history.
 *
 * Used on first load and after a version restore. Clearing temporal history is
 * not cosmetic: the load is a tracked `set`, so without it Ctrl+Z would undo
 * "past" the loaded sequence. `loadSequence` also rolls `baseUpdatedAt` to the
 * sequence's own token, which re-baselines the autosave subscriber — a restore
 * that skipped this would be overwritten by the next debounced PATCH of the
 * stale in-memory document.
 */
export function applyTimelineSequenceToStore(
  store: TimelineStoreApi,
  sequence: WireSequence
): void {
  if ((sequence.transcript?.length ?? 0) > 0) {
    markTimelineLoadMigrated(sequence.id);
  }
  store.getState().loadSequence(sequence as TimelineSequence);
  timelineTemporalOf(store).clear();
}

export function useLoadTimelineIntoStore(
  sequence: WireSequence | undefined | null
): void {
  const store = useTimelineStoreApi();

  useEffect(() => {
    if (!sequence) {
      return;
    }
    // Background refetches (e.g. on window focus) produce a fresh `sequence`
    // object for the same id; reloading would clobber local edits and wipe
    // the undo history. Only (re)load when a different sequence arrives.
    if (store.getState().sequenceId === sequence.id) {
      return;
    }
    applyTimelineSequenceToStore(store, sequence);
  }, [sequence, store]);

  useEffect(() => {
    return () => {
      store.getState().reset();
    };
  }, [store]);
}
