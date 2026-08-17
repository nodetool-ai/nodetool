/**
 * The agent-facing JS script contract on mobile.
 *
 * Ported from web's `jsScriptAgentBridge` plus `gradeJsScriptTests`, trimmed to
 * what a phone should do: the body, the declared ports, the metadata, the saved
 * cases, and running both. Sandbox package declarations are not editable here —
 * a script imports whatever the host installs, so the field only round-trips.
 *
 * The document shape mirrors `jsScriptDocument` in
 * `@nodetool-ai/protocol/api-schemas/js-scripts`, declared structurally because
 * that schema module is zod and mobile has no zod. Same rationale as
 * `scriptTypes.ts` and `storyboardTypes.ts`.
 */

/** The only document version that exists. */
export const JS_SCRIPT_SCHEMA_VERSION = 1;

export const JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS = 30;

/** Matches the sandbox harness ceiling (`MAX_TIMEOUT_SECONDS`). */
export const JS_SCRIPT_MAX_TIMEOUT_SECONDS = 120;

/** A port name has to be readable as `inputs.<name>` inside the body. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** One declared port: the name the body reads or writes, and its NodeTool type. */
export interface JsScriptPort {
  name: string;
  /** A TypeMetadata type name ("str", "int", "list[str]", "ImageRef", …). */
  type: string;
}

/** A sandbox module declaration. Round-tripped, never written from here. */
interface JsScriptPackage {
  specifier: string;
  resolvedPackVersion?: string;
  contentDigest?: string;
}

/** One saved case, the shape the grader below reads. */
export interface JsScriptTestCase {
  name: string;
  inputs: Record<string, unknown>;
  /** Items staged per input handle for a body that reads with `stream`. */
  inputStreams?: Record<string, unknown[]>;
  /** Per-handle structural compare against the run's final outputs. */
  expect?: Record<string, unknown>;
  /** The `emit` calls the run must make, in order. */
  expectedStreamed?: { name: string; value: unknown }[];
}

export interface JsScriptDocument {
  schemaVersion: number;
  description: string;
  code: string;
  inputs: JsScriptPort[];
  outputs: JsScriptPort[];
  packages: JsScriptPackage[];
  secrets: string[];
  timeoutSeconds: number;
  tests: JsScriptTestCase[];
}

export function emptyJsScriptDocument(): JsScriptDocument {
  return {
    schemaVersion: JS_SCRIPT_SCHEMA_VERSION,
    description: '',
    code: '',
    inputs: [],
    outputs: [],
    packages: [],
    secrets: [],
    timeoutSeconds: JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS,
    tests: [],
  };
}

/**
 * Fill in a document read from the server.
 *
 * The router validates and defaults every field, so this is about the one case
 * the type system cannot see: a document written by an older client, or the
 * `null` a screen renders before the load resolves.
 */
export function normalizeJsScriptDocument(
  document: Partial<JsScriptDocument> | null | undefined
): JsScriptDocument {
  return { ...emptyJsScriptDocument(), ...(document ?? {}) };
}

// ── Run and test results ────────────────────────────────────────────────────

/** What `POST /api/js-scripts/:id/run` answers with. */
export interface JsScriptRunOutcome {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}

interface JsScriptMismatch {
  output: string;
  expected: unknown;
  actual: unknown;
}

export interface JsScriptTestCaseReport {
  name: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  mismatches: JsScriptMismatch[];
}

export interface JsScriptTestReport {
  passed: number;
  failed: number;
  cases: JsScriptTestCaseReport[];
}

// ── Document-level validation ───────────────────────────────────────────────

export interface JsScriptIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

function checkPorts(
  ports: readonly JsScriptPort[],
  kind: 'input' | 'output',
  issues: JsScriptIssue[]
): void {
  const seen = new Set<string>();
  for (const port of ports) {
    if (!IDENTIFIER.test(port.name)) {
      issues.push({
        severity: 'error',
        code: 'js_script_port_name',
        message: `${kind} "${port.name}" is not a valid identifier`,
      });
    }
    if (seen.has(port.name)) {
      issues.push({
        severity: 'error',
        code: 'js_script_duplicate_port',
        message: `duplicate ${kind} port "${port.name}"`,
      });
    }
    seen.add(port.name);
  }
}

/**
 * The document-level checks that need no parser, mirroring
 * `validateJsScriptDocument` in the protocol package. Body analysis (syntax,
 * imports, undefined names) stays server-side: it needs the node SDK, which is
 * not on the phone.
 */
export function validateJsScriptDocument(
  document: JsScriptDocument
): JsScriptIssue[] {
  const issues: JsScriptIssue[] = [];

  checkPorts(document.inputs, 'input', issues);
  checkPorts(document.outputs, 'output', issues);

  for (const name of document.secrets) {
    if (name.trim() === '') {
      issues.push({
        severity: 'error',
        code: 'js_script_secret_name',
        message: 'a declared secret name is empty',
      });
    }
  }

  if (
    document.timeoutSeconds <= 0 ||
    document.timeoutSeconds > JS_SCRIPT_MAX_TIMEOUT_SECONDS
  ) {
    issues.push({
      severity: 'error',
      code: 'js_script_timeout',
      message: `timeout must be between 1 and ${JS_SCRIPT_MAX_TIMEOUT_SECONDS} seconds`,
    });
  }

  const inputNames = new Set(document.inputs.map((port) => port.name));
  const outputNames = new Set(document.outputs.map((port) => port.name));
  const caseNames = new Set<string>();

  for (const testCase of document.tests) {
    if (caseNames.has(testCase.name)) {
      issues.push({
        severity: 'error',
        code: 'js_script_duplicate_test',
        message: `duplicate test case "${testCase.name}"`,
      });
    }
    caseNames.add(testCase.name);

    for (const handle of Object.keys(testCase.inputs)) {
      if (!inputNames.has(handle)) {
        issues.push({
          severity: 'error',
          code: 'js_script_test_input',
          message: `test "${testCase.name}" sets "${handle}", which is not a declared input`,
        });
      }
    }
    for (const handle of Object.keys(testCase.inputStreams ?? {})) {
      if (!inputNames.has(handle)) {
        issues.push({
          severity: 'error',
          code: 'js_script_test_input',
          message: `test "${testCase.name}" stages "${handle}", which is not a declared input`,
        });
      }
    }
    for (const handle of Object.keys(testCase.expect ?? {})) {
      if (!outputNames.has(handle)) {
        issues.push({
          severity: 'error',
          code: 'js_script_test_output',
          message: `test "${testCase.name}" expects "${handle}", which is not a declared output`,
        });
      }
    }
  }

  if (document.code.trim() === '') {
    issues.push({
      severity: 'warning',
      code: 'js_script_empty_body',
      message: 'the script has no body yet',
    });
  }
  if (document.tests.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'js_script_no_tests',
      message: 'the script has no saved test cases',
    });
  }

  return issues;
}

// ── Grading saved cases ─────────────────────────────────────────────────────

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
): JsScriptMismatch[] {
  if (expected.length !== actual.length) {
    return [{ output: 'streamed', expected, actual }];
  }
  const mismatches: JsScriptMismatch[] = [];
  for (let i = 0; i < expected.length; i++) {
    if (!deepEqual(expected[i], actual[i])) {
      mismatches.push({
        output: `streamed[${i}]`,
        expected: expected[i],
        actual: actual[i],
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
  const mismatches: JsScriptMismatch[] = [];

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
    mismatches,
  };
  if (outcome.outputs !== undefined) {
    report.outputs = outcome.outputs;
  }
  if (outcome.streamed !== undefined) {
    report.streamed = outcome.streamed;
  }
  if (outcome.error !== undefined) {
    report.error = outcome.error;
  }
  return report;
}

export function summarizeJsScriptTests(
  cases: readonly JsScriptTestCaseReport[]
): JsScriptTestReport {
  return {
    passed: cases.filter((report) => report.ok).length,
    failed: cases.filter((report) => !report.ok).length,
    cases: [...cases],
  };
}

/**
 * Run every saved case through `runCase` (the run endpoint) and grade it. Cases
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
        duration_ms: 0,
      };
    }
    reports.push(gradeJsScriptCase(testCase, outcome));
  }
  return summarizeJsScriptTests(reports);
}

// ── The agent-facing surface ────────────────────────────────────────────────

/** Full snapshot of the open script the agent reads before it edits. */
export interface JsScriptSnapshot {
  scriptId: string;
  name: string;
  document: JsScriptDocument;
  /** Document-level issues, recomputed on every read. */
  issues: JsScriptIssue[];
  /** The last run this surface performed, if any. */
  lastRun: JsScriptRunOutcome | null;
  /** The last graded test report, if any. */
  lastTest: JsScriptTestReport | null;
}

/** Metadata `ui_jsscript_set_meta` can write. Omitted fields stay as they are. */
export interface JsScriptMetaInput {
  name?: string;
  description?: string;
  secrets?: string[];
  timeoutSeconds?: number;
}

/** Operations the mounted JsScriptEditorScreen exposes to the tool layer. */
export interface JsScriptAgentHandler {
  getSnapshot: () => JsScriptSnapshot;
  setCode: (code: string) => JsScriptSnapshot;
  setPorts: (ports: {
    inputs?: JsScriptPort[];
    outputs?: JsScriptPort[];
  }) => JsScriptSnapshot;
  setMeta: (meta: JsScriptMetaInput) => JsScriptSnapshot;
  setTests: (tests: JsScriptTestCase[]) => JsScriptSnapshot;
  /** Persist the document, so the run endpoint executes what the agent wrote. */
  save: () => Promise<{ ok: true; updatedAt: string | null }>;
  run: (
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>
  ) => Promise<JsScriptRunOutcome>;
  test: () => Promise<JsScriptTestReport>;
}
