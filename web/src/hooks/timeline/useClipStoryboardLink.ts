/**
 * useClipStoryboardLink
 *
 * The way back from the cut to the board. A clip assembled from a storyboard
 * carries `storyboardBoardId`/`storyboardShotId`; this resolves those into the
 * shot itself so the inspector can name it and jump there with it selected.
 *
 * The open board's live shots win; a board that is not open is read from the
 * server, so the chip names the shot either way.
 */

import { useCallback, useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import { trpc } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";

/** The shot a clip came from, and how to go look at it. */
export interface ClipStoryboardLink {
  boardId: string;
  shot: Shot;
  /** "from Board · SH 03". */
  label: string;
  /** Open the board's tab with the shot selected. */
  open: () => void;
}

export const useClipStoryboardLink = (
  boardId: string | null | undefined,
  shotId: string | null | undefined
): ClipStoryboardLink | null => {
  const openShots = useStoryboardStore((state) =>
    boardId ? state.boards[boardId]?.shots : undefined
  );
  const boardTitle = useStoryboardStore((state) =>
    boardId ? state.boards[boardId]?.title : undefined
  );
  const { data } = trpc.storyboards.get.useQuery(
    { id: boardId ?? "" },
    { enabled: !!boardId && !openShots, staleTime: 30_000, retry: false }
  );
  // SAFETY: the wire document's `shots` is the passthrough zod mirror of
  // `Shot` — the same payload described structurally and nominally.
  const shots = openShots ?? (data?.document.shots as Shot[] | undefined);
  const title = boardTitle ?? data?.name;

  const shot = useMemo(
    () => (shotId ? shots?.find((s) => s.id === shotId) : undefined),
    [shots, shotId]
  );

  const open = useCallback(() => {
    if (!boardId || !shot) {
      return;
    }
    // Park the shot before the tab opens: a board that is not already open has
    // no store entry to select in yet.
    requestDocumentFocus({
      type: "storyboard",
      ref: boardId,
      shotId: shot.id
    });
    useWorkspaceTabsStore.getState().openTab({
      type: "storyboard",
      ref: boardId,
      mode: "edit",
      title
    });
  }, [boardId, shot, title]);

  return useMemo(() => {
    if (!boardId || !shot) {
      return null;
    }
    return {
      boardId,
      shot,
      label: `from Board · SH ${String(shot.index + 1).padStart(2, "0")}`,
      open
    };
  }, [boardId, shot, open]);
};

export default useClipStoryboardLink;
