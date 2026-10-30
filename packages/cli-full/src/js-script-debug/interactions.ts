/**
 * The `--interact` script for `nodetool jsscript debug`.
 *
 * A step names one JS-script tool and the input to call it with:
 *
 * ```json
 * [{"tool": "set_ports", "input": {"outputs": [{"name": "total", "type": "int"}]}},
 *  {"tool": "ui_jsscript_set_code",
 *   "input": {"code": "await output(\"total\", 1);"}}]
 * ```
 *
 * Both spellings resolve to the same tool: the `ui_jsscript_` prefix is what
 * the bridge and the browser call it, and typing it for every step is noise.
 */
import {
  createInteractionScript,
  type InteractionStep
} from "../interaction-script.js";

/** One parsed step, with the tool name in its canonical `ui_jsscript_*` form. */
export type JsScriptInteractionStep = InteractionStep;

export const { normalizeToolName, parseInteractionScript } =
  createInteractionScript<JsScriptInteractionStep>(
    "ui_jsscript_",
    '{"tool":"set_code","input":{"code":"..."}}'
  );
