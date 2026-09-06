/**
 * useDeriveStoryboard
 *
 * The script → storyboard handoff. The web path is deterministic: one shot per
 * `deriveShotScaffold` entry, linkage and projected text pinned, `action`
 * seeded from the words. Shot content — camera, motion, slug — is the Director
 * pass, which runs in the headless `derive_storyboard_from_script` tool.
 *
 * The board is created linked (its screenplay carries `script_id` and every
 * shot its `script_line_ids`), and the script records the back-pointer for
 * navigation.
 */

import { useCallback, useState } from "react";
import type { Screenplay } from "@nodetool-ai/protocol";

import { trpcClient } from "../../trpc/client";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { newDocumentId } from "../../lib/newDocumentId";
import { writeScriptStoryboardId } from "../../lib/scriptStoryboardBackpointer";
import {
  boardLinkIssues,
  scaffoldShots,
  scriptLinkDocument
} from "../../lib/scriptStoryboardLink";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";

type StoryboardWireDocument = Awaited<
  ReturnType<typeof trpcClient.storyboards.get.query>
>["document"];

interface DeriveStoryboardResult {
  boardId: string;
  shotCount: number;
}

interface UseDeriveStoryboardResult {
  derive: (
    scriptId: string,
    options?: { open?: boolean }
  ) => Promise<DeriveStoryboardResult>;
  deriving: boolean;
  error: string | null;
}

export const useDeriveStoryboard = (): UseDeriveStoryboardResult => {
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derive = useCallback(
    async (
      scriptId: string,
      options: { open?: boolean } = {}
    ): Promise<DeriveStoryboardResult> => {
      const script = useScriptStore.getState().getScript(scriptId);
      if (!script) {
        throw new Error(`No script "${scriptId}".`);
      }
      const existing = script.storyboardId;
      if (existing) {
        throw new Error(
          `This script already has storyboard ${existing}. Open it instead of deriving a second one.`
        );
      }

      setError(null);
      setDeriving(true);
      try {
        const boardId = newDocumentId();
        const shots = scaffoldShots(script, () => crypto.randomUUID());
        if (shots.length === 0) {
          throw new Error(
            "This script has no lines with text — write a line before deriving a storyboard."
          );
        }
        const name = script.title.trim() || "Untitled storyboard";
        const screenplay: Screenplay = {
          type: "screenplay",
          id: newDocumentId(),
          title: name,
          shots,
          script_id: scriptId
        };
        const board: StoryboardBoard = {
          id: boardId,
          screenplay,
          shots,
          title: name,
          brief: "",
          style: "",
          entityIds: [],
          aspectRatio: "16:9",
          setupStage: "done",
          genre: "",
          directorModel: null,
          imageModel: null,
          videoModel: null,
          activeShotId: null,
          timelineId: null,
          updatedAt: Date.now()
        };
        const issues = boardLinkIssues(board, scriptLinkDocument(script));
        if (issues.errors.length > 0) {
          throw new Error(
            `The derived link is invalid: ${issues.errors
              .map((issue) => issue.message)
              .join(" ")}`
          );
        }

        // SAFETY: `storyboardDocument` mirrors `Screenplay`/`Shot` as
        // passthrough zod objects — the same payload described structurally
        // here and nominally there (see useStoryboardServerSync).
        const document = {
          screenplay,
          shots,
          brief: board.brief,
          style: board.style,
          entityIds: board.entityIds,
          aspectRatio: board.aspectRatio,
          setupStage: "done",
          genre: "",
          directorModel: board.directorModel,
          imageModel: board.imageModel,
          videoModel: board.videoModel
        } as unknown as StoryboardWireDocument;
        await trpcClient.storyboards.create.mutate({
          id: boardId,
          name,
          document
        });

        useStoryboardStore.getState().loadBoard(boardId, board);
        // Stamped only now that the board row exists, so a failed second write
        // leaves an unlinked-but-valid pair rather than a pointer at nothing.
        try {
          await writeScriptStoryboardId(scriptId, boardId);
        } catch (writeError) {
          throw new Error(
            `Storyboard ${boardId} was created, but the script's back-pointer failed: ${
              writeError instanceof Error
                ? writeError.message
                : String(writeError)
            }`
          );
        }
        if (options.open !== false) {
          useWorkspaceTabsStore.getState().openTab({
            type: "storyboard",
            ref: boardId,
            mode: "edit",
            title: name
          });
        }
        return { boardId, shotCount: shots.length };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setDeriving(false);
      }
    },
    []
  );

  return { derive, deriving, error };
};

export default useDeriveStoryboard;
