/**
 * useTimelineAutosave
 *
 * Subscribes to the document slice of `TimelineStore` and PATCHes the
 * persisted sequence via `trpc.timeline.update` whenever the user mutates
 * tracks / clips / markers / transcript.
 *
 * Robustness:
 *   - Debounces saves so a burst of edits coalesces into one PATCH.
 *   - Single-flight: while a save is in flight, additional edits accumulate
 *     in `pendingRef` and a follow-up save fires once the in-flight one
 *     resolves.
 *   - Optimistic concurrency: sends `baseUpdatedAt` (read from the
 *     TimelineStore at SEND time, so an edit captured during an in-flight
 *     save can't self-conflict with that save's own response token) and
 *     rolls it forward from each successful response — but only while the
 *     store still holds the saved sequence.
 *   - Failures surface a deduped notification and restore the snapshot to
 *     `pendingRef` so the next edit or the unmount flush retries.
 *   - Loading a sequence re-baselines the subscriber instead of scheduling a
 *     save; the one exception is a load that migrated a legacy transcript,
 *     which is persisted once (see `markTimelineLoadMigrated`).
 *   - Pending edits are flushed on unmount.
 */
import { useEffect, useRef } from "react";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

import type { TimelineStoreState } from "../../stores/timeline/TimelineStore";

const DEFAULT_DEBOUNCE_MS = 750;

interface DocumentSnapshot {
  sequenceId: string | null;
  baseUpdatedAt: string | null;
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  transcript: TimelineStoreState["transcript"];
}

// `durationMs` is intentionally NOT tracked: the PATCH schema has no
// durationMs field, so treating it as a dirty-trigger would schedule saves
// that can never persist it. It is recomputed client-side from the clips.
const pickSnapshot = (state: TimelineStoreState): DocumentSnapshot => ({
  sequenceId: state.sequenceId,
  baseUpdatedAt: state.baseUpdatedAt,
  tracks: state.tracks,
  clips: state.clips,
  markers: state.markers,
  transcript: state.transcript
});

// Sequence ids whose load migrated a legacy transcript onto clips. The
// migrated document differs from what the server holds, so it must be
// persisted once even though a plain load is not an edit.
const migratedLoads = new Set<string>();

/**
 * Called by `useLoadTimelineIntoStore` just before `loadSequence` when the
 * fetched document carries a legacy `TranscriptLine[]` transcript that the
 * load folds onto clips. Autosave then persists that one load.
 */
export function markTimelineLoadMigrated(sequenceId: string): void {
  migratedLoads.add(sequenceId);
}

const consumeMigratedLoad = (sequenceId: string): boolean =>
  migratedLoads.delete(sequenceId);

export interface UseTimelineAutosaveOptions {
  debounceMs?: number;
}

export function useTimelineAutosave(
  options: UseTimelineAutosaveOptions = {}
): void {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const store = useTimelineStoreApi();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<DocumentSnapshot | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let scheduleFn: () => void = () => {};
    // When the host component unmounts while a save is in flight, the
    // post-completion handler should bypass the debounce and flush the
    // pending edit immediately so we don't lose work if the page closes
    // shortly after.
    let flushImmediatelyOnComplete = false;

    const runSave = async (snapshot: DocumentSnapshot) => {
      if (!snapshot.sequenceId) return;
      inFlightRef.current = true;
      let succeeded = false;
      try {
        // Read the concurrency token at send time: a snapshot captured while
        // a previous save was in flight still carries that save's
        // pre-response token and would 409 against our own write. Fall back
        // to the snapshot token if the store has since loaded a different
        // sequence (its live token belongs to the new one).
        const live = store.getState();
        const baseUpdatedAt =
          live.sequenceId === snapshot.sequenceId
            ? live.baseUpdatedAt
            : snapshot.baseUpdatedAt;
        const response = await trpcClient.timeline.update.mutate({
          id: snapshot.sequenceId,
          baseUpdatedAt: baseUpdatedAt ?? undefined,
          document: {
            tracks: snapshot.tracks,
            clips: snapshot.clips,
            markers: snapshot.markers,
            transcript: snapshot.transcript
          }
        });
        const updatedAt = (response as { updatedAt?: unknown } | undefined)
          ?.updatedAt;
        // Only roll the token forward while the store still holds the saved
        // sequence — otherwise we'd poison a newly loaded sequence's token.
        if (
          typeof updatedAt === "string" &&
          store.getState().sequenceId === snapshot.sequenceId
        ) {
          store.getState().setBaseUpdatedAt(updatedAt);
        }
        succeeded = true;
      } catch (error) {
        console.error("Timeline autosave failed:", error);
        useNotificationStore.getState().addNotification({
          content:
            "Timeline autosave failed — your last edit may not be saved.",
          type: "warning",
          alert: false,
          dedupeKey: "timeline-autosave-failed",
          replaceExisting: true
        });
        // Restore the snapshot (unless a newer edit replaced it) so the next
        // edit or the unmount flush retries the save.
        if (!pendingRef.current) {
          pendingRef.current = snapshot;
        }
      } finally {
        inFlightRef.current = false;
        // Follow up on a pending snapshot — but not the failed one we just
        // restored, which would otherwise retry in a hot loop. It waits for
        // the next edit or the unmount flush instead.
        if (
          pendingRef.current &&
          (succeeded || pendingRef.current !== snapshot)
        ) {
          if (flushImmediatelyOnComplete) {
            flush();
          } else {
            scheduleFn();
          }
        }
      }
    };

    const flush = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (inFlightRef.current) return;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || !pending.sequenceId) return;
      void runSave(pending);
    };

    const schedule = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(flush, debounceMs);
    };
    scheduleFn = schedule;

    // Skip subscriber updates that don't change persisted document fields.
    // Otherwise the server's `setBaseUpdatedAt` write after each save loops
    // back into the subscriber and triggers an infinite save→response cycle.
    // Baseline from the current state so a remount mid-session doesn't
    // mistake the next edit for a sequence load.
    const initial = store.getState();
    let lastSequenceId: string | null = initial.sequenceId;
    let lastTracks: TimelineStoreState["tracks"] | null = initial.tracks;
    let lastClips: TimelineStoreState["clips"] | null = initial.clips;
    let lastMarkers: TimelineStoreState["markers"] | null = initial.markers;
    let lastTranscript: TimelineStoreState["transcript"] | null =
      initial.transcript;

    // A sequence loaded before this hook subscribed may still owe its
    // one-time migration save.
    if (initial.sequenceId && consumeMigratedLoad(initial.sequenceId)) {
      pendingRef.current = pickSnapshot(initial);
      schedule();
    }

    const unsubscribe = store.subscribe((state) => {
      if (!state.sequenceId) return;
      const docUnchanged =
        state.sequenceId === lastSequenceId &&
        state.tracks === lastTracks &&
        state.clips === lastClips &&
        state.markers === lastMarkers &&
        state.transcript === lastTranscript;
      if (docUnchanged) return;
      const isLoad = state.sequenceId !== lastSequenceId;
      lastSequenceId = state.sequenceId;
      lastTracks = state.tracks;
      lastClips = state.clips;
      lastMarkers = state.markers;
      lastTranscript = state.transcript;
      if (isLoad && !consumeMigratedLoad(state.sequenceId)) {
        // Loading a sequence is not an edit: re-baseline without scheduling
        // a redundant PATCH of the document we just fetched.
        return;
      }
      pendingRef.current = pickSnapshot(state);
      schedule();
    });

    return () => {
      unsubscribe();
      if (inFlightRef.current) {
        // A save is already running. Setting this flag tells its `finally`
        // handler to flush the still-pending snapshot immediately rather
        // than re-debouncing — protects the last edit when the page closes
        // shortly after unmount.
        flushImmediatelyOnComplete = true;
      } else {
        flush();
      }
    };
  }, [debounceMs, store]);
}
