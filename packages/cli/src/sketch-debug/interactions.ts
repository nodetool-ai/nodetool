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
  isNonBlankString,
  isRecord
} from "../predicates.js";


/** One parsed step, with the tool name in its canonical `ui_sketch_*` form. */
export interface SketchInteractionStep {
  tool: string;
  input: Record<string, unknown>;
}

const PREFIX = "ui_sketch_";

/** `add_layer`, `ui_sketch_add_layer`, and `ui_add_layer` all normalize alike. */
export function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(PREFIX)) return trimmed;
  const bare = trimmed.startsWith("ui_") ? trimmed.slice("ui_".length) : trimmed;
  return `${PREFIX}${bare}`;
}

/** Parse a `--interact` argument, naming the offending step on bad input. */
export function parseInteractionScript(json: string): SketchInteractionStep[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`--interact is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      '--interact must be a JSON array of steps, e.g. \'[{"tool":"add_layer","input":{"name":"Glow"}}]\''
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
