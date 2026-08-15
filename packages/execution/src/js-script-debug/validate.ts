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
 *   Code node, given the document's declared ports. A script has no packages
 *   setting: every installed pack and every platform module resolves by import.
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
 * Where the saved cases and the body disagree about how inputs arrive.
 *
 * A case stages items for a body that never calls `stream`: nothing pulls them,
 * so the case tests less than it looks like it does. A streaming body whose
 * cases stage nothing: every `stream` completes immediately, so the case proves
 * only that the body survives an empty inbox.
 */
function testStreamIssues(
  doc: JsScriptDocument,
  streaming: boolean
): JsScriptDebugIssue[] {
  const staged = doc.tests.filter(
    (testCase) => Object.keys(testCase.inputStreams ?? {}).length > 0
  );
  if (!streaming) {
    return staged.map((testCase) => ({
      severity: "warning" as const,
      code: "js_script_test_streams_unused",
      message:
        `test "${testCase.name}" stages input streams, but the body never ` +
        "calls stream() — the staged items are never read. Read them with " +
        "`for await (const item of stream(name))`, or move them to `inputs`."
    }));
  }
  if (doc.tests.length > 0 && staged.length === 0) {
    return [
      {
        severity: "warning",
        code: "js_script_tests_no_streams",
        message:
          "The body reads its inputs with stream(), but no saved test stages " +
          "any items — every stream ends immediately. Give a case " +
          "`inputStreams` so the cases exercise what the body does."
      }
    ];
  }
  return [];
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

  const { validateCodeNodeBody, usesEmitOutputContract, usesStreamInputContract } =
    await import("@nodetool-ai/node-sdk");

  // A script has no node-configured property values: every declared input is
  // fed by the caller, which is what the graph calls a connected handle. Saying
  // so is what makes the streaming rules right here — `stream("x")` on a
  // declared input never warns "nothing feeds it", and reading a declared input
  // through `inputs.x` in a streaming body is the error it is in a graph.
  const inputNames = doc.inputs.map((port) => port.name);
  const bodyIssues: JsScriptDebugIssue[] = validateCodeNodeBody({
    code: doc.code,
    availableInputs: inputNames,
    connectedInputs: inputNames,
    declaredOutputs: doc.outputs.map((port) => port.name),
    allowInstalledPackages: true,
    sandboxModuleCatalog: options.sandboxModuleCatalog ?? null
  }).map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message
  }));

  const issues = [...shapeIssues, ...bodyIssues];

  const streaming = usesStreamInputContract(doc.code);
  // A streaming body on the return contract is already an error from the body
  // check (`code_stream_return_contract`), which says the same thing.
  const legacy = streaming
    ? null
    : legacyContractIssue(doc, usesEmitOutputContract);
  if (legacy) issues.push(legacy);

  issues.push(...testStreamIssues(doc, streaming));

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
