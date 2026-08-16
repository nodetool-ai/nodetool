/**
 * The `code` capability module — the Code-node authoring harness.
 *
 * Three capabilities that give any agent the write → validate → run → test
 * loop for a `nodetool.code.Code` body, without authoring a workflow and
 * without going through CodeAct:
 *
 *   validate_code — the static check the graph validator and the editor run
 *   run_code      — execute a body in the QuickJS sandbox with given inputs
 *   test_code     — run a case list and grade each against expected outputs
 *
 * Execution matches the Code node: the body gets the `inputs` object and a
 * fresh `state`, and the same probe the node uses (`usesEmitOutputContract`)
 * decides which output contract applies. A body calling `emit`/`output` runs
 * verbatim — emitted values come back as `streamed`, final values as
 * `outputs`, its return value ignored. A body calling neither runs the legacy
 * path (implicit return wrapping, `yield` collection, return-bag
 * normalization) through the `@nodetool-ai/node-sdk` code-body helpers, one
 * implementation for both hosts. What the harness deliberately does NOT
 * provide: the node toolbelt (`tools.*` / `nodetool.*`) and secrets outside
 * the call's own `secrets` list — authoring runs are hermetic by default.
 */

import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import type { RunSandboxOptions } from "../js-sandbox.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule
} from "./types.js";
import {
  gradeCodeCases,
  type GradedCase,
  type HarnessRunResult
} from "./code-grading.js";
import {
  validateCodeSpec,
  runCodeSpec,
  testCodeSpec,
  MAX_TIMEOUT_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TEST_CASES,
  CODE_FIELD,
  PACKAGES_FIELD
} from "./code.specs.js";
import {
  isNonBlankString,
  isObjectLike,
  isRecord
} from "../utils/type-guards.js";

export {
  MAX_TIMEOUT_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TEST_CASES,
  CODE_FIELD,
  PACKAGES_FIELD
} from "./code.specs.js";

export type {
  EmittedEntry,
  StreamedItems,
  HarnessRunResult
} from "./code-grading.js";

/**
 * Run one Code-node body the way the node runs it. Off by default this is
 * hermetic (no `tools.*` / `nodetool.*`); pass `withToolbelt` for a JS
 * script run. Returns rather than throws: a failing body is a result to
 * report.
 *
 * Takes a `ProcessingContext` rather than a `CapabilityRun` because that is
 * all it ever used, and the JS-script run endpoint reaches it from a host that
 * has a context and no capability run.
 */
export async function runCodeBody(
  context: ProcessingContext,
  params: {
    code: string;
    inputs: Record<string, unknown>;
    packages: readonly string[];
    secrets: readonly string[];
    timeoutSeconds: number;
    inputStreams?: Record<string, unknown[]>;
    /**
     * Give the guest the Code-node belt (`tools.*` / `nodetool.*`) and every
     * installed sandbox pack plus platform module by import. Off for
     * `run_code` / `test_code` (authoring stays hermetic). On for every JS
     * script run.
     */
    withToolbelt?: boolean;
  }
): Promise<HarnessRunResult> {
  const {
    hasReturnStatement,
    hasYieldStatement,
    wrapImplicitReturn,
    normalizeCodeOutput,
    usesEmitOutputContract,
    parseSandboxModuleDeclarations
  } = await import("@nodetool-ai/node-sdk");
  const { runInSandbox } = await import("../js-sandbox.js");

  const started = Date.now();
  const fail = (error: string, logs: string[] = []): HarnessRunResult => ({
    ok: false,
    error,
    logs,
    duration_ms: Date.now() - started
  });

  let modules;
  let capabilities;
  if (params.withToolbelt) {
    // A JS script has no packages setting: every installed pack and every
    // platform module resolves from the import.
    const { mountJsScriptSandbox } = await import("../js-script-sandbox.js");
    const mounted = await mountJsScriptSandbox(params.code, context);
    if (!mounted.ok) {
      return fail(mounted.error);
    }
    modules = mounted.modules;
    capabilities = mounted.capabilities;
  } else {
    const { declarations, invalid } = parseSandboxModuleDeclarations(
      params.packages.length > 0 ? [...params.packages] : undefined
    );
    if (invalid.length > 0) {
      return fail(`Invalid \`packages\` declarations: ${invalid.join(", ")}`);
    }
    if (declarations.length > 0) {
      const catalog = context.sandboxModuleCatalog;
      if (!catalog) {
        return fail(
          "Sandbox packages are not available in this process, so the declared " +
            "packages cannot be imported."
        );
      }
      modules = catalog.resolveForExecution(declarations);
      const errors = modules.statuses.filter(
        (status) => status.status === "error"
      );
      if (errors.length > 0) {
        return fail(
          errors
            .map((status) => `${status.message} (pack "${status.packName}")`)
            .join(" ")
        );
      }
    }
  }

  const code = params.code;
  // The emit/output contract names its outputs, so nothing is inferred from
  // the body's shape and nothing is rewritten: it runs exactly as written.
  const emitContract = usesEmitOutputContract(code);
  const streaming = !emitContract && hasYieldStatement(code);
  const body = emitContract
    ? code
    : streaming
      ? `const __yielded = [];
function yield_(value) { __yielded.push(value); }
${code.replace(/\byield\b/g, "yield_")}
return __yielded;`
      : hasReturnStatement(code)
        ? code
        : wrapImplicitReturn(code);

  const globals: Record<string, unknown> = {
    inputs: params.inputs,
    state: {}
  };
  let source = body;
  if (params.withToolbelt) {
    const { NODETOOL_PRELUDE, sandboxToolBridgeGlobals } =
      await import("../sandbox-toolbelt.js");
    source = `${NODETOOL_PRELUDE}\n${body}`;
    Object.assign(globals, sandboxToolBridgeGlobals(context));
  }

  // A body reading `stream` needs a source, or every verb throws. Only a call
  // that staged items gets one — without `inputStreams` the harness behaves
  // exactly as before.
  const staged = params.inputStreams
    ? stagedInputStreams(params.inputStreams)
    : undefined;

  const sandboxOptions: RunSandboxOptions = {
    code: source,
    context,
    timeoutMs: params.timeoutSeconds * 1000,
    globals,
    limits: { secretScope: [...params.secrets] },
    ...(staged ?? {})
  };
  if (modules) sandboxOptions.modules = modules;
  if (capabilities) sandboxOptions.capabilities = capabilities;

  const result = await runInSandbox(sandboxOptions);

  const logs = result.logs ?? [];
  if (!result.success) {
    return fail(result.error ?? "Code execution failed", logs);
  }
  if (emitContract) {
    // No `onEmit` sink is passed, so the host accumulates the emits and hands
    // them back in call order; the return value carries no output semantics.
    return {
      ok: true,
      outputs: result.outputs ?? {},
      streamed: result.emitted ?? [],
      logs,
      duration_ms: Date.now() - started
    };
  }
  if (streaming) {
    const items = Array.isArray(result.result) ? result.result : [];
    return {
      ok: true,
      streamed: items.map(normalizeCodeOutput),
      logs,
      duration_ms: Date.now() - started
    };
  }
  return {
    ok: true,
    outputs: normalizeCodeOutput(result.result),
    logs,
    duration_ms: Date.now() - started
  };
}

/**
 * Feed pre-staged items to a body that reads its inputs with `stream`.
 *
 * The kernel answers a take out of a live inbox; here every item is known up
 * front, so arrival order has to be defined rather than observed. It is
 * round-robin by index across the handles in declaration order — item 0 of
 * every handle, then item 1, and so on — which is what `stream.any()` yields.
 * A named take pops that handle's own queue and drops its next slot from the
 * arrival order, so a body mixing `stream("a")` with `stream.any()` never sees
 * one item twice.
 */
type StagedInputStreams = {
  onTakeInput: (
    handle: string | null
  ) => Promise<
    { done: true } | { done: false; handle: string; value: unknown }
  >;
  onStreamOpen: (handle: string) => boolean;
};

function stagedInputStreams(
  streams: Record<string, unknown[]>
): StagedInputStreams {
  const queues = new Map<string, unknown[]>(
    Object.entries(streams).map(([handle, values]) => [
      handle,
      Array.isArray(values) ? [...values] : []
    ])
  );
  const arrival: string[] = [];
  const deepest = Math.max(
    0,
    ...[...queues.values()].map((queue) => queue.length)
  );
  for (let index = 0; index < deepest; index++) {
    for (const [handle, queue] of queues) {
      if (queue.length > index) arrival.push(handle);
    }
  }

  const dropFromArrival = (handle: string): void => {
    const at = arrival.indexOf(handle);
    if (at >= 0) arrival.splice(at, 1);
  };

  return {
    onTakeInput: async (handle) => {
      const next = handle ?? arrival[0];
      if (next === undefined) return { done: true };
      const queue = queues.get(next);
      if (!queue || queue.length === 0) return { done: true };
      dropFromArrival(next);
      return { done: false, handle: next, value: queue.shift() };
    },
    onStreamOpen: (handle) => (queues.get(handle)?.length ?? 0) > 0
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * `{handle: [items]}` staged for a body that reads `stream`. Entries that are
 * not arrays are dropped: a handle with nothing behind it reads as ended.
 */
function inputStreamBag(value: unknown): Record<string, unknown[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const staged: Record<string, unknown[]> = {};
  for (const [handle, items] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (Array.isArray(items)) staged[handle] = [...items];
  }
  return Object.keys(staged).length > 0 ? staged : undefined;
}

function inputBag(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function timeoutSeconds(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(parsed, MAX_TIMEOUT_SECONDS);
}

// ---------------------------------------------------------------------------
// validate_code
// ---------------------------------------------------------------------------

/** Issue category for a body still on the return/yield output contract. */
const CODE_LEGACY_CONTRACT = "code_legacy_contract";

const validateCode: CapabilityExport = {
  spec: validateCodeSpec,
  impl: async (run, params) => {
    const {
      validateCodeNodeBody,
      usesEmitOutputContract,
      parseSandboxModuleDeclarations
    } = await import("@nodetool-ai/node-sdk");
    const packages = stringList(params["packages"]);
    const { declarations, invalid } = parseSandboxModuleDeclarations(
      packages.length > 0 ? packages : undefined
    );
    const issues = validateCodeNodeBody({
      code: params["code"],
      availableInputs: stringList(params["inputs"]),
      declaredOutputs: stringList(params["outputs"]),
      declaredPackages: declarations,
      sandboxModuleCatalog: run.context.sandboxModuleCatalog
    });
    for (const entry of invalid) {
      issues.push({
        severity: "error",
        code: "code_module",
        message: `Invalid \`packages\` declaration: ${entry}`
      });
    }
    // The legacy return/yield contract runs for one more release. The shared
    // validator is where that warning belongs; this adds it only when the
    // shared layer did not, so the harness warns either way and never twice.
    const code = String(params["code"] ?? "");
    const alreadyWarned = issues.some(
      (issue) =>
        issue.code === CODE_LEGACY_CONTRACT || /deprecat/i.test(issue.message)
    );
    // The pristine default body is an empty node, not a legacy body.
    if (
      code.trim() !== "" &&
      code.trim() !== "return {};" &&
      !usesEmitOutputContract(code) &&
      !alreadyWarned
    ) {
      issues.push({
        severity: "warning",
        code: CODE_LEGACY_CONTRACT,
        message:
          "The return/yield output contract is deprecated; use " +
          "emit(name, value) to stream a value and output(name, value) to " +
          "set a final one."
      });
    }
    return {
      ok: !issues.some((issue) => issue.severity === "error"),
      issues
    };
  }
};

// ---------------------------------------------------------------------------
// run_code
// ---------------------------------------------------------------------------

/** `run_code`'s arguments as {@link runCodeBody} params. */
function runCodeParams(
  params: Parameters<CapabilityImpl>[1]
): Parameters<typeof runCodeBody>[1] {
  const bodyParams: Parameters<typeof runCodeBody>[1] = {
    code: String(params["code"] ?? ""),
    inputs: inputBag(params["inputs"]),
    packages: stringList(params["packages"]),
    secrets: stringList(params["secrets"]),
    timeoutSeconds: timeoutSeconds(params["timeout_seconds"])
  };
  const staged = inputStreamBag(params["input_streams"]);
  if (staged !== undefined) bodyParams.inputStreams = staged;
  return bodyParams;
}

const runCode: CapabilityExport = {
  spec: runCodeSpec,
  impl: async (run, params) => runCodeBody(run.context, runCodeParams(params))
};

// ---------------------------------------------------------------------------
// test_code
// ---------------------------------------------------------------------------

const testCode: CapabilityExport = {
  spec: testCodeSpec,
  impl: async (run, params) => {
    const rawCases = Array.isArray(params["cases"]) ? params["cases"] : [];
    if (rawCases.length === 0) {
      return { error: "test_code needs at least one case." };
    }
    if (rawCases.length > MAX_TEST_CASES) {
      return {
        error: `test_code runs at most ${MAX_TEST_CASES} cases per call (got ${rawCases.length}).`
      };
    }
    const code = String(params["code"] ?? "");
    const packages = stringList(params["packages"]);
    const secrets = stringList(params["secrets"]);
    const timeout = timeoutSeconds(params["timeout_seconds"]);

    const cases: GradedCase[] = rawCases.map((entry, i) => {
      const raw =
        isObjectLike(entry)
          ? (entry as Record<string, unknown>)
          : {};
      const name =
        isNonBlankString(raw["name"])
          ? raw["name"]
          : `case ${i + 1}`;
      const staged = inputStreamBag(raw["input_streams"]);
      const graded: GradedCase = { name, inputs: inputBag(raw["inputs"]) };
      if (isObjectLike(raw["expect"])) {
        graded.expect = raw["expect"] as Record<string, unknown>;
      }
      if (Array.isArray(raw["expected_streamed"])) {
        graded.expectedStreamed = raw["expected_streamed"] as unknown[];
      }
      if (staged !== undefined) graded.inputStreams = staged;
      return graded;
    });

    return gradeCodeCases(cases, (testCase) => {
      const bodyParams: Parameters<typeof runCodeBody>[1] = {
        code,
        inputs: testCase.inputs,
        packages,
        secrets,
        timeoutSeconds: timeout
      };
      if (testCase.inputStreams !== undefined) {
        bodyParams.inputStreams = testCase.inputStreams;
      }
      return runCodeBody(run.context, bodyParams);
    });
  }
};

const CODE_CAPABILITIES: readonly CapabilityExport[] = [
  validateCode,
  runCode,
  testCode
];

export const module: CapabilityModule = {
  module: "code",
  exports: CODE_CAPABILITIES
};

export { validateCode, runCode, testCode };
