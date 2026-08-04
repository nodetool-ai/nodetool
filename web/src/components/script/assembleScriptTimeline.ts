/**
 * assembleScriptTimeline — pure mapping from a script to a timeline document.
 *
 * The mapping lives in `@nodetool-ai/timeline` so the editor's "Send to
 * timeline", the `nodetool.script.*` nodes, and the headless
 * `assemble_script_timeline` agent tool all lay the same voiceover track; this
 * module only adapts the editor's draft shape to it.
 */

import {
  buildScriptTimeline,
  type AssembledScriptTimeline
} from "@nodetool-ai/timeline";
import type { ScriptDraft } from "../../stores/script/ScriptStore";

export {
  currentTake,
  isAssemblableLine,
  takeCaptionWords
} from "@nodetool-ai/timeline";

export type AssembledScriptDocument = AssembledScriptTimeline;

export function buildScriptTimelineDocument(
  script: ScriptDraft
): AssembledScriptDocument {
  return buildScriptTimeline({
    scriptId: script.id,
    cast: script.cast,
    sections: script.sections
  });
}
