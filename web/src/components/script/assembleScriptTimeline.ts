/**
 * assembleScriptTimeline — pure mapping from a script to a timeline document.
 *
 * The mapping lives in `@nodetool-ai/timeline` so the editor's "Send to
 * timeline", the `nodetool.script.*` nodes, and the headless
 * `assemble_script_timeline` agent tool all lay the same voiceover track; this
 * module only adapts the editor's draft shape to it.
 *
 * A script linked to a storyboard is cut jointly — the board's shots carry the
 * picture and each line's take sits inside the shot that covers it
 * (`buildLinkedTimeline`). Without a board it is the voiceover-only mapping it
 * has always been.
 */

import {
  buildLinkedTimeline,
  buildScriptTimeline,
  type AssembledScriptTimeline
} from "@nodetool-ai/timeline";
import type { ScriptDraft } from "../../stores/script/ScriptStore";
import type { LinkedBoardInput } from "../../lib/linkedAssembly";

export {
  currentTake,
  isAssemblableLine,
  takeCaptionWords
} from "@nodetool-ai/timeline";

export interface AssembledScriptDocument extends AssembledScriptTimeline {
  /** Shots left out of the cut; empty for an unlinked script. */
  skippedShotIds: string[];
  /** True when the board's shots were cut in with the words. */
  linked: boolean;
}

export function buildScriptTimelineDocument(
  script: ScriptDraft,
  board?: LinkedBoardInput | null
): AssembledScriptDocument {
  if (board) {
    return {
      ...buildLinkedTimeline({
        boardId: board.boardId,
        shots: board.shots,
        musicPrompt: board.musicPrompt,
        script: {
          scriptId: script.id,
          cast: script.cast,
          sections: script.sections
        }
      }),
      linked: true
    };
  }
  return {
    ...buildScriptTimeline({
      scriptId: script.id,
      cast: script.cast,
      sections: script.sections
    }),
    skippedShotIds: [],
    linked: false
  };
}
