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
 * The wire shape from `trpc.timeline.get` types animation `easing`/`preset` as
 * plain strings (forward compat); the store's `TimelineSequence` narrows
 * `easing` to `EasingId`. The compiler tolerates unknown ids at sample time, so
 * the wire→store cast on load is safe.
 */
type WireSequence = RouterOutputs["timeline"]["get"];

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
    if ((sequence.transcript?.length ?? 0) > 0) {
      // loadSequence folds a legacy transcript onto clips; tell autosave to
      // persist that migrated document once.
      markTimelineLoadMigrated(sequence.id);
    }
    store.getState().loadSequence(sequence as TimelineSequence);
    // The load is a tracked `set`; clear history so the first Ctrl+Z can't
    // undo "past" the loaded sequence into the empty default state.
    timelineTemporalOf(store).clear();
  }, [sequence, store]);

  useEffect(() => {
    return () => {
      store.getState().reset();
    };
  }, [store]);
}
