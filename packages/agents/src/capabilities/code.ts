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

import type { JsonSchema } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
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

export {
  MAX_TIMEOUT_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TEST_CASES,
  CODE_FIELD,
  PACKAGES_FIELD
} from "./code.specs.js";

/** One `await emit(name, value)` call, in call order. */
interface EmittedEntry {
  name: string;
  value: unknown;
}

/**
 * What a run streamed: `{name, value}` entries under the emit/output contract,
 * legacy `yield` bags under the return contract.
 */
type StreamedItems = EmittedEntry[] | Record<string, unknown>[];

interface HarnessRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: StreamedItems;
  logs: string[];
  error?: string;
  duration_ms: number;
}

/**
 * Run one Code-node body the way the node runs it, minus the toolbelt.
 * Returns rather than throws: a failing body is a result to report.
 */
async function runCodeBody(
  run: CapabilityRun,
  params: {
    code: string;
    inputs: Record<string, unknown>;
    packages: readonly string[];
    secrets: readonly string[];
    timeoutSeconds: number;
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

  const { declarations, invalid } = parseSandboxModuleDeclarations(
    params.packages.length > 0 ? [...params.packages] : undefined
  );
  if (invalid.length > 0) {
    return fail(`Invalid \`packages\` declarations: ${invalid.join(", ")}`);
  }
  let modules;
  if (declarations.length > 0) {
    const catalog = run.context.sandboxModuleCatalog;
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

  const globals = {
    inputs: params.inputs,
    state: {} as Record<string, unknown>
  };

  const result = await runInSandbox({
    code: body,
    context: run.context,
    timeoutMs: params.timeoutSeconds * 1000,
    globals,
    limits: { secretScope: [...params.secrets] },
    ...(modules ? { modules } : {})
  });

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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function inputBag(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
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

const runCode: CapabilityExport = {
  spec: runCodeSpec,
  impl: async (run, params) =>
    runCodeBody(run, {
      code: String(params["code"] ?? ""),
      inputs: inputBag(params["inputs"]),
      packages: stringList(params["packages"]),
      secrets: stringList(params["secrets"]),
      timeoutSeconds: timeoutSeconds(params["timeout_seconds"])
    })
};

// ---------------------------------------------------------------------------
// test_code
// ---------------------------------------------------------------------------

interface TestCaseReport {
  name: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: StreamedItems;
  logs: string[];
  error?: string;
  mismatches: { output: string; expected: unknown; actual: unknown }[];
}

/** Structural equality by JSON normalization — the values already crossed the sandbox boundary as plain data. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Grade a case's `expected_streamed` against what the run streamed: the same
 * entries, in the same order. A length difference is one mismatch on
 * `streamed`; a differing entry is one mismatch on `streamed[i]`.
 */
function streamMismatches(
  expected: readonly unknown[],
  actual: StreamedItems
): TestCaseReport["mismatches"] {
  if (expected.length !== actual.length) {
    return [{ output: "streamed", expected, actual }];
  }
  const mismatches: TestCaseReport["mismatches"] = [];
  for (let i = 0; i < expected.length; i++) {
    if (!deepEqual(expected[i], actual[i])) {
      mismatches.push({
        output: `streamed[${i}]`,
        expected: expected[i],
        actual: actual[i]
      });
    }
  }
  return mismatches;
}

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

    const results: TestCaseReport[] = [];
    for (let i = 0; i < rawCases.length; i++) {
      const raw =
        rawCases[i] && typeof rawCases[i] === "object"
          ? (rawCases[i] as Record<string, unknown>)
          : {};
      const name =
        typeof raw["name"] === "string" && raw["name"].trim() !== ""
          ? raw["name"]
          : `case ${i + 1}`;
      const expectBag =
        raw["expect"] && typeof raw["expect"] === "object"
          ? (raw["expect"] as Record<string, unknown>)
          : undefined;
      const expectStream = Array.isArray(raw["expected_streamed"])
        ? (raw["expected_streamed"] as unknown[])
        : undefined;

      const outcome = await runCodeBody(run, {
        code,
        inputs: inputBag(raw["inputs"]),
        packages,
        secrets,
        timeoutSeconds: timeout
      });

      const mismatches: TestCaseReport["mismatches"] = [];
      if (outcome.ok && expectBag) {
        const actualBag = outcome.outputs ?? {};
        for (const [key, expected] of Object.entries(expectBag)) {
          const actual = actualBag[key];
          if (!deepEqual(expected, actual)) {
            mismatches.push({ output: key, expected, actual });
          }
        }
      }
      if (outcome.ok && expectStream) {
        mismatches.push(
          ...streamMismatches(expectStream, outcome.streamed ?? [])
        );
      }

      results.push({
        name,
        ok: outcome.ok && mismatches.length === 0,
        ...(outcome.outputs !== undefined ? { outputs: outcome.outputs } : {}),
        ...(outcome.streamed !== undefined
          ? { streamed: outcome.streamed }
          : {}),
        logs: outcome.logs,
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
        mismatches
      });
    }

    const passed = results.filter((entry) => entry.ok).length;
    return {
      ok: passed === results.length,
      passed,
      failed: results.length - passed,
      results
    };
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
