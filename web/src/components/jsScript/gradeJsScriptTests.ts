/**
 * Client-side grading of a JS script's saved test cases.
 *
 * The run endpoint executes one body with one input bag; it has no notion of
 * cases. So the console runs each saved case through that endpoint and grades
 * the outcome here, with the same rules `test_code` applies server-side
 * (`packages/agents/src/capabilities/code.ts`): structural compare per expected
 * output handle, and an ordered compare of the emitted stream.
 *
 * TODO(phase 2): replace this with the `test_js_script` capability, so the
 * editor, the assistant, and the CLI harness grade through one implementation
 * instead of two that can drift.
 */

import type {
  JsScriptRunOutcome,
  JsScriptTestCase,
  JsScriptTestCaseReport,
  JsScriptTestReport
} from "../../stores/jsScript/JsScriptStore";

type Mismatch = JsScriptTestCaseReport["mismatches"][number];

/**
 * Structural equality by JSON normalization — the values already crossed the
 * sandbox boundary as plain data.
 */
const deepEqual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Grade a case's `expectedStreamed` against what the run streamed: the same
 * entries, in the same order. A length difference is one mismatch on
 * `streamed`; a differing entry is one mismatch on `streamed[i]`.
 */
export function streamMismatches(
  expected: readonly unknown[],
  actual: readonly unknown[]
): Mismatch[] {
  if (expected.length !== actual.length) {
    return [{ output: "streamed", expected, actual }];
  }
  const mismatches: Mismatch[] = [];
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

/** Grade one case against the outcome of running it. */
export function gradeJsScriptCase(
  testCase: JsScriptTestCase,
  outcome: JsScriptRunOutcome
): JsScriptTestCaseReport {
  const mismatches: Mismatch[] = [];

  // A failed run is already a failed case; comparing its (absent) outputs would
  // only bury the error under a pile of mismatches.
  if (outcome.ok && testCase.expect) {
    const actualBag = outcome.outputs ?? {};
    for (const [key, expected] of Object.entries(testCase.expect)) {
      const actual = actualBag[key];
      if (!deepEqual(expected, actual)) {
        mismatches.push({ output: key, expected, actual });
      }
    }
  }
  if (outcome.ok && testCase.expectedStreamed) {
    mismatches.push(
      ...streamMismatches(testCase.expectedStreamed, outcome.streamed ?? [])
    );
  }

  const report: JsScriptTestCaseReport = {
    name: testCase.name,
    ok: outcome.ok && mismatches.length === 0,
    logs: outcome.logs,
    mismatches
  };
  if (outcome.outputs !== undefined) report.outputs = outcome.outputs;
  if (outcome.streamed !== undefined) report.streamed = outcome.streamed;
  if (outcome.error !== undefined) report.error = outcome.error;
  return report;
}

/** Roll graded cases up into the report the console and the agent read. */
export function summarizeJsScriptTests(
  cases: readonly JsScriptTestCaseReport[]
): JsScriptTestReport {
  return {
    passed: cases.filter((report) => report.ok).length,
    failed: cases.filter((report) => !report.ok).length,
    cases: [...cases]
  };
}

/**
 * Run every saved case through `runCase` (the run endpoint) and grade it. A
 * case staging `inputStreams` feeds them to a body that reads `stream`. Cases
 * run in order: a script may reach a rate-limited API, and a serial run keeps
 * the failure report readable.
 */
export async function gradeJsScriptTests(
  tests: readonly JsScriptTestCase[],
  runCase: (
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>
  ) => Promise<JsScriptRunOutcome>
): Promise<JsScriptTestReport> {
  const reports: JsScriptTestCaseReport[] = [];
  for (const testCase of tests) {
    let outcome: JsScriptRunOutcome;
    try {
      outcome = await runCase(testCase.inputs, testCase.inputStreams);
    } catch (error) {
      outcome = {
        ok: false,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
        duration_ms: 0
      };
    }
    reports.push(gradeJsScriptCase(testCase, outcome));
  }
  return summarizeJsScriptTests(reports);
}
