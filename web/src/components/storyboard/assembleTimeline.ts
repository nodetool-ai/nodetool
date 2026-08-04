/**
 * assembleTimeline — pure mapping from a storyboard board to a timeline
 * document.
 *
 * The mapping itself lives in `@nodetool-ai/timeline` so the editor and the
 * server-side `assemble_storyboard_timeline` agent tool assemble the same cut;
 * this module only adapts the web board shape to it.
 */

import {
  buildStoryboardTimeline,
  type AssembledTimeline
} from "@nodetool-ai/timeline";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";

export { isAssemblableShot } from "@nodetool-ai/timeline";

export type AssembledDocument = AssembledTimeline;

export function buildTimelineDocument(
  board: StoryboardBoard
): AssembledDocument {
  return buildStoryboardTimeline({
    boardId: board.id,
    shots: board.shots,
    narration: board.screenplay?.narration,
    musicPrompt: board.screenplay?.music_prompt
  });
}
