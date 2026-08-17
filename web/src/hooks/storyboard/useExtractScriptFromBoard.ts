/**
 * useExtractScriptFromBoard
 *
 * The storyboard → script handoff: projects the board's dialogue and narration
 * into a script document (`extractScriptFromScreenplay`), creates the script
 * resource, stamps the link onto the board's screenplay and shots, and opens
 * the script tab.
 *
 * `relink` re-projects onto the script the board already links: line ids are
 * derived from shot ids, so a re-extraction keeps every take it can match and
 * only re-reads the words. The link is stamped after the script row exists, so
 * a failed write leaves an unlinked-but-valid board rather than a half-link.
 */

import { useCallback, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { trpcClient } from "../../trpc/client";
import { useEntities } from "../../serverState/useEntities";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { newDocumentId } from "../../lib/newDocumentId";
import { writeScriptStoryboardId } from "../../lib/scriptStoryboardBackpointer";
import {
  boardLinkIssues,
  extractScriptFromBoard,
  lineTextsById,
  linkedScriptId,
  linkedShots,
  mergeExtractedScript
} from "../../lib/scriptStoryboardLink";

interface ExtractScriptOptions {
  /** Re-project onto the linked script instead of refusing the call. */
  relink?: boolean;
  /** Open the script's tab afterwards. Default true. */
  open?: boolean;
}

export interface ExtractScriptResult {
  scriptId: string;
  /** Lines the extraction wrote. */
  lineCount: number;
  /** Shots that now reference at least one line. */
  linkedShotCount: number;
  /** False when an already-linked script was re-projected. */
  created: boolean;
}

export interface UseExtractScriptResult {
  extract: (
    boardId: string,
    options?: ExtractScriptOptions
  ) => Promise<ExtractScriptResult>;
  extracting: boolean;
  error: string | null;
}

export const useExtractScriptFromBoard = (): UseExtractScriptResult => {
  const { data: allEntities } = useEntities();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(
    async (
      boardId: string,
      options: ExtractScriptOptions = {}
    ): Promise<ExtractScriptResult> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      if (!board) {
        throw new Error(`No storyboard "${boardId}".`);
      }
      const byId = new Map((allEntities ?? []).map((e) => [e.id, e]));
      const entities = board.entityIds
        .map((id) => byId.get(id))
        .filter((e): e is Entity => !!e);

      setError(null);
      setExtracting(true);
      try {
        const existingId = linkedScriptId(board);
        if (existingId && !options.relink) {
          throw new Error(
            `This storyboard already links script ${existingId}. Re-project it with relink instead.`
          );
        }
        const extracted = extractScriptFromBoard(board, entities);
        const texts = lineTextsById(extracted.document);

        // Validate the board as the link will leave it, before either write.
        // The script row does not exist yet on a first extraction, so the
        // screenplay carries a placeholder id: the rules read whether a board
        // is linked, never which script it links.
        const projected = {
          ...board,
          shots: linkedShots(board.shots, extracted.lineIdsByShotId, texts),
          screenplay: board.screenplay
            ? { ...board.screenplay, script_id: existingId ?? "pending" }
            : null
        };
        const issues = boardLinkIssues(projected, extracted.document);
        if (issues.errors.length > 0) {
          throw new Error(
            `The extracted link is invalid: ${issues.errors
              .map((issue) => issue.message)
              .join(" ")}`
          );
        }

        const name = board.title.trim() || "Extracted script";
        let scriptId: string;
        if (existingId) {
          const current = await trpcClient.scripts.get.query({
            id: existingId
          });
          await trpcClient.scripts.update.mutate({
            id: existingId,
            baseUpdatedAt: current.updatedAt,
            document: mergeExtractedScript(current.document, extracted.document)
          });
          scriptId = existingId;
        } else {
          const created = await trpcClient.scripts.create.mutate({
            id: newDocumentId(),
            name,
            document: extracted.document
          });
          scriptId = created.id;
        }

        useStoryboardStore
          .getState()
          .setScriptLink(
            boardId,
            scriptId,
            extracted.lineIdsByShotId,
            texts
          );
        // Last write, once the board carries the forward link: a back-pointer
        // that fails here leaves a valid unlinked script, never a half-link.
        try {
          await writeScriptStoryboardId(scriptId, boardId);
        } catch (writeError) {
          throw new Error(
            `Script ${scriptId} was written and the board links it, but the script's back-pointer failed: ${
              writeError instanceof Error
                ? writeError.message
                : String(writeError)
            }`
          );
        }

        if (options.open !== false) {
          useWorkspaceTabsStore.getState().openTab({
            type: "script",
            ref: scriptId,
            mode: "edit",
            title: name
          });
        }

        return {
          scriptId,
          lineCount: texts.size,
          linkedShotCount: Object.keys(extracted.lineIdsByShotId).length,
          created: !existingId
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setExtracting(false);
      }
    },
    [allEntities]
  );

  return { extract, extracting, error };
};

export default useExtractScriptFromBoard;
