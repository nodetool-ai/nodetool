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
  createInteractionScript,
  type InteractionStep
} from "../interaction-script.js";

/** One parsed step, with the tool name in its canonical `ui_timeline_*` form. */
export type TimelineInteractionStep = InteractionStep;

export const { normalizeToolName, parseInteractionScript } =
  createInteractionScript<TimelineInteractionStep>(
    "ui_timeline_",
    '{"tool":"add_track","input":{"type":"audio"}}'
  );
