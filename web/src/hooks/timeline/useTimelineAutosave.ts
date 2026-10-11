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
  timelineConflictKey
} from "../../stores/timeline/merge";
import { registerTimelineSaver } from "../../stores/timeline/timelineSaveRegistry";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useConflictStore } from "../../stores/ConflictStore";
import { trpcClient } from "../../trpc/client";
import { isString } from "../../utils/typePredicates";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";
import { acknowledgePersistedMediaEdits } from "./directGenPending";
import {
  applyAcceptedTimelineConflict,
  listableTimelineConflicts,
  rebaseTimelineSnapshots,
  timelineMergeDocumentOf,
  timelineMergeDocumentOfSequence,
  timelineTypedDocumentOf,
  withHistoryPaused
} from "./timelineExternalMerge";

interface DocumentSnapshot {
  sequenceId: string | null;
  baseUpdatedAt: string | null;
  fps: TimelineStoreState["fps"];
  width: TimelineStoreState["width"];
  height: TimelineStoreState["height"];
  tracks: TimelineStoreState["tracks"];
  trackFolders: TimelineStoreState["trackFolders"];
  clips: TimelineStoreState["clips"];
  markers: TimelineStoreState["markers"];
  mediaTracks: TimelineStoreState["mediaTracks"];
  transcript: TimelineStoreState["transcript"];
  scriptEnabled: TimelineStoreState["scriptEnabled"];
  tempo: TimelineStoreState["tempo"];
  storyboardMaterializations: TimelineStoreState["storyboardMaterializations"];
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

const sameDocument = (
  a: DocumentSnapshot | null,
  b: DocumentSnapshot | null
): boolean =>
  a !== null &&
  b !== null &&
  a.sequenceId === b.sequenceId &&
  a.fps === b.fps &&
  a.width === b.width &&
  a.height === b.height &&
  a.tracks === b.tracks &&
  a.trackFolders === b.trackFolders &&
  a.clips === b.clips &&
  a.storyboardMaterializations === b.storyboardMaterializations &&
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
    let lastBaseUpdatedAt = initial.baseUpdatedAt;
    // The last snapshot taken while a sequence was open. On unmount a sibling
    // cleanup may already have reset the store, and the closing flush still
    // has to write what the user last saw.
    let lastLive: DocumentSnapshot | null = initial.sequenceId
      ? lastSaved
      : null;
    // The merge base the store held while the sequence was open, for a
    // closing save that has to merge after the store was reset.
    let lastLiveSynced = initial.sequenceId ? initial.syncedDocument : null;
    let finalSnapshot: DocumentSnapshot | null = null;
    const currentSnapshot = (): DocumentSnapshot =>
      finalSnapshot ?? pickSnapshot(store.getState());
    const draftKey = (): string | null =>
      lastSequenceId ? `timeline:${lastSequenceId}` : null;
    const publishDraftState = (status: string): void => {
      const key = draftKey();
      if (!key) return;
      const drafts = useDocumentDraftStore.getState();
      drafts.setDirty(
        key,
        status !== "saved" ||
          Boolean(drafts.codeDrafts[lastSequenceId as string]?.dirty)
      );
      drafts.setSaving(key, status === "saving");
    };
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
        getRevision: () => currentSnapshot().baseUpdatedAt,
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
          const settingsChanged =
            lastSaved === null ||
            lastSaved.sequenceId !== snapshot.sequenceId ||
            lastSaved.fps !== snapshot.fps ||
            lastSaved.width !== snapshot.width ||
            lastSaved.height !== snapshot.height;
          const response = await trpcClient.timeline.update.mutate({
            id: snapshot.sequenceId,
            baseUpdatedAt: baseUpdatedAt ?? undefined,
            ...(settingsChanged && {
              fps: snapshot.fps,
              width: snapshot.width,
              height: snapshot.height
            }),
            document: buildTimelineDocumentPayload(snapshot)
          });
          acknowledgePersistedMediaEdits(snapshot.sequenceId, snapshot.clips);
          const updatedAt = (response as { updatedAt?: unknown }).updatedAt;
          if (
            isString(updatedAt) &&
            store.getState().sequenceId === snapshot.sequenceId &&
            !isOlderUpdatedAt(updatedAt, store.getState().baseUpdatedAt)
          ) {
            store
              .getState()
              .setBaseUpdatedAt(
                updatedAt,
                timelineTypedDocumentOf(timelineMergeDocumentOf(snapshot))
              );
          }
          lastSaved = snapshot;
          return { updatedAt: isString(updatedAt) ? updatedAt : revision };
        },
        recoverCasConflict: async () => {
          const recoveryStart = store.getState();
          const closing = finalSnapshot;
          if (
            closing?.sequenceId &&
            recoveryStart.sequenceId !== closing.sequenceId
          ) {
            // The editor closed and the store moved on, so there is no live
            // draft to merge into. Merge the closing snapshot against the
            // server copy instead, and let the controller retry with it.
            const draft = timelineMergeDocumentOf(closing);
            const base = lastLiveSynced ?? draft;
            const sequence = await trpcClient.timeline.get.query({
              id: closing.sequenceId
            });
            const server = timelineMergeDocumentOfSequence(sequence, base);
            const { doc } = mergeTimelineDocuments(
              base,
              draft,
              server,
              undefined,
              { mergeWithoutOps: true }
            );
            finalSnapshot = {
              ...closing,
              baseUpdatedAt: sequence.updatedAt,
              ...buildTimelineDocumentPayload(timelineTypedDocumentOf(doc))
            };
            return;
          }
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
            const server = timelineMergeDocumentOfSequence(sequence, base);
            const { doc, conflicts, nextBase } = mergeTimelineDocuments(
              base,
              draft,
              server,
              undefined,
              { mergeWithoutOps: true }
            );
            withHistoryPaused(store, () => {
              store
                .getState()
                .applyExternalMerge(timelineTypedDocumentOf(doc));
            });
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
          publishDraftState(status);
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
    const unregisterSaver = registerTimelineSaver({
      handles: (sequenceId) => store.getState().sequenceId === sequenceId,
      save: async () => {
        const result = await controller.flush();
        if (!result.ok) return result;
        return {
          ok: true,
          updatedAt: result.updatedAt,
          sent: lastSaved?.sequenceId
            ? timelineTypedDocumentOf(timelineMergeDocumentOf(lastSaved))
            : null
        };
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
      // `loadSequence` swaps the document and its token in one write, which a
      // landed save never does. That is the server's copy replacing ours, so
      // it is the new saved state even when the sequence id is unchanged.
      const replacedFromServer =
        changed && state.baseUpdatedAt !== lastBaseUpdatedAt;
      lastDocument = snapshot;
      lastSequenceId = state.sequenceId;
      lastBaseUpdatedAt = state.baseUpdatedAt;
      if (state.sequenceId) {
        lastLive = snapshot;
        lastLiveSynced = state.syncedDocument;
      }
      if (!state.sequenceId || !changed) {
        return;
      }
      if (
        (isLoad || replacedFromServer) &&
        !migratedLoads.delete(state.sequenceId)
      ) {
        lastSaved = snapshot;
        return;
      }
      controller.markDirty();
    });

    return () => {
      unsubscribe();
      dirtyProbes.delete(dirtyProbe);
      unregisterSaver();
      const closing = pickSnapshot(store.getState());
      finalSnapshot = closing.sequenceId ? closing : lastLive;
      controller.dispose();
      const key = draftKey();
      if (key) {
        const drafts = useDocumentDraftStore.getState();
        drafts.setSaving(key, false);
        drafts.setDirty(key, Boolean(drafts.codeDrafts[lastSequenceId as string]?.dirty));
      }
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
