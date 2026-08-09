/**
 * Static checks for a Code node (`nodetool.code.Code`) inside a workflow graph.
 *
 * The node's `code` property is the body of one async function that reads the
 * node's dynamic inputs off an `inputs` object and whose returned object's keys
 * are its output handles. Nothing about that contract is enforced until the node runs, so a
 * body that does not parse, reads an input the node does not have, or forgets
 * an output handle that downstream nodes are wired to costs a whole run to
 * discover. Everything here is decidable from the graph alone.
 *
 * Pure functions, no I/O — {@link validateCodeNodeBody} is called by
 * `validateGraph` and unit-tested directly.
 */
import {
  analyzeCodeBody,
  CODE_INPUTS_GLOBAL,
  freeIdentifiers,
  inputsMemberReads,
  moduleDeclarationKinds,
  parseCodeBody,
  returnShapes,
  typeofGuardedNames
} from "./code-analysis.js";

/** Node types whose `code` property is a JavaScript sandbox body. */
export const JS_CODE_NODE_TYPES: ReadonlySet<string> = new Set([
  "nodetool.code.Code"
]);

export function isJsCodeNodeType(nodeType: string): boolean {
  return JS_CODE_NODE_TYPES.has(nodeType);
}

/**
 * Names the QuickJS sandbox and the Code node itself put in scope.
 *
 * Mirrors the sandbox manifest in `@nodetool-ai/agents`
 * (`src/code-gen/sandbox-manifest.ts`), which this package cannot import — the
 * dependency runs the other way, and the manifest pulls in the QuickJS WASM
 * runtime. A name missing here turns a legitimate bridge call into a bogus
 * "not defined" error; a name that is not really in the sandbox hides a real
 * one. The pinning test lives in
 * `packages/agents/tests/sandbox-manifest-drift.test.ts`.
 */
export const SANDBOX_GLOBALS: ReadonlySet<string> = new Set([
  // Guest globals, as observed in the running QuickJS sandbox
  "AggregateError", "Array", "ArrayBuffer", "BigInt", "BigInt64Array",
  "BigUint64Array", "Boolean", "Buffer", "DataView", "Date", "Error",
  "EvalError", "FinalizationRegistry", "Float32Array", "Float64Array",
  "Headers", "Infinity", "Int16Array", "Int32Array", "Int8Array",
  "InternalError", "JSON", "Map", "Math", "NaN", "Number", "Object",
  "Promise", "Proxy", "RangeError", "ReferenceError", "Reflect", "RegExp",
  "Request", "Response", "Set", "SharedArrayBuffer", "String", "Symbol",
  "SyntaxError", "TextDecoder", "TextEncoder", "TypeError", "URIError",
  "URL", "URLSearchParams", "Uint16Array", "Uint32Array", "Uint8Array",
  "Uint8ClampedArray", "WeakMap", "WeakRef", "WeakSet", "decodeURI",
  "decodeURIComponent", "encodeURI", "encodeURIComponent", "env", "escape",
  "globalThis", "isFinite", "isNaN", "parseFloat", "parseInt", "performance",
  "process", "queueMicrotask", "undefined", "unescape",
  // Host bridges
  "console", "fetch", "crypto", "uuid", "sleep", "getSecret", "workspace",
  "assetToSandbox", "sandboxToAsset", "progress", "format", "data",
  "image", "canvas",
  // Pure guest helpers defined by the sandbox prelude
  "toBase64", "fromBase64", "toHex", "fromHex", "utf8Encode", "utf8Decode",
  "parallelMap", "createCanvas",
  // Absent from this guest, but not user inputs either
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "setImmediate", "clearImmediate", "eval", "Function",
  "btoa", "atob", "structuredClone", "Intl", "AbortController", "Blob",
  "FormData",
  // JS literals that acorn parses as Identifier nodes
  "true", "false", "null",
  "this", "arguments", "self", "window", "document",
  // Code node reserved props and the object its declared inputs arrive on
  "code", "timeout", "state", "inputs",
  // Sandbox internals
  "__maxIter"
]);

/**
 * The subset of `SANDBOX_GLOBALS` the guest does not actually have. They stay
 * in that set so neither the graph validator nor the editor's input inference
 * turns one into a dynamic input handle, but a body that reads one gets told
 * what to use instead.
 */
const ABSENT_GLOBALS: ReadonlySet<string> = new Set([
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "setImmediate", "clearImmediate", "eval", "Function",
  "btoa", "atob", "structuredClone", "Intl", "AbortController", "Blob",
  "FormData"
]);

export interface CodeNodeIssue {
  severity: "error" | "warning";
  /**
   * Stable category: "code_syntax" | "code_module" | "code_no_return" |
   * "code_return_shape" | "code_missing_output" | "code_undeclared_output" |
   * "code_undefined_name" | "code_undefined_input" | "code_unused_input".
   */
  code: string;
  message: string;
}

export interface CodeNodeValidationInput {
  /** The node's `code` property. */
  code: unknown;
  /**
   * Names in scope for the body: declared dynamic slots, inline dynamic
   * property values, and handles fed by an incoming edge.
   */
  availableInputs: readonly string[];
  /** Output handles the node declares (`dynamic_outputs` keys). */
  declaredOutputs: readonly string[];
  /** Output handles other nodes are wired to. A superset check on `keys`. */
  connectedOutputs?: readonly string[];
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

/**
 * Check one Code node's body against the handles the graph gives it.
 *
 * A syntax error stops the analysis — every later check reads the AST, and
 * reporting invented output problems on top of "line 3 is not valid JavaScript"
 * only buries the one issue that matters.
 */
export function validateCodeNodeBody(
  input: CodeNodeValidationInput
): CodeNodeIssue[] {
  const code = typeof input.code === "string" ? input.code : "";
  const declared = [...new Set(input.declaredOutputs)];
  const connected = [...new Set(input.connectedOutputs ?? [])];

  if (code.trim() === "") {
    return declared.length > 0 || connected.length > 0
      ? [
          {
            severity: "error",
            code: "code_no_return",
            message: `The code is empty, so the output handle${declared.length + connected.length > 1 ? "s" : ""} ${formatNames(declared.length > 0 ? declared : connected)} never receive a value.`
          }
        ]
      : [];
  }

  const parsed = parseCodeBody(code);
  if ("error" in parsed) {
    const where = parsed.line === undefined ? "" : ` (line ${parsed.line})`;
    return [
      {
        severity: "error",
        code: "code_syntax",
        message: `The code does not parse as JavaScript${where}: ${parsed.error}`
      }
    ];
  }

  const issues: CodeNodeIssue[] = [];

  const moduleKinds = moduleDeclarationKinds(parsed.statements);
  if (moduleKinds.length > 0) {
    issues.push({
      severity: "error",
      code: "code_module",
      message:
        `The code uses \`${moduleKinds.join("` and `")}\` at the top level. The body runs ` +
        "inside an async function, which cannot contain module declarations, and the " +
        "sandbox has no module loader — `import` and `require` do not exist there."
    });
  }

  // ── Names the body reads but nothing puts in scope ───────────────────────
  // Declared inputs are deliberately NOT bare-name scope: they arrive on the
  // `inputs` object, so reading one as a bare name is the ReferenceError the
  // split below reports with the rewrite.
  const inScope = new Set(input.availableInputs);
  const free = freeIdentifiers(parsed.statements);
  const guarded = typeofGuardedNames(parsed.statements);
  const unbound = free.filter((name) => !guarded.has(name));
  const absentNames = [
    ...new Set(unbound.filter((name) => ABSENT_GLOBALS.has(name)))
  ];
  if (absentNames.length > 0) {
    issues.push({
      severity: "error",
      code: "code_undefined_name",
      message:
        `The code reads ${formatNames(absentNames.sort())}, which other JavaScript runtimes ` +
        `have but this sandbox does not — ${absentNames.length > 1 ? "they throw" : "it throws"} ReferenceError. ` +
        "Use the sandbox equivalent: toBase64/fromBase64 for base64, format.* for Intl, " +
        "sleep for timers, JSON round-trip for a deep copy."
    });
  }
  const undefinedNames = unbound.filter(
    (name) => !SANDBOX_GLOBALS.has(name) && !ABSENT_GLOBALS.has(name)
  );
  // A declared input read as a bare name: the pre-`inputs` form. It is a
  // reference to that input, so the unused check below must not also complain.
  const bareInputReads = undefinedNames.filter((name) => inScope.has(name));
  if (undefinedNames.length > 0) {
    const asInputs = [...new Set(bareInputReads)].sort();
    // An input name reads as a bare identifier only in the pre-`inputs` form,
    // which is now a ReferenceError. Naming the rewrite beats "fix the name"
    // for the one mistake every migrated body makes.
    const rest = undefinedNames.filter((name) => !inScope.has(name)).sort();
    if (asInputs.length > 0) {
      issues.push({
        severity: "error",
        code: "code_undefined_name",
        message:
          `The code reads ${formatNames(asInputs)} as ${asInputs.length > 1 ? "bare names" : "a bare name"}, but ` +
          `${asInputs.length > 1 ? "they are inputs" : "it is an input"} of this node — inputs arrive on the \`${CODE_INPUTS_GLOBAL}\` ` +
          `object. Use ${asInputs.map((n) => `\`${CODE_INPUTS_GLOBAL}.${n}\``).join(", ")}.`
      });
    }
    if (rest.length > 0) {
      issues.push({
        severity: "error",
        code: "code_undefined_name",
        message:
          `The code reads ${formatNames(rest)}, which ${rest.length > 1 ? "are" : "is"} neither a sandbox API ` +
          `nor an input of this node — the sandbox throws ReferenceError. Declare ` +
          `${rest.length > 1 ? "them" : "it"} as ${rest.length > 1 ? "dynamic inputs and read them" : "a dynamic input and read it"} off ` +
          `\`${CODE_INPUTS_GLOBAL}\`, or fix the name.`
      });
    }
  }

  const { names: inputsRead, opaque: inputsOpaque } = inputsMemberReads(
    parsed.statements
  );
  const unknownInputs = [
    ...new Set(inputsRead.filter((name) => !inScope.has(name)))
  ].sort();
  if (unknownInputs.length > 0) {
    issues.push({
      severity: "error",
      code: "code_undefined_input",
      message:
        `The code reads ${unknownInputs.map((n) => `\`${CODE_INPUTS_GLOBAL}.${n}\``).join(", ")}, which ` +
        `${unknownInputs.length > 1 ? "are not inputs" : "is not an input"} of this node — the value is undefined at run time. ` +
        `Declare ${unknownInputs.length > 1 ? "them" : "it"} as ${unknownInputs.length > 1 ? "dynamic inputs" : "a dynamic input"}, or fix the name.`
    });
  }

  // An unresolvable read (`inputs[key]`, a spread) could touch any slot, so
  // nothing is provably unused.
  const read = new Set([...inputsRead, ...bareInputReads]);
  const declaredInputsUnused = inputsOpaque
    ? []
    : [...new Set(input.availableInputs.filter((name) => !read.has(name)))];

  // ── Outputs, against every return path the parser can see ────────────────
  const { returns, fallsThrough } = analyzeCodeBody(parsed.statements);
  const expected = declared.length > 0 ? declared : connected;

  if (returns.length === 0) {
    if (expected.length > 0) {
      issues.push({
        severity: "error",
        code: "code_no_return",
        message: `The code never returns, so the output${expected.length > 1 ? "s" : ""} ${formatNames(expected)} stay${expected.length > 1 ? "" : "s"} empty. End it with \`return { ${expected.join(", ")} };\`.`
      });
    } else {
      issues.push({
        severity: "warning",
        code: "code_no_return",
        message:
          "The code never returns, so the node produces no output. Return an " +
          "object — its keys become the node's output handles."
      });
    }
    return withUnusedInputs(issues, declaredInputsUnused);
  }

  if (fallsThrough && expected.length > 0) {
    issues.push({
      severity: "warning",
      code: "code_no_return",
      message: `Execution can reach the end of the code without returning, so the output${expected.length > 1 ? "s" : ""} ${formatNames(expected)} would be empty on that path.`
    });
  }

  const missingSeen = new Set<string>();
  const undeclaredSeen = new Set<string>();
  let reportedNonObject = false;

  for (const statement of returns) {
    for (const shape of returnShapes(statement.argument)) {
      if (shape.notAnObject) {
        if (expected.length > 0 && !reportedNonObject) {
          reportedNonObject = true;
          issues.push({
            severity: "error",
            code: "code_return_shape",
            message: `A return path returns something that is not an object of outputs, so the declared output${expected.length > 1 ? "s" : ""} ${formatNames(expected)} ${expected.length > 1 ? "are" : "is"} never set. Every return must be an object carrying them.`
          });
        }
        continue;
      }
      if (shape.opaque) continue;

      for (const name of expected) {
        if (!shape.keys.has(name)) missingSeen.add(name);
      }
      for (const key of shape.keys) {
        if (!declared.includes(key)) undeclaredSeen.add(key);
      }
    }
  }

  if (missingSeen.size > 0) {
    const missing = [...missingSeen].sort();
    issues.push({
      severity: "warning",
      code: "code_missing_output",
      message: `A return path omits the output${missing.length > 1 ? "s" : ""} ${formatNames(missing)}, which downstream nodes read as empty. Emit every output on every return path and branch with nodetool.control.If or nodetool.control.Switch instead.`
    });
  }

  if (undeclaredSeen.size > 0) {
    const undeclared = [...undeclaredSeen].sort();
    issues.push({
      severity: "warning",
      code: "code_undeclared_output",
      message: `The code returns ${formatNames(undeclared)}, which ${undeclared.length > 1 ? "are" : "is"} not declared as an output handle, so nothing downstream can read ${undeclared.length > 1 ? "them" : "it"}.`
    });
  }

  return withUnusedInputs(issues, declaredInputsUnused);
}

function withUnusedInputs(
  issues: CodeNodeIssue[],
  unused: readonly string[]
): CodeNodeIssue[] {
  if (unused.length > 0) {
    issues.push({
      severity: "warning",
      code: "code_unused_input",
      message: `Input${unused.length > 1 ? "s" : ""} ${formatNames([...unused].sort())} ${unused.length > 1 ? "are" : "is"} never read by the code.`
    });
  }
  return issues;
}
