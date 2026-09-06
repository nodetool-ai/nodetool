/**
 * The idea step's view of what a board was imported from (PRD § 7.1, § 7.7,
 * F3). The record decides whether the brief in the textarea is instructions
 * for the Director or a script the run uses verbatim, so the step follows the
 * document field the way every other setup value does.
 */

import type { StoryboardImportSource } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

export function useImportSource(
  boardId: string
): StoryboardImportSource | null {
  return useStoryboardStore(
    (state) => state.boards[boardId]?.importSource ?? null
  );
}

export default useImportSource;
