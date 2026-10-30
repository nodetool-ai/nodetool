/**
 * The `--interact` script for `nodetool sketch debug`.
 *
 * A step names one sketch tool and the input to call it with:
 *
 * ```json
 * [{"tool": "add_layer", "input": {"name": "Glow", "type": "raster"}},
 *  {"tool": "ui_sketch_set_layer_props",
 *   "input": {"target": "Glow", "opacity": 0.5, "blendMode": "multiply"}}]
 * ```
 *
 * Both spellings resolve to the same tool: the `ui_sketch_` prefix is what the
 * bridge and the browser call it, and typing it for every step is noise.
 */
import {
  createInteractionScript,
  type InteractionStep
} from "../interaction-script.js";

/** One parsed step, with the tool name in its canonical `ui_sketch_*` form. */
export type SketchInteractionStep = InteractionStep;

export const { normalizeToolName, parseInteractionScript } =
  createInteractionScript<SketchInteractionStep>(
    "ui_sketch_",
    '{"tool":"add_layer","input":{"name":"Glow"}}'
  );
