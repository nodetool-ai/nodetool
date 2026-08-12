/**
 * useJsScriptServerSync
 *
 * Server persistence for one JS script tab. On mount: load the server document
 * into the store (or upsert-create it when the tab refs a script the server
 * does not know). After load: watch the store and autosave with a debounce,
 * using the server's `updatedAt` as a CAS token (`baseUpdatedAt`). On a
 * conflict the server copy wins and is reloaded.
 *
 * Copied from useScriptServerSync — same machinery, js-script payload.
 */

import { useEffect, useRef } from "react";
import { jsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useJsScriptStore,
  type JsScriptEntry,
  type JsScriptSaveStatus
} from "../../stores/jsScript/JsScriptStore";
import { getErrorMessage } from "../../utils/errorHandling";
import { registerDocumentSync } from "../../stores/documentSync";

const AUTOSAVE_DEBOUNCE_MS = 750;
const RETRY_DELAY_MS = 5_000;

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

const isNotFound = (error: unknown): boolean =>
  /not found/i.test(getErrorMessage(error));

export const useJsScriptServerSync = (scriptId: string): void => {
  const utils = trpc.useUtils();
  const syncedRef = useRef<JsScriptEntry | null>(null);
  const inFlightRef = useRef(false);
  const flushAfterSaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useJsScriptStore;

    const applyResponse = (
      res: JsScriptResponse,
      statusAfter: JsScriptSaveStatus | null
    ): void => {
      if (disposed) return;
      store.getState().loadScript(scriptId, responseToEntry(res));
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
          const created = await trpcClient.jsScripts.create.mutate({
            id: scriptId,
            name: local?.name || DEFAULT_NAME,
            projectId: "default",
            ...(local ? { document: local.document } : {})
          });
          if (disposed) return;
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

    const save = async (flush = false): Promise<void> => {
      if (inFlightRef.current) {
        if (flush) flushAfterSaveRef.current = true;
        return;
      }
      if (disposed && !flush) return;
      const entry = store.getState().scripts[scriptId];
      const revision = store.getState().serverRevisions[scriptId];
      if (!entry || !revision || entry === syncedRef.current) return;

      inFlightRef.current = true;
      let saved = false;
      store.getState().setSaveStatus(scriptId, "saving");
      try {
        const updated = await trpcClient.jsScripts.update.mutate({
          id: scriptId,
          baseUpdatedAt: revision,
          name: entry.name || DEFAULT_NAME,
          document: entry.document
        });
        store.getState().setServerRevision(scriptId, updated.updatedAt);
        syncedRef.current = entry;
        saved = true;
        void utilsRef.current.jsScripts.list.invalidate();
        // Only claim "saved" when the saved snapshot still matches the store;
        // edits that landed mid-flight leave newer work queued.
        if (store.getState().scripts[scriptId] !== syncedRef.current) {
          store.getState().setSaveStatus(scriptId, "unsaved");
          if (disposed || flushAfterSaveRef.current) {
            flushAfterSaveRef.current = true;
          } else {
            schedule();
          }
        } else {
          store.getState().setSaveStatus(scriptId, "saved");
        }
      } catch (error) {
        console.error("JS script autosave failed", error);
        if (disposed) {
          store.getState().setSaveStatus(scriptId, "error");
          return;
        }
        if (/modified since last read/i.test(getErrorMessage(error))) {
          await load("reloaded");
        } else {
          store.getState().setSaveStatus(scriptId, "error");
          schedule(RETRY_DELAY_MS);
        }
      } finally {
        inFlightRef.current = false;
        if (saved && flushAfterSaveRef.current) {
          flushAfterSaveRef.current = false;
          void save(true);
        }
      }
    };

    const schedule = (delayMs: number = AUTOSAVE_DEBOUNCE_MS): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void save();
      }, delayMs);
    };

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.scripts[scriptId] === prev.scripts[scriptId]) return;
      if (state.scripts[scriptId] === syncedRef.current) return;
      if (!state.serverRevisions[scriptId]) return;
      store.getState().setSaveStatus(scriptId, "unsaved");
      schedule();
    });

    // Writes from outside this browser (agent tools, CLI, another tab) arrive
    // as `resource_change`. A clean tab takes the server copy; a dirty one is
    // told rather than overwritten.
    const unwatch = registerDocumentSync("jsscript", scriptId, {
      localRevision: () => store.getState().serverRevisions[scriptId] ?? null,
      isDirty: () =>
        inFlightRef.current ||
        (store.getState().scripts[scriptId] ?? null) !== syncedRef.current,
      reload: () => {
        void load("reloaded");
      }
    });

    void load();

    return () => {
      disposed = true;
      unwatch();
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (inFlightRef.current) flushAfterSaveRef.current = true;
      else void save(true);
    };
  }, [scriptId]);
};

export default useJsScriptServerSync;
