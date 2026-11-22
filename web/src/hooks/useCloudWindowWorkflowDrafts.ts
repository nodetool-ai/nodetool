/**
 * In the desktop app's cloud window, keeps every open workflow's unsent
 * edits in the local drafts store until its save lands (FR11). Does nothing
 * in any other window.
 *
 * When a workflow opens with a waiting draft from an earlier session, the
 * editor takes the draft up again and marks itself changed, so its own save
 * sends it on the latest revision: the draft wins, as in the native apps,
 * and the server keeps the revision it replaces as a version. A draft the
 * server refused (unsent) is left as it is and never overwritten.
 *
 * The workflow editor saves on command or on its autosave timer. In the
 * cloud window a workflow's waiting changes are sent through that autosave
 * once they are stored, paced by `CloudSendPacer`, so they reach the server
 * within seconds and again as soon as the computer is back online.
 */
import { useEffect } from "react";

import { CloudDraftMirror, type EditorSnapshot } from "../lib/cloud/CloudDraftMirror";
import { CloudSendPacer } from "../lib/cloud/CloudSendPacer";
import { CLOUD_WINDOW } from "../lib/cloud/cloudWindow";
import { SAVER_TICK_MS, type CloudDocumentKey, type StoredDraft } from "../lib/cloud/CloudDocumentSaver";
import { desktopCloudLocalDraftsClient, LocalDraftStore, serverKeyOf } from "../lib/cloud/localDraftStore";
import { cloudSyncStatusKey, reportCloudSyncStatus } from "../stores/CloudSyncStatusStore";
import { graphEdgeToReactFlowEdge } from "../stores/graphEdgeToReactFlowEdge";
import { graphNodeToReactFlowNode } from "../stores/graphNodeToReactFlowNode";
import type { NodeStore } from "../stores/NodeStore";
import { useSettingsStore } from "../stores/SettingsStore";
import type { WorkflowManagerStore } from "../stores/WorkflowManagerStore";
import type { Workflow } from "../stores/ApiTypes";
import { autosaveIfDirty } from "./useWorkflowAutosave";

/** The draft of a workflow: its graph and name, as the native saver reads it. */
export function workflowSnapshot(nodeStore: NodeStore): EditorSnapshot {
  const state = nodeStore.getState();
  return {
    dirty: state.workflowIsDirty,
    revision: state.workflow.updated_at ?? "",
    generation: state.editGeneration,
    document: () => {
      const workflow = state.getWorkflow();
      return JSON.stringify({ graph: workflow.graph ?? { nodes: [], edges: [] }, name: workflow.name });
    }
  };
}

/** Puts a stored draft's graph into the editor as unsaved edits. False when the draft is not a workflow graph. */
export function resumeWorkflowDraft(nodeStore: NodeStore, draft: StoredDraft): boolean {
  let parsed: { graph?: Workflow["graph"]; nodes?: unknown; edges?: unknown };
  try {
    parsed = JSON.parse(draft.draft);
  } catch {
    return false;
  }
  const graph = (parsed.graph ?? parsed) as Workflow["graph"];
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return false;
  }
  const state = nodeStore.getState();
  const workflow: Workflow = { ...state.workflow, graph };
  state.applyExternalGraph(
    (graph.nodes as never[]).map((node) => graphNodeToReactFlowNode(workflow, node)),
    graph.edges.map((edge) => graphEdgeToReactFlowEdge(edge)),
    undefined,
    graph.links ?? []
  );
  state.setWorkflowDirty(true);
  return true;
}

type Entry = { mirror: CloudDraftMirror; pacer: CloudSendPacer } | { mirror: null };

/** Sends the workflow's waiting changes when its pacer says a save is due. */
export function sendWhenDue(
  nodeStore: NodeStore,
  manager: WorkflowManagerStore,
  mirror: CloudDraftMirror,
  pacer: CloudSendPacer,
  nowMs: number,
  online: boolean
): Promise<void> | null {
  if (!pacer.due(nowMs, mirror.status(workflowSnapshot(nodeStore)) === "stored", online)) {
    return null;
  }
  pacer.started();
  const maxVersions = useSettingsStore.getState().settings.autosave?.maxVersionsPerWorkflow ?? 50;
  return autosaveIfDirty(nodeStore, manager, maxVersions)
    .catch(() => undefined)
    .finally(() => {
      pacer.finished(Date.now(), nodeStore.getState().workflowIsDirty);
    });
}

export const useCloudWindowWorkflowDrafts = (manager: WorkflowManagerStore): void => {
  useEffect(() => {
    const client = desktopCloudLocalDraftsClient();
    if (!CLOUD_WINDOW || !client) {
      return;
    }
    const origin = CLOUD_WINDOW;
    const store = new LocalDraftStore(client);
    const entries = new Map<string, Entry>();
    const loading = new Set<string>();
    let serverKey: string | null = null;
    void serverKeyOf(origin.server).then((key) => {
      serverKey = key;
    });

    const open = async (id: string, nodeStore: NodeStore, key: CloudDocumentKey): Promise<void> => {
      const loaded = await store.load(key);
      loading.delete(id);
      if (!loaded || manager.getState().nodeStores[id] !== nodeStore) {
        // The store did not answer, or the tab closed meanwhile. The next tick asks again.
        return;
      }
      const stored = loaded.draft;
      if (stored && stored.state === "unsent") {
        entries.set(id, { mirror: null });
        return;
      }
      const resumed = stored && resumeWorkflowDraft(nodeStore, stored) ? stored : null;
      entries.set(id, {
        mirror: new CloudDraftMirror(store, key, resumed ? { draftId: resumed.draftId, base: resumed.base } : null),
        pacer: new CloudSendPacer()
      });
    };

    const tick = (): void => {
      if (!serverKey) {
        return;
      }
      const now = Date.now();
      const nodeStores = manager.getState().nodeStores;
      for (const [id, nodeStore] of Object.entries(nodeStores)) {
        const entry = entries.get(id);
        if (!entry) {
          if (!loading.has(id) && nodeStore.getState().workflow.updated_at) {
            loading.add(id);
            void open(id, nodeStore, { serverKey, accountId: origin.account, kind: "workflow", documentId: id });
          }
          continue;
        }
        if (entry.mirror) {
          const { mirror, pacer } = entry;
          void mirror.update(workflowSnapshot(nodeStore), now).then(() => {
            if (entries.get(id)?.mirror === mirror) {
              reportCloudSyncStatus(cloudSyncStatusKey("workflow", id), mirror.status(workflowSnapshot(nodeStore)));
              void sendWhenDue(nodeStore, manager, mirror, pacer, Date.now(), navigator.onLine);
            }
          });
        }
      }
      for (const id of [...entries.keys()]) {
        if (!nodeStores[id]) {
          // The tab closed. A draft that stays is taken up when the workflow opens again.
          entries.delete(id);
          reportCloudSyncStatus(cloudSyncStatusKey("workflow", id), null);
        }
      }
    };
    const reconnected = (): void => {
      for (const entry of entries.values()) {
        if (entry.mirror) {
          entry.pacer.reconnected();
        }
      }
      tick();
    };
    const timer = window.setInterval(tick, SAVER_TICK_MS);
    const unsubscribe = manager.subscribe(tick);
    window.addEventListener("online", reconnected);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener("online", reconnected);
      for (const id of entries.keys()) {
        reportCloudSyncStatus(cloudSyncStatusKey("workflow", id), null);
      }
      entries.clear();
    };
  }, [manager]);
};
