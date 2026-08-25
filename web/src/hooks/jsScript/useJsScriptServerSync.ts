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
 *
 * The hook also registers a flush in {@link registerJsScriptSaver}, so a
 * caller that wrote into the store can learn whether the write persisted.
 */

import { useEffect, useRef, useState } from "react";
import { jsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useJsScriptStore,
  type JsScriptEntry,
  type JsScriptSaveStatus
} from "../../stores/jsScript/JsScriptStore";
import { getErrorMessage } from "../../utils/errorHandling";
import {
  registerDocumentSync,
  type DocumentLoadState
} from "../../stores/documentSync";
import {
  isPermanentSaveError,
  MAX_TRANSIENT_SAVE_RETRIES
} from "../../utils/saveErrors";
import {
  registerJsScriptSaver,
  type JsScriptSaveResult
} from "./jsScriptSaveRegistry";

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

export const useJsScriptServerSync = (
  scriptId: string
): DocumentLoadState => {
  const utils = trpc.useUtils();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const syncedRef = useRef<JsScriptEntry | null>(null);
  const inFlightRef = useRef(false);
  // The save currently in flight, so a flush can await it instead of starting
  // a second, overlapping save.
  const inFlightPromiseRef = useRef<Promise<JsScriptSaveResult> | null>(null);
  const flushAfterSaveRef = useRef(false);
  // Consecutive failed attempts for the current edit. Reset by a new edit and
  // by a save that lands.
  const retriesRef = useRef(0);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useJsScriptStore;
    setLoadState("loading");

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
          const input: Parameters<
            typeof trpcClient.jsScripts.create.mutate
          >[0] = {
            id: scriptId,
            name: local?.name || DEFAULT_NAME,
            projectId: "default"
          };
          if (local) input.document = local.document;
          const created = await trpcClient.jsScripts.create.mutate(input);
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

    const currentRevision = (): string | null =>
      store.getState().serverRevisions[scriptId] ?? null;

    const runSave = async (
      entry: JsScriptEntry,
      revision: string
    ): Promise<JsScriptSaveResult> => {
      let saved = false;
      let result: JsScriptSaveResult = {
        ok: true,
        updatedAt: currentRevision()
      };
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
        retriesRef.current = 0;
        result = { ok: true, updatedAt: updated.updatedAt };
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
        const message = getErrorMessage(error, "JS script save failed");
        result = { ok: false, error: message };
        console.error("JS script autosave failed", error);
        if (disposed) {
          store.getState().setSaveStatus(scriptId, "error");
          return result;
        }
        if (/modified since last read/i.test(getErrorMessage(error))) {
          await load("reloaded");
        } else {
          store.getState().setSaveStatus(scriptId, "error");
          // A payload the server will reject again — an invalid document, a
          // permission error — must not be resent, and even a transient
          // failure gets a bounded number of retries rather than a loop.
          if (
            !isPermanentSaveError(error) &&
            retriesRef.current < MAX_TRANSIENT_SAVE_RETRIES
          ) {
            retriesRef.current += 1;
            schedule(RETRY_DELAY_MS);
          } else {
            retriesRef.current = 0;
          }
        }
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
        if (saved && flushAfterSaveRef.current) {
          flushAfterSaveRef.current = false;
          void save(true);
        }
      }
      return result;
    };

    const save = (flush = false): Promise<JsScriptSaveResult> => {
      if (inFlightRef.current) {
        if (flush) flushAfterSaveRef.current = true;
        return (
          inFlightPromiseRef.current ??
          Promise.resolve({ ok: true, updatedAt: currentRevision() })
        );
      }
      const entry = store.getState().scripts[scriptId];
      const revision = store.getState().serverRevisions[scriptId];
      if (
        (disposed && !flush) ||
        !entry ||
        !revision ||
        entry === syncedRef.current
      ) {
        return Promise.resolve({ ok: true, updatedAt: revision ?? null });
      }

      inFlightRef.current = true;
      const pending = runSave(entry, revision);
      inFlightPromiseRef.current = pending;
      return pending;
    };

    /**
     * Save now instead of on the debounce, and report the outcome. Waits out
     * the initial load and any save already in flight, so two callers never
     * produce two overlapping writes.
     */
    const flushNow = async (): Promise<JsScriptSaveResult> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await loadPromiseRef.current;
      while (inFlightRef.current) {
        const pending = inFlightPromiseRef.current;
        if (!pending) break;
        await pending;
      }
      return save(true);
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
      // A new edit is new content: give it a full retry budget.
      retriesRef.current = 0;
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
      if (timerRef.current) clearTimeout(timerRef.current);
      if (inFlightRef.current) flushAfterSaveRef.current = true;
      else void save(true);
    };
  }, [scriptId]);

  return loadState;
};

export default useJsScriptServerSync;
