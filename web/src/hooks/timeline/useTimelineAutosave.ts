import { useCallback, useEffect, useRef } from "react";

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
import {
  mergeTimelineDocuments,
  timelineConflictKey,
  type TimelineMergeDoc
} from "../../stores/timeline/merge";
import { useConflictStore } from "../../stores/ConflictStore";
import { trpcClient } from "../../trpc/client";
import { isString } from "../../utils/typePredicates";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";
import { acknowledgePersistedMediaEdits } from "./directGenPending";
import {
  applyAcceptedTimelineConflict,
  listableTimelineConflicts,
  rebaseTimelineSnapshots,
  timelineTypedDocumentOf
} from "./timelineExternalMerge";

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
  camera2d: TimelineStoreState["camera2d"];
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

const timelineMergeDocumentOf = (
  state: TimelineStoreState
): TimelineMergeDoc => ({
  tracks: state.tracks,
  clips: state.clips,
  markers: state.markers,
  mediaTracks: state.mediaTracks,
  transcript: state.transcript,
  scriptEnabled: state.scriptEnabled,
  fps: state.fps,
  width: state.width,
  height: state.height,
  camera2d: state.camera2d ?? null
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
  a.camera2d === b.camera2d &&
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
): UseTimelineAutosaveResult {
  const store = useTimelineStoreApi();
  const debounceMs = options.debounceMs ?? 750;
  const controllerRef = useRef<DocumentSyncController | null>(null);

  const flush = useCallback(async (): Promise<TimelineAutosaveFlushResult> => {
    const controller = controllerRef.current;
    if (!controller) {
      return { ok: false, error: "Timeline autosave is not ready." };
    }
    return controller.flush();
  }, []);

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
          acknowledgePersistedMediaEdits(snapshot.sequenceId, snapshot.clips);
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
              height: snapshot.height,
              camera2d: snapshot.camera2d ?? null
            });
          }
          lastSaved = snapshot;
          return { updatedAt: isString(updatedAt) ? updatedAt : revision };
        },
        recoverCasConflict: async () => {
          const recoveryStart = store.getState();
          const sequenceId = recoveryStart.sequenceId;
          if (!sequenceId) {
            return;
          }
          const base =
            recoveryStart.syncedDocument ??
            timelineMergeDocumentOf(recoveryStart);
          const sequence = await trpcClient.timeline.get.query({
            id: sequenceId
          });
          if (store.getState().sequenceId === sequenceId) {
            const before = store.getState();
            const draft = timelineMergeDocumentOf(before);
            const server: TimelineMergeDoc = {
              tracks: sequence.tracks ?? [],
              clips: sequence.clips ?? [],
              markers: sequence.markers ?? [],
              mediaTracks: sequence.mediaTracks ?? [],
              transcript: sequence.transcript ?? [],
              scriptEnabled: sequence.scriptEnabled ?? false,
              fps: sequence.fps,
              width: sequence.width,
              height: sequence.height,
              camera2d: sequence.camera2d ?? null
            };
            const { doc, conflicts, nextBase } = mergeTimelineDocuments(
              base,
              draft,
              server,
              undefined,
              { mergeWithoutOps: true }
            );
            const temporal = timelineTemporalOf(store);
            temporal.pause();
            try {
              store.getState().applyExternalMerge({
                tracks: doc.tracks as TimelineStoreState["tracks"],
                clips: doc.clips as TimelineStoreState["clips"],
                markers: doc.markers as TimelineStoreState["markers"],
                mediaTracks:
                  doc.mediaTracks as TimelineStoreState["mediaTracks"],
                transcript: doc.transcript as TimelineStoreState["transcript"],
                scriptEnabled: doc.scriptEnabled,
                fps: doc.fps,
                width: doc.width,
                height: doc.height,
                camera2d: doc.camera2d ?? null
              });
            } finally {
              temporal.resume();
            }
            const rebasedTemporal = timelineTemporalOf(store);
            store.temporal.setState({
              pastStates: rebaseTimelineSnapshots(
                rebasedTemporal.pastStates,
                draft,
                doc
              ),
              futureStates: rebaseTimelineSnapshots(
                rebasedTemporal.futureStates,
                draft,
                doc
              )
            });
            store
              .getState()
              .setBaseUpdatedAt(
                sequence.updatedAt,
                timelineTypedDocumentOf(nextBase)
              );
            useConflictStore
              .getState()
              .addConflicts(
                timelineConflictKey(sequenceId),
                listableTimelineConflicts(conflicts),
                {
                  onAccept: (unitId) => {
                    const key = timelineConflictKey(sequenceId);
                    const entry = useConflictStore.getState().byKey[key];
                    const conflict = entry?.conflicts.find(
                      (candidate) => candidate.unit.id === unitId
                    );
                    if (!conflict) return;
                    applyAcceptedTimelineConflict(store.getState(), conflict);
                  },
                  onDiscard: () => {}
                }
              );
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
    controllerRef.current = controller;

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
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [debounceMs, store]);

  return { flush };
}

export type TimelineAutosaveFlushResult =
  | { ok: true; updatedAt: string | null }
  | { ok: false; error: string };

export interface UseTimelineAutosaveResult {
  flush: () => Promise<TimelineAutosaveFlushResult>;
}

export default useTimelineAutosave;
