/**
 * Static checks for a Code node (`nodetool.code.Code`) inside a workflow graph.
 *
 * The node's `code` property is the body of one async function that reads the
 * node's dynamic inputs off an `inputs` object and sends its outputs through
 * `emit`/`output` calls — or, when it calls neither, through the legacy
 * returned object's keys. Nothing about that contract is enforced until the node runs, so a
 * body that does not parse, reads an input the node does not have, or forgets
 * an output handle that downstream nodes are wired to costs a whole run to
 * discover. Everything here is decidable from the graph alone.
 *
 * Pure functions, no I/O — {@link validateCodeNodeBody} is called by
 * `validateGraph` and unit-tested directly.
 */
import {
  SANDBOX_CAPABILITY_PACK,
  type SandboxModuleDeclaration
} from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import type { CodeBodyStatement } from "./code-analysis.js";
import {
  analyzeCodeBody,
  CODE_INPUTS_GLOBAL,
  dynamicModuleAccess,
  freeIdentifiers,
  inputsMemberReads,
  moduleDeclarationKinds,
  outputCallNames,
  parseCodeBody,
  returnShapes,
  staticImportSpecifiers,
  streamCallNames,
  typeofGuardedNames
} from "./code-analysis.js";
import {
  usesEmitOutputContract,
  usesStreamInputContract
} from "./code-body.js";
import { installHintFor } from "./sandbox-bridge-packs.js";

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
  "BigUint64Array", "Boolean", "DataView", "Date", "Error",
  "EvalError", "FinalizationRegistry", "Float32Array", "Float64Array",
  "Infinity", "Int16Array", "Int32Array", "Int8Array",
  "InternalError", "JSON", "Map", "Math", "NaN", "Number", "Object",
  "Promise", "Proxy", "RangeError", "ReferenceError", "Reflect", "RegExp",
  "Set", "SharedArrayBuffer", "String", "Symbol",
  "SyntaxError", "TextDecoder", "TextEncoder", "TypeError", "URIError",
  "URL", "URLSearchParams", "Uint16Array", "Uint32Array", "Uint8Array",
  "Uint8ClampedArray", "WeakMap", "WeakRef", "WeakSet", "decodeURI",
  "decodeURIComponent", "encodeURI", "encodeURIComponent", "escape",
  "globalThis", "isFinite", "isNaN", "parseFloat", "parseInt",
  "queueMicrotask", "undefined", "unescape",
  // Host bridges
  "console", "fetch", "crypto", "sleep", "getSecret", "workspace",
  "assetToSandbox", "sandboxToAsset", "progress", "emit", "output", "format",
  "image", "audio", "video", "canvas", "media", "stream",
  // Pure guest helpers defined by the sandbox prelude
  "toBase64", "fromBase64", "toHex", "fromHex",
  "parallelMap", "createCanvas",
  // The tool bridge preludes: `tools.<name>()` wrappers and the `nodetool`
  // object model over them
  "tools", "nodetool",
  // Absent from this guest, but not user inputs either
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "setImmediate", "clearImmediate", "eval", "Function",
  "btoa", "atob", "structuredClone", "Intl", "AbortController", "Blob",
  "FormData", "Buffer", "Headers", "Request", "Response", "env", "process",
  "performance", "uuid", "utf8Encode", "utf8Decode",
  // JS literals that acorn parses as Identifier nodes
  "true", "false", "null",
  "this", "arguments", "self", "window", "document",
  // Code node reserved props and the object its declared inputs arrive on
  "code", "timeout", "state", "inputs",
  // Sandbox internals
  "__maxIter", "__secretScope"
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
  "FormData",
  // Removed guest names: deleted quickjs stubs and retired prelude aliases
  "Buffer", "Headers", "Request", "Response", "env", "process",
  "performance", "uuid", "utf8Encode", "utf8Decode"
]);

export interface CodeNodeIssue {
  severity: "error" | "warning";
  /**
   * Stable category: "code_syntax" | "code_module" | "code_no_return" |
   * "code_return_shape" | "code_missing_output" | "code_undeclared_output" |
   * "code_output_dynamic_name" | "code_return_ignored" |
   * "code_undefined_name" | "code_undefined_input" | "code_unused_input" |
   * "code_unused_package" | "code_package_unavailable" |
   * "code_package_mismatch" | "code_undefined_stream" |
   * "code_stream_dynamic_name" | "code_unconnected_stream" |
   * "code_stream_input_read" | "code_stream_return_contract".
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
  /**
   * Input handles an incoming edge feeds. A subset of `availableInputs`, and
   * the only handles a streaming body can take from — a declared handle with
   * no edge yields nothing, and a connected handle is unreadable through
   * `inputs.<name>`.
   */
  connectedInputs?: readonly string[];
  /** Output handles the node declares (`dynamic_outputs` keys). */
  declaredOutputs: readonly string[];
  /** Output handles other nodes are wired to. A superset check on `keys`. */
  connectedOutputs?: readonly string[];
  /**
   * Sandbox modules the node declares in its `packages` property. The guest
   * loader serves exactly these, so an import of anything else fails at run
   * time and a declaration nothing imports is dead weight.
   */
  declaredPackages?: readonly SandboxModuleDeclaration[];
  /**
   * The installed catalog, when the caller has one. Given it, the declarations
   * are resolved offline: a specifier no installed pack offers is an error, and
   * a pack version or content digest that moved since the workflow was saved is
   * a warning.
   */
  sandboxModuleCatalog?: SandboxModuleCatalog | null;
  /**
   * A JS script has no `packages` setting: every installed pack and every
   * platform module (`@nodetool-ai/sandbox-nodetool/<namespace>`) resolves by
   * import. When this is set, an undeclared import is not an error, unused
   * declarations are not warned, and only imported pack specifiers are
   * checked against the catalog.
   */
  allowInstalledPackages?: boolean;
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

/** NodeTool's own guest modules — not pack declarations. */
function isCapabilitySpecifier(specifier: string): boolean {
  return (
    specifier === SANDBOX_CAPABILITY_PACK ||
    specifier.startsWith(`${SANDBOX_CAPABILITY_PACK}/`)
  );
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

  if (moduleDeclarationKinds(parsed.statements).includes("export")) {
    issues.push({
      severity: "error",
      code: "code_module",
      message:
        "The code uses `export` at the top level. The body runs inside an async " +
        "function, which cannot contain an export declaration. Write top-level " +
        "statements only — do not wrap the body in `export async function run`."
    });
  }

  const declaredSpecifiers = new Set(
    (input.declaredPackages ?? []).map((declaration) => declaration.specifier)
  );
  const imported = staticImportSpecifiers(parsed.statements);
  const allowInstalled = input.allowInstalledPackages === true;
  const undeclaredImports = [
    ...new Set(
      imported.filter((specifier) => {
        if (declaredSpecifiers.has(specifier)) return false;
        if (allowInstalled && isCapabilitySpecifier(specifier)) return false;
        return !allowInstalled;
      })
    )
  ].sort();
  if (undeclaredImports.length > 0) {
    issues.push({
      severity: "error",
      code: "code_module",
      message:
        `The code imports ${formatNames(undeclaredImports)}, which this node does not ` +
        `declare — the sandbox resolves only the modules listed in the node's ` +
        `\`packages\` property. Add ${undeclaredImports.length > 1 ? "them" : "it"} there, ` +
        "or remove the import."
    });
  }

  const dynamic = dynamicModuleAccess(parsed.statements);
  if (dynamic.dynamicImport || dynamic.require) {
    const used = [
      ...(dynamic.dynamicImport ? ["import()"] : []),
      ...(dynamic.require ? ["require()"] : [])
    ];
    issues.push({
      severity: "error",
      code: "code_module",
      message: allowInstalled
        ? `The code uses \`${used.join("` and `")}\`, which the sandbox does not support — ` +
          "the loader denies every dynamic resolution. Import the module with a static " +
          "`import` at the top of the code."
        : `The code uses \`${used.join("` and `")}\`, which the sandbox does not support — ` +
          "the loader denies every dynamic resolution. Declare the module in the node's " +
          "`packages` property and import it with a static `import` at the top of the code."
    });
  }

  if (allowInstalled) {
    issues.push(
      ...catalogIssues(
        input.sandboxModuleCatalog,
        imported
          .filter((specifier) => !isCapabilitySpecifier(specifier))
          .map((specifier) => ({ specifier }))
      )
    );
  } else if (declaredSpecifiers.size > 0) {
    const unusedPackages = [...declaredSpecifiers].filter(
      (specifier) => !imported.includes(specifier)
    );
    if (unusedPackages.length > 0) {
      issues.push({
        severity: "warning",
        code: "code_unused_package",
        message: `The node declares ${formatNames(unusedPackages.sort())} in \`packages\`, which the code never imports.`
      });
    }
    issues.push(
      ...catalogIssues(input.sandboxModuleCatalog, input.declaredPackages ?? [])
    );
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
        "sleep for timers, JSON round-trip for a deep copy, crypto.randomUUID() for uuid, " +
        "new TextEncoder()/new TextDecoder() for utf8Encode/utf8Decode, and plain " +
        "fetch() objects instead of Headers/Request/Response."
    });
  }
  // `require` already has its own issue above; reporting it again as an
  // invented name would say the same thing twice with worse advice.
  const undefinedNames = unbound.filter(
    (name) =>
      !SANDBOX_GLOBALS.has(name) &&
      !ABSENT_GLOBALS.has(name) &&
      !(name === "require" && dynamic.require)
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

  // ── Input streams ────────────────────────────────────────────────────────
  // A body that calls `stream` runs once and drains its inbox itself. Its
  // handles are named the same way its outputs are, so they are checkable the
  // same way — and the split between configured values (`inputs`) and edge data
  // (`stream`) is the one footgun the contract creates, closed here.
  const streaming = usesStreamInputContract(code);
  const streams = streamCallNames(parsed.statements);
  const connectedInputs = new Set(input.connectedInputs ?? []);

  if (streaming) {
    const unknownStreams = [
      ...new Set(streams.names.filter((name) => !inScope.has(name)))
    ].sort();
    if (unknownStreams.length > 0) {
      issues.push({
        severity: "error",
        code: "code_undefined_stream",
        message:
          `The code takes from ${formatNames(unknownStreams)}, which ` +
          `${unknownStreams.length > 1 ? "are not inputs" : "is not an input"} of this node — the stream never yields. ` +
          `Declare ${unknownStreams.length > 1 ? "them" : "it"} as ${unknownStreams.length > 1 ? "dynamic inputs" : "a dynamic input"}, or fix the name.`
      });
    }

    if (streams.nonLiteral) {
      issues.push({
        severity: "warning",
        code: "code_stream_dynamic_name",
        message:
          "The code calls `stream` with a handle name that is not a string literal, " +
          "so the stream names cannot be checked statically. Pass a literal name to " +
          "have them checked."
      });
    }

    const unconnectedStreams = [
      ...new Set(
        streams.names.filter(
          (name) => inScope.has(name) && !connectedInputs.has(name)
        )
      )
    ].sort();
    if (unconnectedStreams.length > 0) {
      issues.push({
        severity: "warning",
        code: "code_unconnected_stream",
        message:
          `The code takes from ${formatNames(unconnectedStreams)}, which no incoming edge feeds — ` +
          `the stream completes immediately and yields nothing. Connect an upstream node, ` +
          `or read the node's configured value with ${unconnectedStreams.map((n) => `\`${CODE_INPUTS_GLOBAL}.${n}\``).join(", ")}.`
      });
    }

    const streamedThroughInputs = [
      ...new Set(inputsRead.filter((name) => connectedInputs.has(name)))
    ].sort();
    if (streamedThroughInputs.length > 0) {
      issues.push({
        severity: "error",
        code: "code_stream_input_read",
        message:
          `The code reads ${streamedThroughInputs.map((n) => `\`${CODE_INPUTS_GLOBAL}.${n}\``).join(", ")}, which ` +
          `${streamedThroughInputs.length > 1 ? "incoming edges feed" : "an incoming edge feeds"} — in a streaming body ` +
          `\`${CODE_INPUTS_GLOBAL}\` carries only the node's configured values, never edge data. Use ` +
          `${streamedThroughInputs.map((n) => `\`stream("${n}")\``).join(", ")}.`
      });
    }
  }

  // An unresolvable read (`inputs[key]`, a spread) could touch any slot, so
  // nothing is provably unused. A streaming body reads its connected handles
  // through `stream`, and `stream.any()` reads every one of them.
  const read = new Set([
    ...inputsRead,
    ...bareInputReads,
    ...(streaming ? streams.names : []),
    ...(streaming && streams.usesAny ? connectedInputs : [])
  ]);
  const declaredInputsUnused =
    inputsOpaque || (streaming && streams.nonLiteral)
      ? []
      : [...new Set(input.availableInputs.filter((name) => !read.has(name)))];

  // ── Outputs ──────────────────────────────────────────────────────────────
  // Two contracts, one probe — three states with streaming. A streaming body
  // runs once, so the legacy return contract cannot apply to it whatever the
  // emit probe says: its outputs go through `emit`/`output` or nowhere.
  if (streaming && !usesEmitOutputContract(code)) {
    issues.push({
      severity: "error",
      code: "code_stream_return_contract",
      message:
        "The code calls `stream`, so it runs once and its return value is control " +
        "flow, not outputs. Send every output through `output(name, value)` for a " +
        "final value, or `emit(name, value)` to stream values as they are produced."
    });
    return withUnusedInputs(issues, declaredInputsUnused);
  }

  // A body that calls `emit`/`output` names its handles, so the return-path
  // analysis below does not apply to it at all — its returns are control flow
  // and carry nothing.
  if (usesEmitOutputContract(code)) {
    issues.push(...emitContractIssues(parsed.statements, declared, connected));
    return withUnusedInputs(issues, declaredInputsUnused);
  }

  // ── Legacy contract: outputs, against every return path the parser can see ─
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

/**
 * Check a body that uses the `emit`/`output` contract.
 *
 * The rule is per-handle existence, not per-path coverage: a declared output
 * needs one call naming it somewhere in the body, and branching freely is fine.
 * A call whose handle is computed makes every name unknowable, so it downgrades
 * the body to a warning instead of failing it on names this reader cannot see.
 */
function emitContractIssues(
  statements: readonly CodeBodyStatement[],
  declared: readonly string[],
  connected: readonly string[]
): CodeNodeIssue[] {
  const issues: CodeNodeIssue[] = [];
  const { names, nonLiteral } = outputCallNames(statements);
  const expected = declared.length > 0 ? declared : connected;
  // A wired handle is a real handle even when the node forgot to declare it —
  // the declared/connected split is the missing-output check's business.
  const known = new Set([...declared, ...connected]);

  const undeclared = [...new Set(names.filter((name) => !known.has(name)))].sort();
  if (undeclared.length > 0) {
    issues.push({
      severity: "error",
      code: "code_undeclared_output",
      message:
        `The code sends to ${formatNames(undeclared)}, which ` +
        `${undeclared.length > 1 ? "are not outputs" : "is not an output"} of this node — the call throws at run time. ` +
        `Declare ${undeclared.length > 1 ? "them" : "it"} as ${undeclared.length > 1 ? "dynamic outputs" : "a dynamic output"}, or fix the name.`
    });
  }

  if (nonLiteral) {
    issues.push({
      severity: "warning",
      code: "code_output_dynamic_name",
      message:
        "The code calls `emit` or `output` with a handle name that is not a string " +
        "literal, so the output names cannot be checked statically. Pass a literal " +
        "name to have them checked."
    });
  } else {
    const missing = expected.filter((name) => !names.includes(name));
    if (missing.length > 0) {
      issues.push({
        severity: "error",
        code: "code_missing_output",
        message:
          `The code never sends to the output${missing.length > 1 ? "s" : ""} ${formatNames(missing)}, so ` +
          `${missing.length > 1 ? "they stay" : "it stays"} empty. Call ` +
          `${missing.map((n) => `\`await output("${n}", value)\``).join(", ")} for a final value, ` +
          "or `emit` to stream values as they are produced."
      });
    }
  }

  const valuedReturns = analyzeCodeBody(statements).returns.filter(
    (statement) =>
      statement.argument != null &&
      !(
        statement.argument.type === "Identifier" &&
        statement.argument.name === "undefined"
      )
  );
  if (valuedReturns.length > 0) {
    issues.push({
      severity: "warning",
      code: "code_return_ignored",
      message:
        "The code returns a value, but return values carry no outputs — use " +
        "`output(name, value)` for a final value or `emit(name, value)` to stream. " +
        "`return` here only exits the body early."
    });
  }

  return issues;
}

/**
 * Resolve the declarations against the installed catalog, offline.
 *
 * The catalog reports what only an installed host knows: a specifier no pack
 * offers (error, naming the pack the specifier claims), and a pack version or
 * content digest that moved since the workflow was saved (warning — resolution
 * always uses what is installed).
 *
 * When the missing specifier is one NodeTool ships, the error also says which
 * package to install. Every other unknown specifier gets no hint: guessing a
 * package name for a workflow author is worse than saying nothing.
 */
function catalogIssues(
  catalog: SandboxModuleCatalog | null | undefined,
  declarations: readonly SandboxModuleDeclaration[]
): CodeNodeIssue[] {
  if (!catalog || declarations.length === 0) return [];
  const { statuses } = catalog.resolveForExecution(declarations);
  return statuses
    .filter((status) => status.status === "error" || status.status === "warning")
    .map((status) => {
      const hint =
        status.code === "module-not-found" ? installHintFor(status.specifier ?? "") : undefined;
      return {
        severity: status.status === "error" ? ("error" as const) : ("warning" as const),
        code:
          status.status === "error"
            ? "code_package_unavailable"
            : "code_package_mismatch",
        message: `${status.message} (pack "${status.packName}")${hint === undefined ? "" : ` ${hint}`}`
      };
    });
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
