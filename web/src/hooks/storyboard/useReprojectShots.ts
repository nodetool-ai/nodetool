/**
 * useReprojectShots
 *
 * The script → storyboard direction of the link (design §2.5): a shot's
 * `dialogue`/`narration` and its `script_text_snapshot` are re-read from the
 * script lines it covers, in one board write. The script owns the words, so a
 * writer's edit reaches the board here — the opposite of
 * `useExtractScriptFromBoard`, which re-reads the words from the shots.
 *
 * Rendered stills and clips are never touched: re-rendering stays a separate,
 * explicit action.
 */

import { useCallback, useState } from "react";

import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../stores/script/ScriptStore";
import {
  draftProjectionSource,
  driftedShotIds,
  linkedScriptId,
  projectionSource,
  reprojectedShots,
  type ScriptProjectionSource
} from "../../lib/scriptStoryboardLink";

interface ReprojectOptions {
  /** Shots to re-project; every drifted shot when omitted. */
  shotIds?: string[];
}

interface ReprojectResult {
  scriptId: string;
  /** Shots whose text the pass actually rewrote. */
  reprojectedShotIds: string[];
  /** Shots still carrying drift before the pass ran. */
  driftedShotIds: string[];
}

interface UseReprojectShotsResult {
  reproject: (
    boardId: string,
    options?: ReprojectOptions
  ) => Promise<ReprojectResult>;
  reprojecting: boolean;
  error: string | null;
}

/** The script's words, from the open editor draft when there is one. */
const loadSource = async (
  scriptId: string
): Promise<ScriptProjectionSource> => {
  const draft = useScriptStore.getState().scripts[scriptId];
  if (draft) {
    return draftProjectionSource(draft);
  }
  const script = await trpcClient.scripts.get.query({ id: scriptId });
  return projectionSource(script.document);
};

export const useReprojectShots = (): UseReprojectShotsResult => {
  const [reprojecting, setReprojecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reproject = useCallback(
    async (
      boardId: string,
      options: ReprojectOptions = {}
    ): Promise<ReprojectResult> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      if (!board) {
        throw new Error(`No storyboard "${boardId}".`);
      }
      const scriptId = linkedScriptId(board);
      if (!scriptId) {
        throw new Error(
          "This storyboard links no script — there is nothing to re-project from."
        );
      }
      setError(null);
      setReprojecting(true);
      try {
        const source = await loadSource(scriptId);
        const drifted = driftedShotIds(board.shots, source.linesById);
        const next = reprojectedShots(board.shots, source, options.shotIds);
        const reprojectedIds = next
          .filter((shot, i) => shot !== board.shots[i])
          .map((shot) => shot.id);
        useStoryboardStore
          .getState()
          .reprojectShots(boardId, source, options.shotIds);
        return {
          scriptId,
          reprojectedShotIds: reprojectedIds,
          driftedShotIds: drifted
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setReprojecting(false);
      }
    },
    []
  );

  return { reproject, reprojecting, error };
};

export default useReprojectShots;
