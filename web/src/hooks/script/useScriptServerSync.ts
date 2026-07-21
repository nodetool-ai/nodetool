/**
 * useScriptServerSync
 *
 * Server persistence for one script tab. On mount: load the script's server
 * document into the store (or upsert-create it when the tab refs a script the
 * server doesn't know — new tabs). After load: watch the store and autosave
 * with a debounce, using the server's `updatedAt` as a CAS token
 * (`baseUpdatedAt`). On a conflict the server copy wins and is reloaded.
 *
 * Copied from useStoryboardServerSync — same machinery, script payload.
 */

import { useEffect, useRef } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import { useScriptStore, type ScriptDraft } from "../../stores/script/ScriptStore";

const AUTOSAVE_DEBOUNCE_MS = 750;
const RETRY_DELAY_MS = 5_000;

type ScriptResponse = Awaited<ReturnType<typeof trpcClient.scripts.get.query>>;
type ScriptWireDocument = ScriptResponse["document"];

/** The saved payload: the script minus identity and transient UI state. */
const scriptToDocument = (script: ScriptDraft): ScriptWireDocument =>
  ({
    cast: script.cast,
    sections: script.sections
  }) as unknown as ScriptWireDocument;

const responseToScript = (
  res: ScriptResponse
): Omit<ScriptDraft, "id" | "updatedAt"> => {
  const doc = res.document;
  return {
    title: res.name === "Untitled script" ? "" : res.name,
    cast: doc.cast as unknown as ScriptDraft["cast"],
    sections: doc.sections as unknown as ScriptDraft["sections"],
    timelineId: res.timelineId ?? null
  };
};

const isNotFound = (error: unknown): boolean =>
  !!error &&
  typeof error === "object" &&
  /not found/i.test((error as Error).message ?? "");

export const useScriptServerSync = (scriptId: string): void => {
  const utils = trpc.useUtils();
  const syncedRef = useRef<ScriptDraft | null>(null);
  const inFlightRef = useRef(false);
  const flushAfterSaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useScriptStore;

    const applyResponse = (res: ScriptResponse, reconcile: boolean): void => {
      if (disposed) return;
      store.getState().loadScript(scriptId, responseToScript(res));
      store.getState().setServerRevision(scriptId, res.updatedAt);
      syncedRef.current = store.getState().scripts[scriptId] ?? null;
      // A clean load means store and server agree — clear any stale error left
      // by a prior failed save. The conflict path passes reconcile=false so its
      // "reloaded" warning survives the reload it triggers.
      if (reconcile) store.getState().setSaveStatus(scriptId, "saved");
    };

    // `reconcile` marks the script "saved" on a successful load/create. The
    // mount load reconciles (clearing a stale error from a previous session);
    // the CAS-conflict reload passes false so its "reloaded" status persists.
    const load = async (reconcile = true): Promise<void> => {
      try {
        applyResponse(
          await trpcClient.scripts.get.query({ id: scriptId }),
          reconcile
        );
      } catch (error) {
        if (!isNotFound(error)) {
          console.error("Failed to load script", error);
          return;
        }
        // Unknown to the server: upsert-create carrying any local content.
        const local = store.getState().scripts[scriptId];
        try {
          const created = await trpcClient.scripts.create.mutate({
            id: scriptId,
            name: local?.title || "Untitled script",
            document: local ? scriptToDocument(local) : undefined
          });
          if (disposed) return;
          store.getState().setServerRevision(scriptId, created.updatedAt);
          syncedRef.current = store.getState().scripts[scriptId] ?? null;
          if (reconcile) store.getState().setSaveStatus(scriptId, "saved");
          void utilsRef.current.scripts.list.invalidate();
        } catch (createError) {
          console.error("Failed to create script", createError);
        }
      }
    };

    const save = async (flush = false): Promise<void> => {
      if (inFlightRef.current) {
        if (flush) flushAfterSaveRef.current = true;
        return;
      }
      if (disposed && !flush) return;
      const script = store.getState().scripts[scriptId];
      const revision = store.getState().serverRevisions[scriptId];
      if (!script || !revision || script === syncedRef.current) return;

      inFlightRef.current = true;
      let saved = false;
      store.getState().setSaveStatus(scriptId, "saving");
      try {
        const updated = await trpcClient.scripts.update.mutate({
          id: scriptId,
          baseUpdatedAt: revision,
          name: script.title || "Untitled script",
          document: scriptToDocument(script),
          timelineId: script.timelineId
        });
        store.getState().setServerRevision(scriptId, updated.updatedAt);
        syncedRef.current = script;
        saved = true;
        store.getState().setSaveStatus(scriptId, "saved");
        void utilsRef.current.scripts.list.invalidate();
        // Edits landed while the save was in flight — go again.
        if (store.getState().scripts[scriptId] !== syncedRef.current) {
          if (disposed || flushAfterSaveRef.current) {
            flushAfterSaveRef.current = true;
          } else {
            schedule();
          }
        }
      } catch (error) {
        console.error("Script autosave failed", error);
        // Tab unmounted mid-flush: no live hook remains to retry or reload, but
        // don't leave the singleton status stuck on "saving" — mark it failed so
        // reopening the script shows the truth. The next mount reconciles.
        if (disposed) {
          store.getState().setSaveStatus(scriptId, "error");
          return;
        }
        if (/modified since last read/i.test((error as Error).message ?? "")) {
          store.getState().setSaveStatus(scriptId, "reloaded");
          // Keep the "reloaded" warning: don't let the reload reconcile to "saved".
          await load(false);
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
      schedule();
    });

    void load();

    return () => {
      disposed = true;
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (inFlightRef.current) flushAfterSaveRef.current = true;
      else void save(true);
    };
  }, [scriptId]);
};

export default useScriptServerSync;
