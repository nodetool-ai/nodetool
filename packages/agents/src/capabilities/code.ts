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
 * fresh `state`, implicit returns are wrapped, `yield` collects a stream, and
 * the return value normalizes into an output bag the same way
 * (`@nodetool-ai/node-sdk` code-body helpers — one implementation for both
 * hosts). What the harness deliberately does NOT provide: the node toolbelt
 * (`tools.*` / `nodetool.*`) and secrets outside the call's own `secrets`
 * list — authoring runs are hermetic by default.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";

/** Wall-clock ceiling for one harness run. Authoring runs are short. */
const MAX_TIMEOUT_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 30;
/** Cases one `test_code` call may run. */
const MAX_TEST_CASES = 20;

const CODE_FIELD: JsonSchema = {
  type: "string",
  description:
    "The Code-node body: plain JavaScript. Declared inputs arrive on the " +
    "`inputs` object; return an object whose keys become output handles."
};

const PACKAGES_FIELD: JsonSchema = {
  type: "array",
  items: { type: "string" },
  description:
    "Sandbox package specifiers the body imports (the node's `packages` " +
    'property), e.g. ["@nodetool-ai/sandbox-yaml"].'
};

interface HarnessRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: Record<string, unknown>[];
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
  const streaming = hasYieldStatement(code);
  const body = streaming
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

const validateCode: CapabilityExport = {
  spec: {
    name: "validate_code",
    description:
      "Statically check a Code-node body without running it: syntax, imports " +
      "against the declared sandbox packages, undefined names, undeclared " +
      "`inputs.*` reads, unused inputs, and whether every declared output is " +
      "set on every return path. Same check the workflow validator runs. Call " +
      "it after every edit — it is far cheaper than run_code.",
    inputSchema: {
      type: "object",
      properties: {
        code: CODE_FIELD,
        inputs: {
          type: "array",
          items: { type: "string" },
          description: "Input names the node declares (keys on `inputs`)."
        },
        outputs: {
          type: "array",
          items: { type: "string" },
          description: "Output handle names the node declares."
        },
        packages: PACKAGES_FIELD
      },
      required: ["code"]
    },
    category: "read",
    userMessage: () => "Validating code"
  },
  impl: async (run, params) => {
    const { validateCodeNodeBody, parseSandboxModuleDeclarations } =
      await import("@nodetool-ai/node-sdk");
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
  spec: {
    name: "run_code",
    description:
      "Run a Code-node body in the QuickJS sandbox with the given `inputs` " +
      "and return its outputs, console logs, and error. Streaming bodies " +
      "(`yield`) return the collected items as `streamed`. The run is " +
      "hermetic: no node toolbelt, and only the secrets named in `secrets` " +
      "are readable. Use it to debug a body before saving it onto a node.",
    inputSchema: {
      type: "object",
      properties: {
        code: CODE_FIELD,
        inputs: {
          type: "object",
          description: "Input values the body reads from the `inputs` object.",
          additionalProperties: true
        },
        packages: PACKAGES_FIELD,
        secrets: {
          type: "array",
          items: { type: "string" },
          description:
            "Secret names the body may read via getSecret(). Default: none."
        },
        timeout_seconds: {
          type: "number",
          description: `Execution timeout (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`
        }
      },
      required: ["code"]
    },
    category: "execute",
    userMessage: () => "Running code in the sandbox"
  },
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
  streamed?: Record<string, unknown>[];
  logs: string[];
  error?: string;
  mismatches: { output: string; expected: unknown; actual: unknown }[];
}

/** Structural equality by JSON normalization — the values already crossed the sandbox boundary as plain data. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const testCode: CapabilityExport = {
  spec: {
    name: "test_code",
    description:
      "Run a Code-node body against a list of test cases and grade each one. " +
      "A case supplies `inputs` and optionally `expect` — expected values per " +
      "output handle, compared structurally; outputs not named in `expect` " +
      "are ignored. A case without `expect` passes when the body runs " +
      "without error. Use it as the regression check after editing code.",
    inputSchema: {
      type: "object",
      properties: {
        code: CODE_FIELD,
        cases: {
          type: "array",
          description: `Test cases (max ${MAX_TEST_CASES}).`,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Case label." },
              inputs: {
                type: "object",
                description: "Input values for this case.",
                additionalProperties: true
              },
              expect: {
                type: "object",
                description:
                  "Expected value per output handle, compared structurally.",
                additionalProperties: true
              }
            },
            required: [] as string[]
          }
        },
        packages: PACKAGES_FIELD,
        secrets: {
          type: "array",
          items: { type: "string" },
          description:
            "Secret names the body may read via getSecret(). Default: none."
        },
        timeout_seconds: {
          type: "number",
          description: `Per-case timeout (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`
        }
      },
      required: ["code", "cases"]
    },
    category: "execute",
    userMessage: (params) => {
      const count = Array.isArray(params["cases"])
        ? params["cases"].length
        : 0;
      return `Testing code against ${count} case${count === 1 ? "" : "s"}`;
    }
  },
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
