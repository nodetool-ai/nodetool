/**
 * The `--interact` script for `nodetool timeline debug`.
 *
 * A step names one timeline tool and the input to call it with:
 *
 * ```json
 * [{"tool": "add_track", "input": {"type": "audio"}},
 *  {"tool": "ui_timeline_animate_clip",
 *   "input": {"target": "Title", "animations": [{"role": "in", "preset": "fade"}]}}]
 * ```
 *
 * Both spellings resolve to the same tool: the `ui_timeline_` prefix is what
 * the bridge and the browser call it, and typing it for every step is noise.
 */
import {
  isNonBlankString,
  isRecord
} from "../predicates.js";


/** One parsed step, with the tool name in its canonical `ui_timeline_*` form. */
export interface TimelineInteractionStep {
  tool: string;
  input: Record<string, unknown>;
}

const PREFIX = "ui_timeline_";

/** `add_track`, `ui_timeline_add_track`, and `ui_add_track` all normalize alike. */
export function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(PREFIX)) return trimmed;
  const bare = trimmed.startsWith("ui_") ? trimmed.slice("ui_".length) : trimmed;
  return `${PREFIX}${bare}`;
}

/** Parse a `--interact` argument, naming the offending step on bad input. */
export function parseInteractionScript(json: string): TimelineInteractionStep[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`--interact is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      '--interact must be a JSON array of steps, e.g. \'[{"tool":"add_track","input":{"type":"audio"}}]\''
    );
  }
  return parsed.map((step, index) => {
    if (!isRecord(step) || !isNonBlankString(step.tool)) {
      throw new Error(`--interact step ${index + 1} has no \`tool\` name.`);
    }
    const input = step.input ?? {};
    if (!isRecord(input)) {
      throw new Error(`--interact step ${index + 1}: \`input\` must be an object.`);
    }
    return { tool: normalizeToolName(step.tool), input: { ...input } };
  });
}
