/**
 * assembleTimeline — pure mapping from a storyboard board to a timeline
 * document.
 *
 * The mapping itself lives in `@nodetool-ai/timeline` so the editor and the
 * server-side `assemble_storyboard_timeline` agent tool assemble the same cut;
 * this module only adapts the web board shape to it.
 *
 * A board linked to a script is cut jointly: each shot runs as long as the
 * takes it covers and every voiced line gets its own voiceover clip
 * (`buildLinkedTimeline`). Without a script — unlinked, or linked to a script
 * that could not be read — it is the storyboard mapping it has always been.
 */

import {
  buildLinkedTimeline,
  buildStoryboardTimeline,
  type AssembledTimeline,
  type ScriptAssemblyInput
} from "@nodetool-ai/timeline";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";
import { linkedScriptId } from "../../lib/scriptStoryboardLink";

export { isAssemblableShot } from "@nodetool-ai/timeline";

interface AssembledDocument extends AssembledTimeline {
  /** Linked lines that got no clip; empty for an unlinked board. */
  skippedLineIds: string[];
  /** True when the script's words were cut in with the shots. */
  linked: boolean;
}

export function buildTimelineDocument(
  board: StoryboardBoard,
  script?: ScriptAssemblyInput | null
): AssembledDocument {
  if (script && linkedScriptId(board)) {
    return {
      ...buildLinkedTimeline({
        boardId: board.id,
        shots: board.shots,
        musicPrompt: board.screenplay?.music_prompt,
        script
      }),
      linked: true
    };
  }
  return {
    ...buildStoryboardTimeline({
      boardId: board.id,
      shots: board.shots,
      narration: board.screenplay?.narration,
      musicPrompt: board.screenplay?.music_prompt
    }),
    skippedLineIds: [],
    linked: false
  };
}
