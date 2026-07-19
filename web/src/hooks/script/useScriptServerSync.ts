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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useScriptStore;

    const applyResponse = (res: ScriptResponse): void => {
      if (disposed) return;
      store.getState().loadScript(scriptId, responseToScript(res));
      store.getState().setServerRevision(scriptId, res.updatedAt);
      syncedRef.current = store.getState().scripts[scriptId] ?? null;
    };

    const load = async (): Promise<void> => {
      try {
        applyResponse(await trpcClient.scripts.get.query({ id: scriptId }));
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
          void utilsRef.current.scripts.list.invalidate();
        } catch (createError) {
          console.error("Failed to create script", createError);
        }
      }
    };

    const save = async (): Promise<void> => {
      if (disposed || inFlightRef.current) return;
      const script = store.getState().scripts[scriptId];
      const revision = store.getState().serverRevisions[scriptId];
      if (!script || !revision || script === syncedRef.current) return;

      inFlightRef.current = true;
      try {
        const updated = await trpcClient.scripts.update.mutate({
          id: scriptId,
          baseUpdatedAt: revision,
          name: script.title || "Untitled script",
          document: scriptToDocument(script),
          timelineId: script.timelineId
        });
        if (disposed) return;
        store.getState().setServerRevision(scriptId, updated.updatedAt);
        syncedRef.current = script;
        void utilsRef.current.scripts.list.invalidate();
        // Edits landed while the save was in flight — go again.
        if (store.getState().scripts[scriptId] !== syncedRef.current) {
          schedule();
        }
      } catch (error) {
        if (disposed) return;
        console.error("Script autosave failed", error);
        if (/modified since last read/i.test((error as Error).message ?? "")) {
          await load();
        } else {
          schedule(RETRY_DELAY_MS);
        }
      } finally {
        inFlightRef.current = false;
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
    };
  }, [scriptId]);
};

export default useScriptServerSync;
