/**
 * useScriptShotLinks
 *
 * The board side of the link, read from the script editor's gutter: which shot
 * covers a line, and which lines no shot covers (design §4). The board owns
 * the mapping (`Shot.script_line_ids`), so the gutter inverts it.
 *
 * The open board's live shots win; a board that is not open is read from the
 * server so a thumbnail still appears.
 */

import { useCallback, useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import { trpc } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useScriptStoryboardLink } from "../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

/** The shot covering one line, and how to go look at it. */
export interface ScriptLineShotLink {
  boardId: string;
  shot: Shot;
  /** Open the board's tab and select the shot. */
  open: () => void;
}

interface ScriptLineLink {
  shotLink: ScriptLineShotLink | null;
  /** True when a linked board carries no shot for this line. */
  orphaned: boolean;
}

const NO_LINK: ScriptLineLink = { shotLink: null, orphaned: false };

/**
 * Line id → covering shot, cached against the shots array identity so every
 * row in a long script shares one inversion.
 */
const inverted = new WeakMap<Shot[], Map<string, Shot>>();

const shotByLineId = (shots: Shot[]): Map<string, Shot> => {
  const cached = inverted.get(shots);
  if (cached) {
    return cached;
  }
  const map = new Map<string, Shot>();
  for (const shot of shots) {
    for (const lineId of shot.script_line_ids ?? []) {
      map.set(lineId, shot);
    }
  }
  inverted.set(shots, map);
  return map;
};

export const useScriptLineShotLink = (
  scriptId: string,
  lineId: string
): ScriptLineLink => {
  const boardId = useScriptStoryboardLink(scriptId);
  const openShots = useStoryboardStore((state) =>
    boardId ? state.boards[boardId]?.shots : undefined
  );
  const { data } = trpc.storyboards.get.useQuery(
    { id: boardId ?? "" },
    { enabled: !!boardId && !openShots, staleTime: 30_000, retry: false }
  );
  // SAFETY: the wire document's `shots` is the passthrough zod mirror of
  // `Shot` — the same payload described structurally and nominally.
  const shots = openShots ?? (data?.document.shots as Shot[] | undefined);

  const open = useCallback(() => {
    const shot = boardId && shots ? shotByLineId(shots).get(lineId) : undefined;
    if (!boardId || !shot) {
      return;
    }
    useWorkspaceTabsStore
      .getState()
      .openTab({ type: "storyboard", ref: boardId, mode: "edit" });
    useStoryboardStore.getState().selectShot(boardId, shot.id);
  }, [boardId, shots, lineId]);

  return useMemo(() => {
    if (!boardId || !shots) {
      return NO_LINK;
    }
    const shot = shotByLineId(shots).get(lineId);
    return shot
      ? { shotLink: { boardId, shot, open }, orphaned: false }
      : { shotLink: null, orphaned: true };
  }, [boardId, shots, lineId, open]);
};

export default useScriptLineShotLink;
