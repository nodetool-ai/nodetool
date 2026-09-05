/**
 * Human-readable rendering of a `JsScriptValidation`, shared by
 * `jsscript validate` and `jsscript versions restore`.
 */
import type { JsScriptValidation } from "@nodetool-ai/execution/js-script-debug";
import { renderValidation } from "./validation-output.js";

export function renderJsScriptValidation(
  validation: JsScriptValidation
): string[] {
  return renderValidation(validation);
}
