/**
 * useStoryboardServerSync
 *
 * Server persistence for one storyboard tab. The shared document-sync
 * controller owns debounce, ordering, CAS retry, and teardown flushing. This
 * hook supplies the Storyboard-specific wire conversion and shot merge
 * adapter, so external changes remain shot-level and never enter undo history.
 */

import { useEffect, useRef, useState } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import type { DocumentOp, Screenplay, Shot } from "@nodetool-ai/protocol";
import { getErrorMessage } from "../../utils/errorHandling";
import {
  createDocumentSyncController,
  registerDocumentSync,
  type DocumentLoadState,
  type DocumentSyncController
} from "../../stores/documentSync";
import { mergeByUnits, type MergeConflict } from "../../stores/documentMerge";
import { useConflictStore } from "../../stores/ConflictStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { storyboardMergeAdapter } from "../../stores/storyboard/merge";
import { isPermanentSaveError } from "../../utils/saveErrors";
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

const boardToDocument = (board: StoryboardBoard): StoryboardWireDocument =>
  ({
    screenplay: board.screenplay,
    shots: board.shots,
    brief: board.brief,
    style: board.style,
    entityIds: board.entityIds,
    aspectRatio: board.aspectRatio,
    setupStage: board.setupStage,
    genre: board.genre,
    directorModel: board.directorModel,
    imageModel: board.imageModel,
    videoModel: board.videoModel,
    importSource: board.importSource ?? null,
    setupShotCount: board.setupShotCount,
    setupDirectedFrom: board.setupDirectedFrom ?? null
  }) as StoryboardWireDocument;

const responseToBoard = (
  res: StoryboardResponse
): Omit<StoryboardBoard, "id" | "updatedAt"> => {
  const doc = res.document;
  return {
    screenplay: doc.screenplay as Screenplay | null,
    shots: doc.shots as Shot[],
    title: res.name === "Untitled storyboard" ? "" : res.name,
    brief: doc.brief,
    style: doc.style,
    entityIds: (doc.entityIds as string[] | undefined) ?? [],
    aspectRatio: doc.aspectRatio,
    setupStage: doc.setupStage,
    genre: doc.genre,
    directorModel: doc.directorModel as StoryboardBoard["directorModel"],
    imageModel: doc.imageModel as StoryboardBoard["imageModel"],
    videoModel: doc.videoModel as StoryboardBoard["videoModel"],
    importSource: doc.importSource ?? null,
    setupShotCount: doc.setupShotCount,
    setupDirectedFrom: doc.setupDirectedFrom ?? null,
    activeShotId: null,
    timelineId: res.timelineId ?? null
  };
};

const isNotFound = (error: unknown): boolean =>
  /not found/i.test(getErrorMessage(error));

const isConflict = (error: unknown): boolean =>
  /modified since last read/i.test(getErrorMessage(error));

interface ExternalNotice {
  updatedAt: string | null;
  ops?: DocumentOp[];
}

export const useStoryboardServerSync = (
  boardId: string
): DocumentLoadState => {
  const utils = trpc.useUtils();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const syncedRef = useRef<StoryboardBoard | null>(null);
  const revisionRef = useRef<string | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useStoryboardStore;
    setLoadState("loading");
    const pendingNotices: ExternalNotice[] = [];

    const isDirty = (): boolean =>
      (store.getState().boards[boardId] ?? null) !== syncedRef.current;

    const applyResponse = (res: StoryboardResponse): void => {
      if (disposed) return;
      store.getState().loadBoard(boardId, responseToBoard(res));
      revisionRef.current = res.updatedAt;
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
        const local = store.getState().boards[boardId];
        try {
          const created = await trpcClient.storyboards.create.mutate({
            id: boardId,
            name: local?.title || "Untitled storyboard",
            document: local ? boardToDocument(local) : undefined
          });
          if (disposed) return;
          revisionRef.current = created.updatedAt;
          store.getState().setServerRevision(boardId, created.updatedAt);
          syncedRef.current = store.getState().boards[boardId] ?? null;
          void utilsRef.current.storyboards.list.invalidate();
        } catch (createError) {
          console.error("Failed to create storyboard", createError);
        }
      }
    };

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

    const acceptConflict = (
      conflict: MergeConflict,
      serverBoard: StoryboardBoard | null
    ): void => {
      const s = store.getState();
      if (conflict.reason === "replaced") {
        if (serverBoard) s.loadBoard(boardId, serverBoard, { checkpoint: true });
        return;
      }
      if (conflict.reason === "deleted" && conflict.external === null) {
        s.removeShot(boardId, conflict.unit.id);
        return;
      }
      if (conflict.unit.kind === "shot" && conflict.external != null) {
        const shot = conflict.external as Shot;
        if (s.boards[boardId]?.shots.some((candidate) => candidate.id === shot.id)) {
          s.updateShot(boardId, shot.id, shot);
        } else {
          s.upsertShot(boardId, shot);
        }
        return;
      }
      if (conflict.unit.kind !== "field" || !serverBoard) return;
      const field = conflict.unit.id as keyof StoryboardBoard;
      const value = serverBoard[field];
      switch (field) {
        case "brief":
          s.setBrief(boardId, value as string);
          break;
        case "style":
          s.setStyle(boardId, value as string);
          break;
        case "aspectRatio":
          s.setAspectRatio(boardId, value as string);
          break;
        case "entityIds":
          s.setEntityIds(boardId, value as string[]);
          break;
        case "directorModel":
          s.setDirectorModel(boardId, value as StoryboardBoard["directorModel"]);
          break;
        case "imageModel":
          s.setImageModel(boardId, value as StoryboardBoard["imageModel"]);
          break;
        case "videoModel":
          s.setVideoModel(boardId, value as StoryboardBoard["videoModel"]);
          break;
        case "timelineId":
          s.setTimelineLink(boardId, value as string | null);
          break;
        case "screenplay":
          if (value) s.setScreenplay(boardId, value as Screenplay);
          break;
        default:
          break;
      }
    };

    const mergeExternal = async (
      notice: ExternalNotice,
      prefetched?: StoryboardResponse
    ): Promise<void> => {
      let res: StoryboardResponse;
      if (prefetched) {
        res = prefetched;
      } else {
        try {
          res = await trpcClient.storyboards.get.query({ id: boardId });
        } catch (error) {
          console.error("Failed to fetch storyboard for merge", error);
          return;
        }
      }
      if (disposed) return;
      const base = syncedRef.current;
      const draft = store.getState().boards[boardId];
      if (!base || !draft || base === draft) return;

      const serverBoard: StoryboardBoard = {
        ...responseToBoard(res),
        id: boardId,
        updatedAt: Date.now()
      };
      const { doc: merged, conflicts, nextBase } = mergeByUnits(
        base,
        draft,
        serverBoard,
        storyboardMergeAdapter,
        { ops: notice.ops }
      );
      store.getState().applyMerged(boardId, merged);
      revisionRef.current = res.updatedAt;
      store.getState().setServerRevision(boardId, res.updatedAt);
      syncedRef.current = { ...nextBase, id: boardId, updatedAt: Date.now() };

      const listed = conflicts.map((conflict) =>
        conflict.unit.id
          ? conflict
          : { ...conflict, unit: { ...conflict.unit, id: conflict.unit.kind } }
      );
      useConflictStore.getState().addConflicts(`storyboard:${boardId}`, listed, {
        onAccept: (unitId) => {
          const entry = useConflictStore.getState().byKey[`storyboard:${boardId}`];
          const conflict = entry?.conflicts.find((item) => item.unit.id === unitId);
          if (conflict) acceptConflict(conflict, serverBoard);
        },
        onDiscard: () => {}
      });
    };

    const currentRevision = (): string | null =>
      store.getState().serverRevisions[boardId] ?? null;
    let controller: DocumentSyncController;

    const flushNow = async (): Promise<StoryboardSaveResult> => {
      await loadPromiseRef.current;
      return controller.flush();
    };

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.boards[boardId] === prev.boards[boardId]) return;
      if (state.boards[boardId] === syncedRef.current) return;
      if (!state.serverRevisions[boardId]) return;
      controller.markDirty();
    });

    const unwatch = registerDocumentSync("storyboard", boardId, {
      localRevision: currentRevision,
      isDirty,
      reload: () => {
        void load();
      },
      merge: (notice) => {
        if (controller.isSaving()) {
          pendingNotices.push(notice);
          return;
        }
        void mergeExternal(notice);
      }
    });

    controller = createDocumentSyncController<StoryboardBoard>({
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      retryDelayMs: RETRY_DELAY_MS,
      getDraft: () => store.getState().boards[boardId] ?? null,
      getRevision: currentRevision,
      isDirty,
      save: async (board, revision) => {
        const updated = await trpcClient.storyboards.update.mutate({
          id: boardId,
          baseUpdatedAt: revision,
          name: board.title || "Untitled storyboard",
          document: boardToDocument(board),
          timelineId: board.timelineId
        });
        revisionRef.current = updated.updatedAt;
        store.getState().setServerRevision(boardId, updated.updatedAt);
        void utilsRef.current.storyboards.list.invalidate();
        const notices = pendingNotices.splice(0, pendingNotices.length);
        for (const notice of notices) {
          if (notice.updatedAt === updated.updatedAt) continue;
          await mergeExternal(notice);
        }
        if (store.getState().boards[boardId] === board) {
          syncedRef.current = board;
        }
        if (store.getState().boards[boardId] !== board) controller.markDirty();
        return { updatedAt: updated.updatedAt };
      },
      recoverCasConflict: async () => {
        const notices = pendingNotices.splice(0, pendingNotices.length);
        for (const notice of notices) {
          await mergeExternal(notice);
        }
        if (!isDirty()) {
          await load();
          return;
        }
        const res = await trpcClient.storyboards.get.query({ id: boardId });
        if (res.updatedAt !== revisionRef.current) {
          await mergeExternal({ updatedAt: res.updatedAt }, res);
        }
      },
      isCasConflict: isConflict,
      isRetryableError: (error) => !isPermanentSaveError(error),
      onStatus: (status) => {
        if (status === "error") reportFailure("The server rejected the save.");
      }
    });

    registerStoryboardSaver(boardId, flushNow);
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
      useConflictStore.getState().clear(`storyboard:${boardId}`);
      controller.dispose();
    };
  }, [boardId]);

  return loadState;
};

export default useStoryboardServerSync;
