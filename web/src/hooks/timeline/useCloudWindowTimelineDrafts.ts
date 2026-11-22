/**
 * In the desktop app's cloud window, keeps the open timeline's unsent edits
 * in the local drafts store until autosave lands them (FR11). Does nothing in
 * any other window.
 *
 * A timeline that opens with a waiting draft from an earlier session takes
 * the draft up again as unsaved edits, so autosave sends it on the latest
 * revision. A draft the server refused (unsent) is left as it is.
 *
 * Call it after `useTimelineAutosave`, whose dirty state it reads.
 */
import { useEffect } from "react";

import { CloudDraftMirror, type EditorSnapshot } from "../../lib/cloud/CloudDraftMirror";
import { CLOUD_WINDOW } from "../../lib/cloud/cloudWindow";
import { SAVER_TICK_MS, type StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import { desktopCloudLocalDraftsClient, LocalDraftStore, serverKeyOf } from "../../lib/cloud/localDraftStore";
import { useTimelineStoreApi, type TimelineStoreState } from "../../stores/timeline/TimelineStore";
import { cloudSyncStatusKey, reportCloudSyncStatus } from "../../stores/CloudSyncStatusStore";
import { registerCloudWindowFlush } from "../../lib/cloud/cloudWindowClosing";
import { buildTimelineDocumentPayload } from "./timelineDocumentPayload";
import { withHistoryPaused } from "./timelineExternalMerge";
import { isTimelineDocumentDirty } from "./useTimelineAutosave";

type TimelineStore = ReturnType<typeof useTimelineStoreApi>;

/** The fields autosave writes, each compared by reference to count edits. */
const documentFields = (state: TimelineStoreState): readonly unknown[] => [
  state.fps,
  state.width,
  state.height,
  ...Object.values(buildTimelineDocumentPayload(state))
];

/** The draft of a timeline: the document autosave sends, with its fps and size. */
export function timelineDraftDocument(state: TimelineStoreState): string {
  return JSON.stringify({
    ...buildTimelineDocumentPayload(state),
    fps: state.fps,
    width: state.width,
    height: state.height
  });
}

/** Puts a stored draft into the editor as unsaved edits. False when it is not a timeline document. */
export function resumeTimelineDraft(store: TimelineStore, draft: StoredDraft): boolean {
  let parsed: Parameters<TimelineStoreState["applyExternalMerge"]>[0];
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  if (!parsed || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.clips)) {
    return false;
  }
  withHistoryPaused(store, () => {
    store.getState().applyExternalMerge(parsed);
  });
  return true;
}

export const useCloudWindowTimelineDrafts = (): void => {
  const store = useTimelineStoreApi();
  useEffect(() => {
    const client = desktopCloudLocalDraftsClient();
    if (!CLOUD_WINDOW || !client) {
      return;
    }
    const origin = CLOUD_WINDOW;
    const drafts = new LocalDraftStore(client);
    let serverKey: string | null = null;
    void serverKeyOf(origin.server).then((key) => {
      serverKey = key;
    });
    let sequenceId: string | null = null;
    let mirror: CloudDraftMirror | null = null;
    let loading = false;
    let generation = 0;
    let lastFields = documentFields(store.getState());

    const snapshot = (state: TimelineStoreState): EditorSnapshot => ({
      dirty: state.sequenceId ? isTimelineDocumentDirty(state.sequenceId) : false,
      revision: state.baseUpdatedAt ?? "",
      generation,
      document: () => timelineDraftDocument(state)
    });

    const open = async (id: string): Promise<void> => {
      const key = { serverKey: serverKey as string, accountId: origin.account, kind: "timeline" as const, documentId: id };
      const loaded = await drafts.load(key);
      loading = false;
      if (!loaded || store.getState().sequenceId !== id || sequenceId !== id) {
        // The store did not answer, or another sequence opened meanwhile. The next tick asks again.
        return;
      }
      const stored = loaded.draft;
      if (stored && stored.state === "unsent") {
        // Never overwrite a refused draft. The mirror stays off for this sequence.
        mirror = null;
        loading = true;
        return;
      }
      const resumed = stored && resumeTimelineDraft(store, stored) ? stored : null;
      mirror = new CloudDraftMirror(drafts, key, resumed ? { draftId: resumed.draftId, base: resumed.base } : null);
    };

    const tick = (): void => {
      const state = store.getState();
      const fields = documentFields(state);
      if (fields.some((value, index) => value !== lastFields[index])) {
        generation += 1;
        lastFields = fields;
      }
      if (state.sequenceId !== sequenceId) {
        if (sequenceId) {
          reportCloudSyncStatus(cloudSyncStatusKey("timeline", sequenceId), null);
        }
        sequenceId = state.sequenceId;
        mirror = null;
        loading = false;
      }
      if (!serverKey || !sequenceId || !state.baseUpdatedAt) {
        return;
      }
      if (mirror) {
        const current = mirror;
        const id = sequenceId;
        void current.update(snapshot(state), Date.now()).then(() => {
          if (mirror === current) {
            reportCloudSyncStatus(cloudSyncStatusKey("timeline", id), current.status(snapshot(store.getState())));
          }
        });
      } else if (!loading) {
        loading = true;
        void open(sequenceId);
      }
    };
    const timer = window.setInterval(tick, SAVER_TICK_MS);
    const unsubscribe = store.subscribe(tick);
    const unregister = registerCloudWindowFlush(async () => mirror?.flush(snapshot(store.getState())));
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      unregister();
      mirror = null;
      if (sequenceId) {
        reportCloudSyncStatus(cloudSyncStatusKey("timeline", sequenceId), null);
      }
    };
  }, [store]);
};
