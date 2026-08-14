/**
 * `@nodetool-ai/execution/js-script-debug` — JS script validation + debug
 * report.
 *
 * Pure core: no DB, no sandbox, no browser. Hosts (the CLI `jsscript` command,
 * the `validate_js_script` capability) resolve the target and write the bundle.
 */

export type {
  JsScriptDebugIssue,
  JsScriptValidation,
  JsScriptInteractionRecord,
  JsScriptDebugTarget,
  JsScriptDocumentMeta,
  JsScriptDebugReport
} from "./types.js";

export {
  validateJsScriptDoc,
  type JsScriptValidationOptions
} from "./validate.js";
export {
  missingDeclaredJsScriptOutputs,
  emptyDeclaredJsScriptOutputsError
} from "./outputs.js";
export {
  buildJsScriptDebugReport,
  type JsScriptDebugReportInput
} from "./report.js";
export { renderJsScriptReportMarkdown } from "./markdown.js";
