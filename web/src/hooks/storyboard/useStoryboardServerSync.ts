/**
 * useStoryboardServerSync
 *
 * Server persistence for one storyboard tab. On mount: load the board's
 * server document into the store (or upsert-create it when the tab refs a
 * board the server doesn't know — new tabs and pre-server local boards).
 * After load: watch the store and autosave with a debounce, using the
 * server's `updatedAt` as a CAS token (`baseUpdatedAt`). On a conflict the
 * server copy wins and is reloaded.
 *
 * A save that fails is reported to the user. A rejection the server will never
 * accept — an invalid document, a permission error — is not retried at all; a
 * transient one gets a bounded number of retries. The local edits stay in the
 * store either way, so nothing is lost while the board is open.
 *
 * The hook also registers a flush in {@link registerStoryboardSaver}, so a
 * caller that wrote into the store can learn whether the write persisted.
 */

import { useEffect, useRef, useState } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import { getErrorMessage } from "../../utils/errorHandling";
import {
  registerDocumentSync,
  type DocumentLoadState
} from "../../stores/documentSync";
import {
  isPermanentSaveError,
  MAX_TRANSIENT_SAVE_RETRIES
} from "../../utils/saveErrors";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  registerStoryboardSaver,
  type StoryboardSaveResult
} from "./storyboardSaveRegistry";

const AUTOSAVE_DEBOUNCE_MS = 750;
const RETRY_DELAY_MS = 5_000;

type StoryboardResponse = Awaited<
  ReturnType<typeof trpcClient.storyboards.get.query>
>;
type StoryboardWireDocument = StoryboardResponse["document"];

/**
 * The saved payload: the board minus identity and transient UI state.
 *
 * SAFETY: the wire document's `screenplay`/`shots` are the passthrough zod
 * mirrors of `Screenplay`/`Shot` (`api-schemas/storyboards.ts`) — the same
 * payload described twice, once structurally and once nominally — so the
 * board's values are exactly what the schema accepts.
 */
const boardToDocument = (board: StoryboardBoard): StoryboardWireDocument =>
  ({
    screenplay: board.screenplay,
    shots: board.shots,
    brief: board.brief,
    style: board.style,
    entityIds: board.entityIds,
    aspectRatio: board.aspectRatio,
    directorModel: board.directorModel,
    imageModel: board.imageModel,
    videoModel: board.videoModel
  }) as StoryboardWireDocument;

const responseToBoard = (
  res: StoryboardResponse
): Omit<StoryboardBoard, "id" | "updatedAt"> => {
  const doc = res.document;
  // SAFETY: `storyboardResponse` parsed this document server-side, and its
  // `screenplay`/`shots` schemas are the passthrough mirrors of `Screenplay`
  // and `Shot` — the structural type carries an index signature the nominal
  // one does not, which is the whole of the difference.
  return {
    screenplay: doc.screenplay as Screenplay | null,
    shots: doc.shots as Shot[],
    title: res.name === "Untitled storyboard" ? "" : res.name,
    brief: doc.brief,
    style: doc.style,
    entityIds: (doc.entityIds as string[] | undefined) ?? [],
    aspectRatio: doc.aspectRatio,
    directorModel:
      doc.directorModel as StoryboardBoard["directorModel"],
    imageModel: doc.imageModel as StoryboardBoard["imageModel"],
    videoModel: doc.videoModel as StoryboardBoard["videoModel"],
    activeShotId: null,
    timelineId: res.timelineId ?? null
  };
};

const isNotFound = (error: unknown): boolean =>
  /not found/i.test(getErrorMessage(error));

const isConflict = (error: unknown): boolean =>
  /modified since last read/i.test(getErrorMessage(error));

export const useStoryboardServerSync = (
  boardId: string
): DocumentLoadState => {
  const utils = trpc.useUtils();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  // The board object reference last written to / read from the server; any
  // other reference in the store means unsaved local edits.
  const syncedRef = useRef<StoryboardBoard | null>(null);
  const inFlightRef = useRef(false);
  // The save currently in flight, so a flush can await it instead of starting
  // a second, overlapping save.
  const inFlightPromiseRef = useRef<Promise<StoryboardSaveResult> | null>(null);
  // Set when unmount catches a save mid-flight: the finally block runs one
  // more flush save so the pending edit isn't lost with the timer.
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
    const store = useStoryboardStore;
    setLoadState("loading");

    const applyResponse = (res: StoryboardResponse): void => {
      if (disposed) return;
      store.getState().loadBoard(boardId, responseToBoard(res));
      store.getState().setServerRevision(boardId, res.updatedAt);
      syncedRef.current = store.getState().boards[boardId] ?? null;
    };

    const load = async (): Promise<void> => {
      try {
        applyResponse(await trpcClient.storyboards.get.query({ id: boardId }));
      } catch (error) {
        if (!isNotFound(error)) {
          console.error("Failed to load storyboard", error);
          return;
        }
        // Unknown to the server: upsert-create carrying any local content
        // (new tab, or a board from the pre-server localStorage era).
        const local = store.getState().boards[boardId];
        try {
          const created = await trpcClient.storyboards.create.mutate({
            id: boardId,
            name: local?.title || "Untitled storyboard",
            document: local ? boardToDocument(local) : undefined
          });
          if (disposed) return;
          store.getState().setServerRevision(boardId, created.updatedAt);
          syncedRef.current = store.getState().boards[boardId] ?? null;
          void utilsRef.current.storyboards.list.invalidate();
        } catch (createError) {
          console.error("Failed to create storyboard", createError);
        }
      }
    };

    /** Tell the user their storyboard is not on the server. */
    const reportFailure = (message: string): void => {
      const title = store.getState().boards[boardId]?.title;
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        dismissable: true,
        dedupeKey: `storyboard-save-failed:${boardId}`,
        replaceExisting: true,
        content:
          `Storyboard ${title ? `"${title}"` : boardId} could not be saved. ` +
          `Your edits are still open here but are not on the server. ${message}`
      });
    };

    /** The board's last known server state, for a caller that flushes. */
    const currentRevision = (): string | null =>
      store.getState().serverRevisions[boardId] ?? null;

    const runSave = async (
      board: StoryboardBoard,
      revision: string
    ): Promise<StoryboardSaveResult> => {
      let saved = false;
      let result: StoryboardSaveResult;
      try {
        const updated = await trpcClient.storyboards.update.mutate({
          id: boardId,
          baseUpdatedAt: revision,
          name: board.title || "Untitled storyboard",
          document: boardToDocument(board),
          timelineId: board.timelineId
        });
        store.getState().setServerRevision(boardId, updated.updatedAt);
        syncedRef.current = board;
        saved = true;
        retriesRef.current = 0;
        result = { ok: true, updatedAt: updated.updatedAt };
        void utilsRef.current.storyboards.list.invalidate();
        // Edits landed while the save was in flight — go again (via the
        // flush chain when the hook is already unmounted).
        if (store.getState().boards[boardId] !== syncedRef.current) {
          if (disposed || flushAfterSaveRef.current) {
            flushAfterSaveRef.current = true;
          } else {
            schedule();
          }
        }
      } catch (error) {
        const message = getErrorMessage(error, "The server rejected the save.");
        result = { ok: false, error: message };
        console.error("Storyboard autosave failed", error);
        if (isConflict(error)) {
          // CAS conflict: the server copy wins. Unmounted mid-flush, no live
          // hook remains to reload — the next mount reconciles instead.
          if (!disposed) await load();
        } else if (isPermanentSaveError(error)) {
          // Resending the same document can never succeed. Say so once and
          // stop, instead of a retry loop nobody can see.
          retriesRef.current = 0;
          reportFailure(message);
        } else if (disposed) {
          // No live hook remains to retry; the user must still learn of it.
          reportFailure(message);
        } else if (retriesRef.current < MAX_TRANSIENT_SAVE_RETRIES) {
          retriesRef.current += 1;
          schedule(RETRY_DELAY_MS);
        } else {
          retriesRef.current = 0;
          reportFailure(message);
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

    const save = (flush = false): Promise<StoryboardSaveResult> => {
      if (inFlightRef.current) {
        if (flush) flushAfterSaveRef.current = true;
        return (
          inFlightPromiseRef.current ??
          Promise.resolve({ ok: true, updatedAt: currentRevision() })
        );
      }
      const board = store.getState().boards[boardId];
      const revision = store.getState().serverRevisions[boardId];
      if (
        (disposed && !flush) ||
        !board ||
        !revision ||
        board === syncedRef.current
      ) {
        return Promise.resolve({ ok: true, updatedAt: revision ?? null });
      }

      inFlightRef.current = true;
      const pending = runSave(board, revision);
      inFlightPromiseRef.current = pending;
      return pending;
    };

    /**
     * Save now instead of on the debounce, and report the outcome. Waits out
     * the initial load and any save already in flight, so two callers never
     * produce two overlapping writes.
     */
    const flushNow = async (): Promise<StoryboardSaveResult> => {
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
      if (state.boards[boardId] === prev.boards[boardId]) return;
      if (state.boards[boardId] === syncedRef.current) return;
      // Only autosave once the server revision is known (initial load done).
      if (!state.serverRevisions[boardId]) return;
      // A new edit is new content: give it a full retry budget.
      retriesRef.current = 0;
      schedule();
    });

    // Writes from outside this browser (agent doc-ops, CLI, another tab) come
    // in as `resource_change`. A clean tab takes the server copy; a dirty one
    // is told rather than overwritten — its next save hits the CAS conflict
    // and reloads through the same path.
    const unwatch = registerDocumentSync("storyboard", boardId, {
      localRevision: () => store.getState().serverRevisions[boardId] ?? null,
      isDirty: () =>
        inFlightRef.current ||
        (store.getState().boards[boardId] ?? null) !== syncedRef.current,
      reload: () => {
        void load();
      }
    });

    // A caller that wrote into the store can flush and read the outcome for as
    // long as this board is open.
    registerStoryboardSaver(boardId, flushNow);

    // The initial load is the one that gates rendering: a board with no server
    // revision after it has settled is a board that failed to load. Later
    // reloads (CAS conflict, resource_change) leave the state alone — the
    // surface already has a document to show.
    loadPromiseRef.current = load().finally(() => {
      if (disposed) return;
      setLoadState(
        store.getState().serverRevisions[boardId] ? "ready" : "error"
      );
    });
    void loadPromiseRef.current;

    return () => {
      disposed = true;
      registerStoryboardSaver(boardId, null);
      unwatch();
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      // Flush any pending debounced edit instead of dropping it with the
      // timer — leaving the page must not lose the last keystrokes.
      if (inFlightRef.current) flushAfterSaveRef.current = true;
      else void save(true);
    };
  }, [boardId]);

  return loadState;
};

export default useStoryboardServerSync;
