/**
 * useShotDuration
 *
 * Where a shot's length comes from on the web side. A board linked to a script
 * times its shots from the takes they cover (`effectiveShotDuration`, design
 * §2.3); an unlinked board, an unvoiced line, or a shot pinned to
 * `duration_source: "manual"` keeps the shot's own `duration_seconds`.
 *
 * Two entry points because the two callers differ: the card renders inside
 * React and reads the linked script through the query cache, while the clip
 * render starts from a callback with only a board id in hand and fetches once.
 */

import { useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import type { scripts } from "@nodetool-ai/protocol/api-schemas";
import {
  effectiveShotDuration,
  scriptLinesById,
  type EffectiveShotDuration
} from "@nodetool-ai/timeline";

import { trpc, trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

const NO_LINES = new Map<string, scripts.ScriptLine>();

/**
 * The linked script's lines, keyed by id — empty for an unlinked board and
 * while the script is still loading.
 */
export const useBoardScriptLines = (
  boardId: string
): Map<string, scripts.ScriptLine> => {
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const { data: script } = trpc.scripts.get.useQuery(
    { id: scriptId ?? "" },
    { enabled: !!scriptId, staleTime: 30_000, retry: false }
  );
  return useMemo(
    () => (script ? scriptLinesById(script.document.sections) : NO_LINES),
    [script]
  );
};

/** A shot's effective length and where it came from, for one open board. */
export const useShotDuration = (
  boardId: string,
  shot: Shot
): EffectiveShotDuration => {
  const linesById = useBoardScriptLines(boardId);
  return useMemo(
    () => effectiveShotDuration(shot, linesById),
    [shot, linesById]
  );
};

/**
 * The length a clip render should ask for, fetching the linked script when the
 * board has one. A script that cannot be read leaves the shot's own duration
 * in charge rather than failing the render.
 */
export const fetchShotDurationSeconds = async (
  scriptId: string | null | undefined,
  shot: Shot
): Promise<number | undefined> => {
  if (!scriptId || shot.duration_source === "manual") {
    return shot.duration_seconds;
  }
  let linesById = NO_LINES;
  try {
    const script = await trpcClient.scripts.get.query({ id: scriptId });
    linesById = scriptLinesById(script.document.sections);
  } catch {
    // Unreadable script: fall through with no lines, which lands on the
    // shot's own duration below.
  }
  return effectiveShotDuration(shot, linesById).seconds;
};
