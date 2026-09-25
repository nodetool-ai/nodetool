/**
 * The takes a script hands to a workflow as Audio constants. Each node is
 * titled with the line's words, so a canvas holding a whole script reads in
 * the order it was written.
 */

import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";
import type {
  ScriptSection,
  ScriptTake
} from "../../stores/script/ScriptStore";

const TITLE_WORDS_MAX = 40;

const titleFor = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Voice take";
  }
  return trimmed.length > TITLE_WORDS_MAX
    ? `${trimmed.slice(0, TITLE_WORDS_MAX).trimEnd()}…`
    : trimmed;
};

export const takeWorkflowMedia = (take: ScriptTake): WorkflowMediaItem => ({
  type: "audio",
  asset_id: take.assetId,
  title: titleFor(take.textSnapshot)
});

/** Every line's current take, in script order. Unvoiced lines are skipped. */
export const scriptWorkflowMedia = (
  sections: readonly ScriptSection[]
): WorkflowMediaItem[] =>
  sections.flatMap((section) =>
    section.lines.flatMap((line) => {
      const take = line.takes.find((t) => t.id === line.currentTakeId);
      return take ? [takeWorkflowMedia(take)] : [];
    })
  );
