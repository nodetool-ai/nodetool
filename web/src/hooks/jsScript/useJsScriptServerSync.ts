/**
 * useJsScriptServerSync
 *
 * Server persistence for one JS script tab. On mount: load the server document
 * into the store (or upsert-create it when the tab refs a script the server
 * does not know). After load: watch the store and autosave with a debounce,
 * using the server's `updatedAt` as a CAS token (`baseUpdatedAt`). On a CAS
 * conflict it re-reads and retries the draft through the shared lifecycle.
 *
 * Copied from useScriptServerSync — same machinery, js-script payload.
 *
 * The hook also registers a flush in {@link registerJsScriptSaver}, so a
 * caller that wrote into the store can learn whether the write persisted.
 */

import { useEffect, useRef, useState } from "react";
import {
  jsScriptDocument,
  type JsScriptDocument,
  type JsScriptTestCase
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { DocumentOp } from "@nodetool-ai/protocol";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useJsScriptStore,
  type JsScriptEntry,
  type JsScriptSaveStatus
} from "../../stores/jsScript/JsScriptStore";
import {
  mergeJsScriptDocuments,
  type JsScriptMergeDoc
} from "../../stores/jsScript/merge";
import type { MergeConflict } from "../../stores/documentMerge";
import { useConflictStore } from "../../stores/ConflictStore";
import { getErrorMessage } from "../../utils/errorHandling";
import {
  registerDocumentSync,
  type DocumentLoadState,
  createDocumentSyncController,
  type DocumentSyncController
} from "../../stores/documentSync";
import {
  isPermanentSaveError
} from "../../utils/saveErrors";
import {
  registerJsScriptSaver,
  type JsScriptSaveResult
} from "./jsScriptSaveRegistry";
import { creationProjectId } from "../../stores/WorkspaceTabsStore";

const DEFAULT_NAME = "Untitled JS script";

type JsScriptResponse = Awaited<
  ReturnType<typeof trpcClient.jsScripts.get.query>
>;

/**
 * Re-parse the wire document with its own schema rather than casting: tRPC's
 * output inference widens `z.unknown()` fields into optional ones, and a parse
 * both settles the type and rejects a row the server somehow stored malformed.
 */
const responseToEntry = (
  res: JsScriptResponse
): Omit<JsScriptEntry, "id" | "updatedAt"> => ({
  name: res.name,
  document: jsScriptDocument.parse(res.document)
});

/** Merge slice: the wire document plus the row's name (name is not in the document). */
const toMergeDoc = (entry: {
  name: string;
  document: JsScriptDocument;
}): JsScriptMergeDoc => ({
  ...entry.document,
  name: entry.name
});

const documentFromMerge = (
  merged: JsScriptMergeDoc
): { name: string; document: JsScriptDocument } => {
  const { name, ...fields } = merged;
  // SAFETY: `JsScriptMergeDoc` is the parsed document plus the row's `name`;
  // dropping `name` leaves exactly the document the merge was fed, with each
  // field resolved to a value one side already held.
  return { name, document: fields as unknown as JsScriptDocument };
};

const isNotFound = (error: unknown): boolean =>
  /not found/i.test(getErrorMessage(error));

export const useJsScriptServerSync = (
  scriptId: string
): DocumentLoadState => {
  const utils = trpc.useUtils();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const syncedRef = useRef<JsScriptEntry | null>(null);
  const revisionRef = useRef<string | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useJsScriptStore;
    setLoadState("loading");
    const pendingNotices: Array<{ updatedAt: string | null; ops?: DocumentOp[] }> = [];

    const applyResponse = (
      res: JsScriptResponse,
      statusAfter: JsScriptSaveStatus | null
    ): void => {
      if (disposed) return;
      store.getState().loadScript(scriptId, responseToEntry(res));
      revisionRef.current = res.updatedAt;
      store.getState().setServerRevision(scriptId, res.updatedAt);
      syncedRef.current = store.getState().scripts[scriptId] ?? null;
      if (statusAfter) store.getState().setSaveStatus(scriptId, statusAfter);
    };

    // `statusAfter` is applied only once the server copy has replaced the local
    // one, so the indicator never claims a state before it is true.
    const load = async (
      statusAfter: JsScriptSaveStatus | null = "saved"
    ): Promise<void> => {
      try {
        applyResponse(
          await trpcClient.jsScripts.get.query({ id: scriptId }),
          statusAfter
        );
      } catch (error) {
        if (!isNotFound(error)) {
          console.error("Failed to load JS script", error);
          store.getState().setSaveStatus(scriptId, "error");
          return;
        }
        // Unknown to the server: upsert-create carrying any local content.
        const local = store.getState().scripts[scriptId];
        try {
          const input: Parameters<
            typeof trpcClient.jsScripts.create.mutate
          >[0] = {
            id: scriptId,
            name: local?.name || DEFAULT_NAME,
            projectId: creationProjectId()
          };
          if (local) input.document = local.document;
          const created = await trpcClient.jsScripts.create.mutate(input);
          if (disposed) return;
          revisionRef.current = created.updatedAt;
          store.getState().setServerRevision(scriptId, created.updatedAt);
          syncedRef.current = store.getState().scripts[scriptId] ?? null;
          if (statusAfter) {
            store.getState().setSaveStatus(scriptId, statusAfter);
          }
          void utilsRef.current.jsScripts.list.invalidate();
        } catch (createError) {
          console.error("Failed to create JS script", createError);
          store.getState().setSaveStatus(scriptId, "error");
        }
      }
    };

    const currentRevision = (): string | null =>
      store.getState().serverRevisions[scriptId] ?? null;

    let controller: DocumentSyncController;
    const flushNow = async (): Promise<JsScriptSaveResult> => {
      await loadPromiseRef.current;
      return controller.flush();
    };

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.scripts[scriptId] === prev.scripts[scriptId]) return;
      if (state.scripts[scriptId] === syncedRef.current) return;
      if (!state.serverRevisions[scriptId]) return;
      store.getState().setSaveStatus(scriptId, "unsaved");
      // A new edit is new content: give it a full retry budget.
      controller.markDirty();
    });

    // Writes from outside this browser (agent tools, CLI, another tab) arrive
    // as `resource_change`. A clean tab takes the server copy; a dirty one is
    // told rather than overwritten.
    // Writes from outside this browser (agent doc-ops, CLI, another tab) come
    // in as `resource_change`. A clean tab takes the server copy; a dirty one
    // merges the change per merge unit — draft wins, refused values land in
    // the conflict banner, no undo entry for external work (ADR 0001).
    const mergeExternal = async (
      notice: { ops?: DocumentOp[]; updatedAt?: string | null },
      prefetched?: JsScriptResponse,
      allowDisposed = false
    ): Promise<void> => {
      let res: JsScriptResponse;
      if (prefetched) {
        res = prefetched;
      } else {
        try {
          res = await trpcClient.jsScripts.get.query({ id: scriptId });
        } catch (error) {
          console.error("Failed to fetch JS script for merge", error);
          return;
        }
      }
      if (disposed && !allowDisposed) return;
      const base = syncedRef.current;
      const draft = store.getState().scripts[scriptId];
      if (!base || !draft || base === draft) return;

      const serverEntry = responseToEntry(res);
      const { doc: merged, conflicts, nextBase } = mergeJsScriptDocuments(
        toMergeDoc(base),
        toMergeDoc(draft),
        toMergeDoc(serverEntry),
        notice.ops
      );
      const applied = documentFromMerge(merged);
      store.getState().applyMerged(scriptId, {
        id: scriptId,
        name: applied.name,
        document: applied.document,
        updatedAt: Date.now()
      });
      revisionRef.current = res.updatedAt;
      store.getState().setServerRevision(scriptId, res.updatedAt);
      // The server copy, except in the units the draft refused, which keep the
      // base they had — otherwise the next external write reads a refused unit
      // as unchanged on the server and the draft wins with nothing listed, so
      // the external value can never be taken again.
      const nextBaseEntry = documentFromMerge(nextBase);
      syncedRef.current = {
        id: scriptId,
        name: nextBaseEntry.name,
        document: nextBaseEntry.document,
        updatedAt: Date.now()
      };

      const listed = conflicts.map((conflict) =>
        conflict.unit.id
          ? conflict
          : { ...conflict, unit: { ...conflict.unit, id: conflict.unit.kind } }
      );
      useConflictStore.getState().addConflicts(`jsscript:${scriptId}`, listed, {
        onAccept: (unitId) => {
          const entry =
            useConflictStore.getState().byKey[`jsscript:${scriptId}`];
          const conflict = entry?.conflicts.find((c) => c.unit.id === unitId);
          if (!conflict) return;
          acceptConflict(conflict, serverEntry);
        },
        onDiscard: () => {}
      });
    };

    /** Take one refused external value into the draft (an undoable edit). */
    const acceptConflict = (
      conflict: MergeConflict,
      serverEntry: { name: string; document: JsScriptDocument }
    ): void => {
      const s = store.getState();
      const serverDocument = serverEntry.document;
      if (conflict.reason === "replaced") {
        // The whole server row is what was refused, its name included: a
        // rename made elsewhere must not be dropped by taking the draft's.
        s.loadScript(
          scriptId,
          {
            name: serverEntry.name || DEFAULT_NAME,
            document: serverDocument
          },
          { checkpoint: true }
        );
        return;
      }
      if (conflict.unit.kind === "field" && conflict.unit.id === "code") {
        s.setCode(scriptId, serverDocument.code);
        return;
      }
      if (conflict.unit.kind === "field" && conflict.unit.id === "name") {
        s.setName(scriptId, String(conflict.external ?? ""));
        return;
      }
      if (conflict.unit.kind === "test" && conflict.external != null) {
        const current = s.getScript(scriptId)?.document.tests ?? [];
        const incoming = conflict.external as JsScriptTestCase;
        const tests = current.some((t) => t.name === incoming.name)
          ? current.map((t) => (t.name === incoming.name ? incoming : t))
          : [...current, incoming];
        s.setTests(scriptId, tests);
        return;
      }
      if (
        (conflict.unit.kind === "input" || conflict.unit.kind === "output") &&
        conflict.external != null
      ) {
        const incoming = conflict.external as { name?: unknown };
        const doc = s.getScript(scriptId)?.document;
        if (!doc || typeof incoming?.name !== "string") return;
        const isInput = conflict.unit.kind === "input";
        const list = isInput ? doc.inputs : doc.outputs;
        const next = list.some((p) => p.name === incoming.name)
          ? list.map((p) =>
              p.name === incoming.name
                ? (incoming as (typeof list)[number])
                : p
            )
          : [...list, incoming as (typeof list)[number]];
        s.setPorts(
          scriptId,
          isInput ? { inputs: next } : { outputs: next }
        );
      }
    };

    const unwatch = registerDocumentSync("jsscript", scriptId, {
      localRevision: () => revisionRef.current,
      isDirty: () =>
        (store.getState().scripts[scriptId] ?? null) !== syncedRef.current,
      reload: () => {
        void load("reloaded");
      },
      merge: (notice) => {
        if (controller.isSaving()) {
          pendingNotices.push(notice);
          return;
        }
        void mergeExternal(notice);
      }
    });

    controller = createDocumentSyncController<JsScriptEntry>({
      getDraft: () => store.getState().scripts[scriptId] ?? null,
      getRevision: currentRevision,
      isDirty: () =>
        (store.getState().scripts[scriptId] ?? null) !== syncedRef.current,
      save: async (entry, revision) => {
        const updated = await trpcClient.jsScripts.update.mutate({
          id: scriptId,
          baseUpdatedAt: revision,
          name: entry.name || DEFAULT_NAME,
          document: entry.document
        });
        revisionRef.current = updated.updatedAt;
        store.getState().setServerRevision(scriptId, updated.updatedAt);
        void utilsRef.current.jsScripts.list.invalidate();
        const notices = pendingNotices.splice(0, pendingNotices.length);
        for (const notice of notices) {
          if (notice.updatedAt === updated.updatedAt) continue;
          await mergeExternal(notice);
        }
        if (store.getState().scripts[scriptId] === entry) {
          syncedRef.current = entry;
        }
        if (store.getState().scripts[scriptId] !== entry) controller.markDirty();
        return { updatedAt: updated.updatedAt };
      },
      recoverCasConflict: async () => {
        const res = await trpcClient.jsScripts.get.query({ id: scriptId });
        await mergeExternal({ updatedAt: res.updatedAt }, res, true);
        if (!adapterStillDirty()) {
          store.getState().setSaveStatus(scriptId, "reloaded");
        }
      },
      isCasConflict: (error) => /modified since last read/i.test(getErrorMessage(error)),
      isRetryableError: (error) => !isPermanentSaveError(error),
      onStatus: (status) => store.getState().setSaveStatus(scriptId, status)
    });

    const adapterStillDirty = (): boolean =>
      (store.getState().scripts[scriptId] ?? null) !== syncedRef.current;

    registerJsScriptSaver(scriptId, flushNow);

    // The initial load gates rendering: a script with no server revision once
    // it has settled is one that failed to load. Later reloads (CAS conflict,
    // resource_change) leave the state alone — the surface already has a
    // document to show.
    loadPromiseRef.current = load().finally(() => {
      if (disposed) return;
      setLoadState(
        store.getState().serverRevisions[scriptId] ? "ready" : "error"
      );
    });
    void loadPromiseRef.current;

    return () => {
      disposed = true;
      registerJsScriptSaver(scriptId, null);
      unwatch();
      unsubscribe();
      controller.dispose();
    };
  }, [scriptId]);

  return loadState;
};

export default useJsScriptServerSync;
