/**
 * The result shape of one sandboxed body run, and the grading `test_code`
 * applies to a case list.
 *
 * A leaf module so both harnesses grade identically: `test_code` (a body plus
 * an ad-hoc case list) and `test_js_script` (a saved document's own cases) call
 * {@link gradeCodeCases} with the same runner. A second copy of the comparison
 * rules is how the two would silently diverge.
 */

/** One `await emit(name, value)` call, in call order. */
export interface EmittedEntry {
  name: string;
  value: unknown;
}

/**
 * What a run streamed: `{name, value}` entries under the emit/output contract,
 * legacy `yield` bags under the return contract.
 */
export type StreamedItems = EmittedEntry[] | Record<string, unknown>[];

export interface HarnessRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: StreamedItems;
  logs: string[];
  error?: string;
  duration_ms: number;
}

/** One case as the grader reads it, whatever wire shape it arrived in. */
export interface GradedCase {
  name: string;
  inputs: Record<string, unknown>;
  /** Expected final value per output handle; unnamed handles are ignored. */
  expect?: Record<string, unknown>;
  /** The full ordered list of values the body must emit. */
  expectedStreamed?: readonly unknown[];
  /** Pre-staged items per input handle for a body that reads `stream`. */
  inputStreams?: Record<string, unknown[]>;
}

export interface TestCaseReport {
  name: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: StreamedItems;
  logs: string[];
  error?: string;
  mismatches: { output: string; expected: unknown; actual: unknown }[];
}

export interface CodeTestReport {
  ok: boolean;
  passed: number;
  failed: number;
  results: TestCaseReport[];
}

/** Structural equality by JSON normalization — the values already crossed the sandbox boundary as plain data. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Grade a case's expected stream against what the run streamed: the same
 * entries, in the same order. A length difference is one mismatch on
 * `streamed`; a differing entry is one mismatch on `streamed[i]`.
 */
export function streamMismatches(
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

/** Run every case through `runCase` and grade what came back. */
export async function gradeCodeCases(
  cases: readonly GradedCase[],
  runCase: (testCase: GradedCase) => Promise<HarnessRunResult>
): Promise<CodeTestReport> {
  const results: TestCaseReport[] = [];

  for (const testCase of cases) {
    const outcome = await runCase(testCase);
    const mismatches: TestCaseReport["mismatches"] = [];

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

    const entry: TestCaseReport = {
      name: testCase.name,
      ok: outcome.ok && mismatches.length === 0,
      logs: outcome.logs,
      mismatches
    };
    if (outcome.outputs !== undefined) entry.outputs = outcome.outputs;
    if (outcome.streamed !== undefined) entry.streamed = outcome.streamed;
    if (outcome.error !== undefined) entry.error = outcome.error;
    results.push(entry);
  }

  const passed = results.filter((entry) => entry.ok).length;
  return {
    ok: passed === results.length,
    passed,
    failed: results.length - passed,
    results
  };
}
