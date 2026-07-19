/**
 * useStoryboardServerSync
 *
 * Server persistence for one storyboard tab. On mount: load the board's
 * server document into the store (or upsert-create it when the tab refs a
 * board the server doesn't know — new tabs and pre-server local boards).
 * After load: watch the store and autosave with a debounce, using the
 * server's `updatedAt` as a CAS token (`baseUpdatedAt`). On a conflict the
 * server copy wins and is reloaded.
 */

import { useEffect, useRef } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

const AUTOSAVE_DEBOUNCE_MS = 750;
const RETRY_DELAY_MS = 5_000;

type StoryboardResponse = Awaited<
  ReturnType<typeof trpcClient.storyboards.get.query>
>;
type StoryboardWireDocument = StoryboardResponse["document"];

/** The saved payload: the board minus identity and transient UI state. */
const boardToDocument = (board: StoryboardBoard): StoryboardWireDocument =>
  ({
    screenplay: board.screenplay,
    shots: board.shots,
    brief: board.brief,
    style: board.style,
    aspectRatio: board.aspectRatio,
    directorModel: board.directorModel,
    imageModel: board.imageModel,
    videoModel: board.videoModel
  }) as unknown as StoryboardWireDocument;

const responseToBoard = (
  res: StoryboardResponse
): Omit<StoryboardBoard, "id" | "updatedAt"> => {
  const doc = res.document;
  return {
    screenplay: doc.screenplay as unknown as Screenplay | null,
    shots: doc.shots as unknown as Shot[],
    title: res.name === "Untitled storyboard" ? "" : res.name,
    brief: doc.brief,
    style: doc.style,
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
  !!error &&
  typeof error === "object" &&
  /not found/i.test((error as Error).message ?? "");

export const useStoryboardServerSync = (boardId: string): void => {
  const utils = trpc.useUtils();
  // The board object reference last written to / read from the server; any
  // other reference in the store means unsaved local edits.
  const syncedRef = useRef<StoryboardBoard | null>(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useStoryboardStore;

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

    const save = async (): Promise<void> => {
      if (disposed || inFlightRef.current) return;
      const board = store.getState().boards[boardId];
      const revision = store.getState().serverRevisions[boardId];
      if (!board || !revision || board === syncedRef.current) return;

      inFlightRef.current = true;
      try {
        const updated = await trpcClient.storyboards.update.mutate({
          id: boardId,
          baseUpdatedAt: revision,
          name: board.title || "Untitled storyboard",
          document: boardToDocument(board),
          timelineId: board.timelineId
        });
        if (disposed) return;
        store.getState().setServerRevision(boardId, updated.updatedAt);
        syncedRef.current = board;
        void utilsRef.current.storyboards.list.invalidate();
        // Edits landed while the save was in flight — go again.
        if (store.getState().boards[boardId] !== syncedRef.current) {
          schedule();
        }
      } catch (error) {
        if (disposed) return;
        console.error("Storyboard autosave failed", error);
        if (/modified since last read/i.test((error as Error).message ?? "")) {
          // CAS conflict: the server copy wins.
          await load();
        } else {
          // Transient failure: keep local edits, retry later.
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
      if (state.boards[boardId] === prev.boards[boardId]) return;
      if (state.boards[boardId] === syncedRef.current) return;
      // Only autosave once the server revision is known (initial load done).
      if (!state.serverRevisions[boardId]) return;
      schedule();
    });

    void load();

    return () => {
      disposed = true;
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [boardId]);
};

export default useStoryboardServerSync;
