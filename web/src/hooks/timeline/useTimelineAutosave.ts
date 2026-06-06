/**
 * useTimelineAutosave
 *
 * Subscribes to the document slice of `TimelineStore` and PATCHes the
 * persisted sequence via `trpc.timeline.update` whenever the user mutates
 * tracks / clips / markers / durationMs.
 *
 * Robustness:
 *   - Debounces saves so a burst of edits coalesces into one PATCH.
 *   - Single-flight: while a save is in flight, additional edits accumulate
 *     in `pendingRef` and a follow-up save fires once the in-flight one
 *     resolves.
 *   - Optimistic concurrency: sends `baseUpdatedAt` (sourced from the
 *     TimelineStore) so the server can reject stale writes; rolls it
 *     forward from each successful response.
 *   - Failures surface a deduped notification and leave `pendingRef`
 *     intact so the next edit retries automatically.
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
  durationMs: number;
}

const pickSnapshot = (state: TimelineStoreState): DocumentSnapshot => ({
  sequenceId: state.sequenceId,
  baseUpdatedAt: state.baseUpdatedAt,
  tracks: state.tracks,
  clips: state.clips,
  markers: state.markers,
  transcript: state.transcript,
  durationMs: state.durationMs
});

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
      try {
        const response = await trpcClient.timeline.update.mutate({
          id: snapshot.sequenceId,
          baseUpdatedAt: snapshot.baseUpdatedAt ?? undefined,
          document: {
            tracks: snapshot.tracks,
            clips: snapshot.clips,
            markers: snapshot.markers,
            transcript: snapshot.transcript
          }
        });
        const updatedAt = (response as { updatedAt?: unknown } | undefined)
          ?.updatedAt;
        if (typeof updatedAt === "string") {
          store.getState().setBaseUpdatedAt(updatedAt);
        }
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
        // Leave pendingRef intact so the next edit triggers a retry.
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
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
    let lastSequenceId: string | null = null;
    let lastTracks: TimelineStoreState["tracks"] | null = null;
    let lastClips: TimelineStoreState["clips"] | null = null;
    let lastMarkers: TimelineStoreState["markers"] | null = null;
    let lastTranscript: TimelineStoreState["transcript"] | null = null;
    let lastDurationMs: number | null = null;

    const unsubscribe = store.subscribe((state) => {
      if (!state.sequenceId) return;
      const docUnchanged =
        state.sequenceId === lastSequenceId &&
        state.tracks === lastTracks &&
        state.clips === lastClips &&
        state.markers === lastMarkers &&
        state.transcript === lastTranscript &&
        state.durationMs === lastDurationMs;
      if (docUnchanged) return;
      lastSequenceId = state.sequenceId;
      lastTracks = state.tracks;
      lastClips = state.clips;
      lastMarkers = state.markers;
      lastTranscript = state.transcript;
      lastDurationMs = state.durationMs;
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
