/**
 * Audio-led shot timing for a board linked to a script.
 *
 * A linked shot is as long as the words it covers: the sum of its lines'
 * current takes plus the silence authored after each. Nothing is stored —
 * `duration_seconds` stays whatever the board wrote — so a re-voice changes
 * the cut the next time anything asks, exactly like `needsVoicing` in
 * `script.ts`.
 *
 * Timeline package rather than protocol because the answer comes from
 * `currentTake`, and it has to agree with `buildScriptTimeline` down to the
 * placeholder used for a take of unknown length: the shot has to be long
 * enough to hold the voiceover clips laid inside it.
 */

import type { Shot } from "@nodetool-ai/protocol";
import type {
  ScriptLine,
  ScriptSection
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { PLACEHOLDER_LINE_MS, currentTake, scriptLines } from "./script.js";

/** Lines of a script keyed by id, the lookup the shot mappings read. */
export const scriptLinesById = (
  sections: ScriptSection[]
): Map<string, ScriptLine> =>
  new Map(scriptLines(sections).map((line) => [line.id, line]));

/**
 * How much timeline one voiced line occupies: its take's length (or the
 * placeholder, as in {@link buildScriptTimeline}) plus the silence after it.
 * `null` when the line has no take backed by an audio asset — the same bar
 * `isAssemblableLine` sets, so a line that is counted here is a line that gets
 * a clip.
 */
export const linkedLineDurationMs = (line: ScriptLine): number | null => {
  const take = currentTake(line);
  if (!take || !take.assetId) {
    return null;
  }
  const durationMs =
    take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS;
  return durationMs + Math.max(0, line.pauseAfterMs ?? 0);
};

/**
 * The audio-derived length of a shot, or `null` when audio must not decide it:
 * the shot links no lines, one of them is unvoiced, a linked line is missing
 * from the script, or the user pinned `duration_source: "manual"`. Callers fall
 * back to the shot's own `duration_seconds` (`DEFAULT_SHOT_MS`).
 */
export function linkedShotDurationMs(
  shot: Shot,
  linesById: Map<string, ScriptLine>
): number | null {
  if (shot.duration_source === "manual") {
    return null;
  }
  const lineIds = shot.script_line_ids ?? [];
  if (lineIds.length === 0) {
    return null;
  }
  let totalMs = 0;
  for (const lineId of lineIds) {
    const line = linesById.get(lineId);
    if (!line) {
      return null;
    }
    const lineMs = linkedLineDurationMs(line);
    if (lineMs === null) {
      return null;
    }
    totalMs += lineMs;
  }
  return totalMs;
}
