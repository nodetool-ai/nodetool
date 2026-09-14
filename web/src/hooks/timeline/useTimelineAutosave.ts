import { useEffect } from "react";

import {
  createDocumentSyncController,
  type DocumentSyncController
} from "../../stores/documentSync";
import {
  isOlderUpdatedAt,
  timelineTemporalOf,
  useTimelineStoreApi,
  type TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { isString } from "../../utils/typePredicates";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";

interface DocumentSnapshot {
  sequenceId: string | null;
  baseUpdatedAt: string | null;
  fps: TimelineStoreState["fps"];
  width: TimelineStoreState["width"];
  height: TimelineStoreState["height"];
  tracks: TimelineStoreState["tracks"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  mediaTracks: TimelineStoreState["mediaTracks"];
  transcript: TimelineStoreState["transcript"];
  scriptEnabled: TimelineStoreState["scriptEnabled"];
  tempo: TimelineStoreState["tempo"];
  setup: NonNullable<TimelineStoreState["setup"]> | undefined;
}

const pickSnapshot = (state: TimelineStoreState): DocumentSnapshot => ({
  sequenceId: state.sequenceId,
  baseUpdatedAt: state.baseUpdatedAt,
  fps: state.fps,
  width: state.width,
  height: state.height,
  ...buildTimelineDocumentPayload(state)
});

const sameDocument = (
  a: DocumentSnapshot | null,
  b: DocumentSnapshot | null
): boolean =>
  a !== null &&
  b !== null &&
  a.sequenceId === b.sequenceId &&
  a.tracks === b.tracks &&
  a.clips === b.clips &&
  a.markers === b.markers &&
  a.mediaTracks === b.mediaTracks &&
  a.transcript === b.transcript &&
  a.scriptEnabled === b.scriptEnabled &&
  a.tempo === b.tempo &&
  a.setup === b.setup;

const migratedLoads = new Set<string>();
type DirtyProbe = (sequenceId: string) => boolean;
const dirtyProbes = new Set<DirtyProbe>();

export function markTimelineLoadMigrated(sequenceId: string): void {
  migratedLoads.add(sequenceId);
}

export function isTimelineDocumentDirty(sequenceId: string): boolean {
  for (const probe of dirtyProbes) {
    if (probe(sequenceId)) return true;
  }
  return false;
}

export function useTimelineAutosave(
  options: { debounceMs?: number } = {}
): void {
  const store = useTimelineStoreApi();
  const debounceMs = options.debounceMs ?? 750;

  useEffect(() => {
    const initial = store.getState();
    let lastSaved: DocumentSnapshot | null = pickSnapshot(initial);
    let lastDocument = lastSaved;
    let lastSequenceId = initial.sequenceId;
    const currentSnapshot = (): DocumentSnapshot =>
      pickSnapshot(store.getState());
    const dirtyProbe: DirtyProbe = (sequenceId) =>
      store.getState().sequenceId === sequenceId &&
      !sameDocument(currentSnapshot(), lastSaved);
    dirtyProbes.add(dirtyProbe);

    const controller: DocumentSyncController =
      createDocumentSyncController<DocumentSnapshot>({
        debounceMs,
        getDraft: () => {
          const snapshot = currentSnapshot();
          return snapshot.sequenceId ? snapshot : null;
        },
        getRevision: () => store.getState().baseUpdatedAt,
        isDirty: () => !sameDocument(currentSnapshot(), lastSaved),
        canSave: (flush) => flush || timelineTemporalOf(store).isTracking,
        save: async (snapshot, revision) => {
          if (!snapshot.sequenceId) {
            return { updatedAt: revision };
          }
          const live = store.getState();
          const baseUpdatedAt =
            live.sequenceId === snapshot.sequenceId
              ? live.baseUpdatedAt
              : snapshot.baseUpdatedAt;
          const response = await trpcClient.timeline.update.mutate({
            id: snapshot.sequenceId,
            baseUpdatedAt: baseUpdatedAt ?? undefined,
            document: buildTimelineDocumentPayload(snapshot)
          });
          const updatedAt = (response as { updatedAt?: unknown }).updatedAt;
          if (
            isString(updatedAt) &&
            store.getState().sequenceId === snapshot.sequenceId &&
            !isOlderUpdatedAt(updatedAt, store.getState().baseUpdatedAt)
          ) {
            store.getState().setBaseUpdatedAt(updatedAt, {
              tracks: snapshot.tracks,
              clips: snapshot.clips,
              markers: snapshot.markers,
              mediaTracks: snapshot.mediaTracks,
              transcript: snapshot.transcript,
              scriptEnabled: snapshot.scriptEnabled,
              fps: snapshot.fps,
              width: snapshot.width,
              height: snapshot.height
            });
          }
          lastSaved = snapshot;
          return { updatedAt: isString(updatedAt) ? updatedAt : revision };
        },
        recoverCasConflict: async () => {
          const sequenceId = store.getState().sequenceId;
          if (!sequenceId) {
            return;
          }
          const sequence = await trpcClient.timeline.get.query({
            id: sequenceId
          });
          if (store.getState().sequenceId === sequenceId) {
            store.getState().setBaseUpdatedAt(sequence.updatedAt, {
              tracks: sequence.tracks ?? [],
              clips: sequence.clips ?? [],
              markers: sequence.markers ?? [],
              mediaTracks: sequence.mediaTracks ?? [],
              transcript: sequence.transcript ?? [],
              scriptEnabled: sequence.scriptEnabled ?? false,
              fps: sequence.fps,
              width: sequence.width,
              height: sequence.height
            });
          }
        },
        isCasConflict: (error) =>
          error instanceof Error &&
          /modified since last (read|load)/i.test(error.message),
        onStatus: (status) => {
          if (status === "error") {
            useNotificationStore.getState().addNotification({
              content:
                "Timeline autosave failed — your last edit may not be saved.",
              type: "warning",
              alert: false,
              dedupeKey: "timeline-autosave-failed",
              replaceExisting: true
            });
          }
        }
      });

    if (initial.sequenceId && migratedLoads.delete(initial.sequenceId)) {
      lastSaved = null;
      controller.markDirty();
    }

    const unsubscribe = store.subscribe((state) => {
      const snapshot = pickSnapshot(state);
      const changed = !sameDocument(snapshot, lastDocument);
      const isLoad = state.sequenceId !== lastSequenceId;
      lastDocument = snapshot;
      lastSequenceId = state.sequenceId;
      if (!state.sequenceId || !changed) {
        return;
      }
      if (isLoad && !migratedLoads.delete(state.sequenceId)) {
        lastSaved = snapshot;
        return;
      }
      controller.markDirty();
    });

    return () => {
      unsubscribe();
      dirtyProbes.delete(dirtyProbe);
      controller.dispose();
    };
  }, [debounceMs, store]);
}

export default useTimelineAutosave;
