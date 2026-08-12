/**
 * The static check behind `nodetool jsscript validate` and the
 * `validate_js_script` capability.
 *
 * Two layers, neither forked:
 *
 * - the document's shape and internal consistency come from
 *   `validateJsScriptDocument` in `@nodetool-ai/protocol` — the same function
 *   the model's `beforeSave` and the tRPC router run;
 * - the body analysis comes from `validateCodeNodeBody` in
 *   `@nodetool-ai/node-sdk` — the same function `validateGraph` runs over a
 *   Code node, given the document's declared ports and packages instead of a
 *   graph's slots and edges.
 *
 * On top of both, two rules only a script has: outputs that leave through
 * `return` instead of `emit`/`output` are an error (a script is a new surface,
 * so there is no legacy contract to support), and a declared secret the
 * install does not carry is a warning. Secrets are passed in rather than read
 * here, so a file target stays database-free.
 */

import {
  jsScriptDocument,
  validateJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import type { JsScriptDebugIssue, JsScriptValidation } from "./types.js";

export interface JsScriptValidationOptions {
  /**
   * Secret names this install carries. A declared secret missing from the list
   * is a warning. Omit to skip the check — the store is per-install, and a file
   * target has no database to read it from.
   */
  knownSecrets?: readonly string[];
  /** The installed sandbox catalog, when the caller has one. */
  sandboxModuleCatalog?: SandboxModuleCatalog | null;
}

function split(issues: readonly JsScriptDebugIssue[]): JsScriptValidation {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * A body still on the return contract: it declares outputs and calls neither
 * `emit` nor `output`, so nothing ever reaches a handle.
 */
function legacyContractIssue(
  doc: JsScriptDocument,
  usesEmitOutputContract: (code: string) => boolean
): JsScriptDebugIssue | null {
  const code = doc.code.trim();
  if (code === "" || doc.outputs.length === 0) return null;
  if (usesEmitOutputContract(doc.code)) return null;
  return {
    severity: "error",
    code: "js_script_legacy_contract",
    message:
      "The body declares outputs but calls neither emit() nor output(). A " +
      "script has no return contract: stream a value with " +
      "`await emit(name, value)` and set a final one with " +
      "`await output(name, value)`."
  };
}

/**
 * Check a JS script document without running it. Returns findings rather than
 * throwing: every caller renders them.
 */
export async function validateJsScriptDoc(
  document: unknown,
  options: JsScriptValidationOptions = {}
): Promise<JsScriptValidation> {
  const shapeIssues: JsScriptDebugIssue[] = validateJsScriptDocument(
    document
  ).map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message
  }));

  const parsed = jsScriptDocument.safeParse(document);
  if (!parsed.success) {
    // The document does not even parse, so there is nothing to analyze; the
    // schema findings are the whole answer.
    return split(shapeIssues);
  }
  const doc = parsed.data;

  const { validateCodeNodeBody, usesEmitOutputContract } = await import(
    "@nodetool-ai/node-sdk"
  );

  const bodyIssues: JsScriptDebugIssue[] = validateCodeNodeBody({
    code: doc.code,
    availableInputs: doc.inputs.map((port) => port.name),
    declaredOutputs: doc.outputs.map((port) => port.name),
    declaredPackages: doc.packages,
    sandboxModuleCatalog: options.sandboxModuleCatalog ?? null
  }).map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message
  }));

  const issues = [...shapeIssues, ...bodyIssues];

  const legacy = legacyContractIssue(doc, usesEmitOutputContract);
  if (legacy) issues.push(legacy);

  if (options.knownSecrets !== undefined) {
    const known = new Set(options.knownSecrets);
    for (const name of doc.secrets) {
      if (name.trim() !== "" && !known.has(name)) {
        issues.push({
          severity: "warning",
          code: "js_script_secret_missing",
          message: `Declared secret "${name}" is not in this install's secret store.`
        });
      }
    }
  }

  return split(issues);
}
