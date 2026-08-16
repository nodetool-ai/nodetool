/**
 * useBoardScriptLinkIssues
 *
 * Runs `validateScriptLink` for one board against the script it links, so both
 * editors can show what a save would carry: a line two shots claim, a line the
 * script no longer has, a shot that references lines on an unlinked board, or a
 * script that is gone. Reports nothing for an unlinked board.
 */

import { useMemo } from "react";

import { trpc } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  boardLinkIssues,
  linkIssueMessages
} from "../../lib/scriptStoryboardLink";
import type { ScriptLinkIssue } from "@nodetool-ai/protocol";

export interface BoardScriptLinkIssues {
  errors: ScriptLinkIssue[];
  warnings: ScriptLinkIssue[];
  /** Every issue's message, errors first — what a banner renders. */
  messages: string[];
}

const NO_ISSUES: BoardScriptLinkIssues = {
  errors: [],
  warnings: [],
  messages: []
};

export const useBoardScriptLinkIssues = (
  boardId: string
): BoardScriptLinkIssues => {
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const scriptId = board?.screenplay?.script_id ?? null;
  const { data: script, isError } = trpc.scripts.get.useQuery(
    { id: scriptId ?? "" },
    { enabled: !!scriptId, staleTime: 30_000, retry: false }
  );

  return useMemo(() => {
    if (!board || !scriptId) {
      return NO_ISSUES;
    }
    // A script that has not arrived yet is not a missing script; only a failed
    // fetch means it is gone, which the rules report as a warning.
    if (!script && !isError) {
      return NO_ISSUES;
    }
    const validation = boardLinkIssues(board, script?.document ?? null);
    return { ...validation, messages: linkIssueMessages(validation) };
  }, [board, scriptId, script, isError]);
};

export default useBoardScriptLinkIssues;
