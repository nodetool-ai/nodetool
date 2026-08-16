/**
 * Headless bridge for the JS-script surface tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/jsscript.ts`) delegate to
 * a live per-document bridge mounted by an open `JsScriptSurface` — reading and
 * mutating a persisted script document, and running it server-side. None of
 * that can run under Node. This bridge reimplements the *effects* of the eight
 * `ui_jsscript_*` tools against a plain in-memory `JsScriptDocument`, so a
 * model can drive the same tool surface headlessly.
 *
 * Two of them are not simulated but real: `ui_jsscript_run` and
 * `ui_jsscript_test` execute the body in the QuickJS sandbox through
 * `runCodeBody` and grade with `gradeCodeCases` — the same execution and
 * grading path `run_js_script` and `test_js_script` take. A repair case is only
 * worth scoring if the failure the model has to fix is a real one.
 *
 * Like the script bridge, this one targets a single implicit document, so every
 * tool drops the real tools' `js_script_id` parameter.
 */

import { z } from "zod";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import {
  FileStorageAdapter,
  parseWithTypeCoercion,
  ProcessingContext
} from "@nodetool-ai/runtime";
import {
  emptyJsScriptDocument,
  JS_SCRIPT_MAX_TIMEOUT_SECONDS,
  type JsScriptDocument,
  type JsScriptPort,
  type JsScriptTestCase
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { runCodeBody } from "../../capabilities/code.js";
import {
  gradeCodeCases,
  type CodeTestReport,
  type GradedCase,
  type HarnessRunResult
} from "../../capabilities/code-grading.js";
import {
  emptyDeclaredJsScriptOutputsError,
  missingDeclaredJsScriptOutputs,
  type JsScriptValidation
} from "@nodetool-ai/execution/js-script-debug";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

/** Case-supplied starting point for a run. */
export interface JsScriptBridgeInitialState {
  name?: string;
  document?: Partial<JsScriptDocument>;
}

/** Snapshot handed to a case's final-state predicates. */
export interface JsScriptBridgeFinalState {
  name: string;
  description: string;
  code: string;
  inputs: string[];
  outputs: string[];
  packages: string[];
  secrets: string[];
  timeoutSeconds: number;
  tests: string[];
  /** Whether the document passes the static check as it stands. */
  valid: boolean;
  validationErrorCodes: string[];
  lastRun: {
    ok: boolean;
    outputs?: Record<string, unknown>;
    error?: string;
  } | null;
  lastTest: { ok: boolean; passed: number; failed: number } | null;
}

/** The bridge, plus the document a host (the CLI harness) validates afterwards. */
export interface JsScriptToolBridge extends HeadlessSurfaceBridge<JsScriptBridgeFinalState> {
  document: () => JsScriptDocument;
  name: () => string;
}

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: async (args) =>
      impl(
        parseWithTypeCoercion(parameters, args ?? {}) as Record<string, unknown>
      )
  };
}

const portParam = z.object({
  name: z.string().describe("Port name, readable as `inputs.<name>`."),
  type: z
    .string()
    .describe(
      'NodeTool type name: "str", "int", "float", "bool", "list[str]", …'
    )
});

const testParam = z.object({
  name: z.string().describe("Case label."),
  inputs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Input values for this case, keyed by declared input name."),
  expect: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Expected final value per declared output, compared structurally."
    ),
  expectedStreamed: z
    .array(z.object({ name: z.string(), value: z.unknown() }))
    .optional()
    .describe("Every value the body must emit, in call order.")
});

/**
 * Build an in-memory bridge whose tools share the frontend `ui_jsscript_*`
 * contract (minus `js_script_id`) but run headlessly against a single implicit
 * script document.
 */
export function createJsScriptToolBridge(
  initial: JsScriptBridgeInitialState = {}
): JsScriptToolBridge {
  let name = initial.name ?? "Untitled script";
  const document: JsScriptDocument = {
    ...emptyJsScriptDocument(),
    ...(initial.document ?? {})
  };

  let lastRun: JsScriptBridgeFinalState["lastRun"] = null;
  let lastTest: JsScriptBridgeFinalState["lastTest"] = null;
  let runSeq = 0;

  // The snapshot is synchronous and validation is not, so the last computed
  // result is what it reports. Every mutating tool validates, so after any edit
  // it is current; before the first one it is null and the document counts as
  // unchecked rather than sound.
  let lastValidation: JsScriptValidation | null = null;

  const validate = async (): Promise<JsScriptValidation> => {
    const { validateJsScriptDoc } =
      await import("@nodetool-ai/execution/js-script-debug");
    lastValidation = await validateJsScriptDoc(document);
    return lastValidation;
  };

  const execute = async (
    inputs: Record<string, unknown>
  ): Promise<HarnessRunResult> => {
    const context = new ProcessingContext({
      jobId: `jsscript-bridge-${++runSeq}`,
      userId: "1",
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });
    const result = await runCodeBody(context, {
      code: document.code,
      inputs,
      packages: document.packages.map((pack) => pack.specifier),
      secrets: document.secrets,
      timeoutSeconds: Math.min(
        document.timeoutSeconds,
        JS_SCRIPT_MAX_TIMEOUT_SECONDS
      ),
      withToolbelt: true
    });
    if (!result.ok) return result;
    const missing = missingDeclaredJsScriptOutputs(
      document.outputs,
      result.outputs
    );
    if (missing.length === 0) return result;
    return {
      ...result,
      ok: false,
      error: emptyDeclaredJsScriptOutputsError(missing)
    };
  };

  const runTests = async (): Promise<CodeTestReport> =>
    gradeCodeCases(
      document.tests.map((testCase, index) => {
        const graded: GradedCase = {
          name:
            testCase.name.trim() !== "" ? testCase.name : `case ${index + 1}`,
          inputs: testCase.inputs ?? {}
        };
        if (testCase.expect) graded.expect = testCase.expect;
        if (testCase.expectedStreamed) {
          graded.expectedStreamed = testCase.expectedStreamed;
        }
        return graded;
      }),
      (testCase) => execute(testCase.inputs)
    );

  const tools: HeadlessTool[] = [
    tool(
      "ui_jsscript_get_state",
      "Read the script: its name, description, body, declared input and output ports, secrets, timeout, and saved test cases, plus the static validation issues the document currently carries and the result of the last run and test. Call this first.",
      z.object({}),
      async () => {
        const validation = await validate();
        return {
          ok: true,
          name,
          document,
          validation,
          lastRun,
          lastTest
        };
      }
    ),

    tool(
      "ui_jsscript_set_code",
      "Replace the script body. Write top-level statements only — the host wraps the body. Do not write `export` or `function run`. Declared inputs arrive on the `inputs` object; outputs leave through `await emit(name, value)` (streams one value) and `await output(name, value)` (sets a final one). `return` is control flow only — a body that returns its outputs instead of emitting them fails validation.",
      z.object({ code: z.string() }),
      async ({ code }) => {
        document.code = code as string;
        const validation = await validate();
        return { ok: true, validation };
      }
    ),

    tool(
      "ui_jsscript_set_ports",
      "Replace the script's declared ports. Pass `inputs`, `outputs`, or both; an omitted list is left as it was. Each port is {name, type} — the name is what the body reads as `inputs.<name>` or writes with emit/output.",
      z.object({
        inputs: z.array(portParam).optional(),
        outputs: z.array(portParam).optional()
      }),
      async ({ inputs, outputs }) => {
        if (inputs !== undefined) document.inputs = inputs as JsScriptPort[];
        if (outputs !== undefined) document.outputs = outputs as JsScriptPort[];
        const validation = await validate();
        return {
          ok: true,
          inputs: document.inputs,
          outputs: document.outputs,
          validation
        };
      }
    ),

    tool(
      "ui_jsscript_set_packages",
      "No-op leftover: a JS script does not declare packages. Import any installed sandbox pack or `@nodetool-ai/sandbox-nodetool/<namespace>` directly.",
      z.object({
        packages: z.array(z.object({ specifier: z.string() }))
      }),
      async ({ packages }) => {
        document.packages = packages as JsScriptDocument["packages"];
        const validation = await validate();
        return { ok: true, packages: document.packages, validation };
      }
    ),

    tool(
      "ui_jsscript_set_meta",
      "Set the script's name, description, declared secrets, or timeout. Only the fields you pass change. The description is what an agent reads to decide whether this script does what it needs, so make it say what the script does.",
      z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        secrets: z.array(z.string()).optional(),
        timeoutSeconds: z.number().optional()
      }),
      async (args) => {
        if (args["name"] !== undefined) name = args["name"] as string;
        if (args["description"] !== undefined) {
          document.description = args["description"] as string;
        }
        if (args["secrets"] !== undefined) {
          document.secrets = args["secrets"] as string[];
        }
        if (args["timeoutSeconds"] !== undefined) {
          document.timeoutSeconds = Math.min(
            Number(args["timeoutSeconds"]),
            JS_SCRIPT_MAX_TIMEOUT_SECONDS
          );
        }
        const validation = await validate();
        return {
          ok: true,
          name,
          description: document.description,
          secrets: document.secrets,
          timeoutSeconds: document.timeoutSeconds,
          validation
        };
      }
    ),

    tool(
      "ui_jsscript_set_tests",
      "Replace the script's saved test cases. A case is {name, inputs, expect?, expectedStreamed?}: `expect` names the final value per output handle and `expectedStreamed` the full ordered list of emitted values. These cases are the script's regression suite — ui_jsscript_test runs exactly them.",
      z.object({ tests: z.array(testParam) }),
      async ({ tests }) => {
        document.tests = tests as JsScriptTestCase[];
        const validation = await validate();
        return { ok: true, tests: document.tests, validation };
      }
    ),

    tool(
      "ui_jsscript_run",
      "Run the script body once with the given inputs and report its final outputs, the values it emitted, its console logs, and any error. Use it to see what the body actually does before saving tests around it.",
      z.object({
        inputs: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Values for the declared inputs.")
      }),
      async ({ inputs }) => {
        const result = await execute(
          (inputs as Record<string, unknown> | undefined) ?? {}
        );
        const run: NonNullable<JsScriptBridgeFinalState["lastRun"]> = {
          ok: result.ok
        };
        if (result.outputs !== undefined) run.outputs = result.outputs;
        if (result.error !== undefined) run.error = result.error;
        lastRun = run;
        return { ok: result.ok, run: result };
      }
    ),

    tool(
      "ui_jsscript_test",
      "Run every saved test case and grade it: each case reports whether it passed, what the body produced, and each mismatch between expected and actual. Fix the body (or the case) until every one passes.",
      z.object({}),
      async () => {
        if (document.tests.length === 0) {
          throw new Error(
            "The script has no saved test cases. Add some with ui_jsscript_set_tests first."
          );
        }
        const report = await runTests();
        lastTest = {
          ok: report.ok,
          passed: report.passed,
          failed: report.failed
        };
        return report;
      }
    )
  ];

  return {
    tools,
    document: () => document,
    name: () => name,
    finalState: (): JsScriptBridgeFinalState => ({
      name,
      description: document.description,
      code: document.code,
      inputs: document.inputs.map((port) => port.name),
      outputs: document.outputs.map((port) => port.name),
      packages: document.packages.map((pack) => pack.specifier),
      secrets: [...document.secrets],
      timeoutSeconds: document.timeoutSeconds,
      tests: document.tests.map((testCase) => testCase.name),
      valid: lastValidation?.ok ?? false,
      validationErrorCodes: (lastValidation?.errors ?? []).map(
        (issue) => issue.code
      ),
      lastRun,
      lastTest
    })
  };
}

export const JS_SCRIPT_SYSTEM_PROMPT = `You are a scripting assistant operating a JS script document through UI tools.

A JS script is a body of JavaScript with declared input and output ports, secrets it may read, a timeout, and saved test cases. Import any installed sandbox pack or \`@nodetool-ai/sandbox-nodetool/<namespace>\` directly — there is no packages setting. Call pack docs/exports before guessing export names: \`encode\` from \`-qr\`, \`parse\` from \`-exif\`, \`build\` from \`-pdflib\`, \`interpolate\` / \`differenceCiede2000\` from \`-color\`, \`renderSVG\` from \`-fabric\`.

The host wraps the body in an async function. Write top-level statements only. Do not write \`export\`. Do not wrap the body in \`function run\`. \`inputs\` is already in scope.

- Call ui_jsscript_get_state first to see the document and its current validation issues.
- Declare ports with ui_jsscript_set_ports before writing a body that reads or writes them.
- Write the body with ui_jsscript_set_code. Read \`inputs.<name>\`. Leave values with \`await output(name, value)\` or \`await emit(name, value)\`. Never \`return\` outputs. The body has the same \`tools.*\` / \`nodetool.*\` belt a Code node has.
- Save regression cases with ui_jsscript_set_tests, then run them with ui_jsscript_test. ui_jsscript_test with zero cases is an error — add cases first.
- ui_jsscript_run executes the body once with inputs you supply. A run with declared outputs and an empty bag is not success.

Every mutating tool returns the document's validation after the edit — read it. Call one tool at a time. When the objective is fully satisfied and the document validates, STOP calling tools and give a one-line summary.`;

export const JS_SCRIPT_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<JsScriptBridgeFinalState>[] =
  [
    {
      id: "author-sum-script",
      description:
        "Author a script from an empty document: declare ports, write an emitting body, run it",
      objective:
        "Write a script that takes a list of numbers on an input called `numbers` and sets an output called `total` to their sum. Declare the ports, write the body, and run it once with [1, 2, 3] to confirm the total is 6.",
      systemPrompt: JS_SCRIPT_SYSTEM_PROMPT,
      createBridge: () => createJsScriptToolBridge(),
      expect: {
        requiredTools: [
          "ui_jsscript_set_ports",
          "ui_jsscript_set_code",
          "ui_jsscript_run"
        ],
        ordering: [["ui_jsscript_set_code", "ui_jsscript_run"]],
        minToolCalls: 3,
        maxToolCalls: 20,
        finalState: [
          {
            name: "portsDeclared",
            detail: "the script does not declare `numbers` in and `total` out",
            test: (s) =>
              s.inputs.includes("numbers") && s.outputs.includes("total")
          },
          {
            name: "documentValid",
            detail: "the document does not pass the static check",
            test: (s) => s.valid
          },
          {
            name: "runProducedTotal",
            detail: "the last run did not produce total = 6",
            test: (s) =>
              s.lastRun?.ok === true && s.lastRun.outputs?.total === 6
          }
        ]
      }
    },
    {
      id: "add-saved-tests",
      description:
        "Add saved test cases to a working script and make them pass",
      objective:
        "This script already works: it sets `upper` to its `text` input in upper case. Save two regression test cases for it and run them until they all pass.",
      systemPrompt: JS_SCRIPT_SYSTEM_PROMPT,
      createBridge: () =>
        createJsScriptToolBridge({
          name: "Upper",
          document: {
            description: "Upper-cases a string.",
            code: 'await output("upper", String(inputs.text).toUpperCase());',
            inputs: [{ name: "text", type: "str" }],
            outputs: [{ name: "upper", type: "str" }]
          }
        }),
      expect: {
        requiredTools: ["ui_jsscript_set_tests", "ui_jsscript_test"],
        ordering: [["ui_jsscript_set_tests", "ui_jsscript_test"]],
        minToolCalls: 2,
        maxToolCalls: 15,
        finalState: [
          {
            name: "twoTestsSaved",
            detail: "fewer than 2 saved test cases",
            test: (s) => s.tests.length >= 2
          },
          {
            name: "testsPass",
            detail: "the saved cases were never run green",
            test: (s) => s.lastTest?.ok === true && s.lastTest.passed >= 2
          }
        ]
      }
    },
    {
      id: "repair-failing-test",
      description:
        "A saved case fails against a buggy body; the model must fix the body",
      objective:
        "This script is supposed to set `doubled` to twice its `n` input, and it has a saved test case for that. Run the tests, find out why the case fails, fix the body, and get the tests green. Do not change the test case.",
      systemPrompt: JS_SCRIPT_SYSTEM_PROMPT,
      createBridge: () =>
        createJsScriptToolBridge({
          name: "Double",
          document: {
            description: "Doubles a number.",
            // The bug: it adds two instead of doubling.
            code: 'await output("doubled", inputs.n + 2);',
            inputs: [{ name: "n", type: "int" }],
            outputs: [{ name: "doubled", type: "int" }],
            tests: [
              {
                name: "doubles five",
                inputs: { n: 5 },
                expect: { doubled: 10 }
              }
            ]
          }
        }),
      expect: {
        requiredTools: ["ui_jsscript_test", "ui_jsscript_set_code"],
        ordering: [["ui_jsscript_test", "ui_jsscript_set_code"]],
        minToolCalls: 2,
        maxToolCalls: 15,
        finalState: [
          {
            name: "testKept",
            detail: "the saved case was removed or renamed instead of fixed",
            test: (s) => s.tests.includes("doubles five")
          },
          {
            name: "testsGreen",
            detail: "the saved case never passed",
            test: (s) => s.lastTest?.ok === true
          }
        ]
      }
    }
  ];
