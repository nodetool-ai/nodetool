/**
 * The JS-script harness: the CLI host around the shared validator and the
 * sandbox.
 *
 * `runJsScriptValidate` is the cheap pre-flight — load a document, check it,
 * report. `runJsScriptRun` and `runJsScriptTest` execute the body through
 * `runCodeBody`, the same core the `run_js_script` capability and the run
 * endpoint use. `runJsScriptDebug` additionally replays a scripted session
 * against the headless `ui_jsscript_*` bridge (the one the tool-loop eval
 * drives), validates the document the session left behind, and writes a
 * self-contained bundle.
 *
 * Everything heavy is injected with a lazy default: the validator core
 * (`@nodetool-ai/execution/js-script-debug`), the sandbox runner and the bridge
 * factory (`@nodetool-ai/agents`). Tests supply their own and load neither.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  JsScriptDebugReport,
  JsScriptInteractionRecord,
  JsScriptValidation
} from "@nodetool-ai/execution/js-script-debug";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { JsScriptInteractionStep } from "./interactions.js";
import {
  resolveJsScriptTarget,
  type ResolvedJsScriptTarget,
  type JsScriptTargetDeps
} from "./target.js";

/** What one sandboxed run reports. Mirrors the agents `HarnessRunResult`. */
export interface JsScriptRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}

/** One graded case, as `test_code`/`test_js_script` report it. */
export interface JsScriptCaseResult {
  name: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  mismatches: { output: string; expected: unknown; actual: unknown }[];
}

export interface JsScriptTestReport {
  ok: boolean;
  passed: number;
  failed: number;
  results: JsScriptCaseResult[];
}

/** The pieces of the shared core this host calls. */
export interface JsScriptDebugCore {
  validateJsScriptDoc: (
    raw: unknown,
    options?: { knownSecrets?: readonly string[] }
  ) => Promise<JsScriptValidation>;
  buildJsScriptDebugReport: (input: {
    target: JsScriptDebugReport["target"];
    document: unknown;
    interactions?: JsScriptInteractionRecord[];
    finalState?: unknown;
    finalDocument?: unknown;
  }) => Promise<JsScriptDebugReport>;
  renderJsScriptReportMarkdown: (report: JsScriptDebugReport) => string;
}

/** Executes a script body in the sandbox. */
export type JsScriptExecutor = (
  document: JsScriptDocument,
  inputs: Record<string, unknown>,
  inputStreams?: Record<string, unknown[]>
) => Promise<JsScriptRunResult>;

/** The bridge surface this host drives — one tool per `ui_jsscript_*` name. */
export interface JsScriptBridgeTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface JsScriptBridge {
  tools: JsScriptBridgeTool[];
  document: () => JsScriptDocument;
  finalState: () => unknown;
}

export type CreateJsScriptBridge = (initial: {
  name?: string;
  document?: Partial<JsScriptDocument>;
}) => JsScriptBridge;

export interface JsScriptDebugDeps extends JsScriptTargetDeps {
  /** Defaults to `@nodetool-ai/execution/js-script-debug`. */
  core?: JsScriptDebugCore;
  /** Defaults to `runCodeBody` from `@nodetool-ai/agents`. */
  execute?: JsScriptExecutor;
  /** Defaults to `createJsScriptToolBridge` from `@nodetool-ai/agents`. */
  createBridge?: CreateJsScriptBridge;
  /** Grades saved cases; defaults to `gradeCodeCases` from `@nodetool-ai/agents`. */
  grade?: (
    document: JsScriptDocument,
    execute: JsScriptExecutor
  ) => Promise<JsScriptTestReport>;
  onLog?: (line: string) => void;
}

export interface JsScriptValidateResult {
  target: ResolvedJsScriptTarget["target"];
  validation: JsScriptValidation;
}

export interface JsScriptDebugResult {
  report: JsScriptDebugReport;
  bundleDir: string;
}

async function loadCore(): Promise<JsScriptDebugCore> {
  const core = await import("@nodetool-ai/execution/js-script-debug");
  return {
    validateJsScriptDoc: (raw, options) =>
      core.validateJsScriptDoc(raw, options),
    buildJsScriptDebugReport: (input) => core.buildJsScriptDebugReport(input),
    renderJsScriptReportMarkdown: (report) =>
      core.renderJsScriptReportMarkdown(report)
  };
}

/**
 * The default executor: one `ProcessingContext` per run, the document's own
 * packages, secrets and timeout, and the Code-node toolbelt — the same
 * envelope the `run_js_script` capability applies.
 *
 * The secret store is opened only when the document declares secrets, so a
 * file target with none stays database-free.
 */
async function loadExecutor(): Promise<JsScriptExecutor> {
  const { runCodeBody } = await import("@nodetool-ai/agents");
  const { FileStorageAdapter, ProcessingContext } = await import(
    "@nodetool-ai/runtime"
  );
  const { getDefaultAssetsPath } = await import("@nodetool-ai/config");
  const { JS_SCRIPT_MAX_TIMEOUT_SECONDS } = await import(
    "@nodetool-ai/protocol/api-schemas/js-scripts.js"
  );

  let seq = 0;
  return async (document, inputs, inputStreams) => {
    let secretResolver;
    if (document.secrets.length > 0) {
      const { initDb, getSecret } = await import("@nodetool-ai/models");
      const { getDefaultDbPath } = await import("@nodetool-ai/config");
      initDb(getDefaultDbPath());
      secretResolver = getSecret;
    }
    const context = new ProcessingContext({
      jobId: `jsscript-cli-${++seq}`,
      userId: "1",
      storage: new FileStorageAdapter(getDefaultAssetsPath()),
      ...(secretResolver ? { secretResolver } : {})
    });
    return runCodeBody(context, {
      code: document.code,
      inputs,
      ...(inputStreams ? { inputStreams } : {}),
      packages: document.packages.map((pack) => pack.specifier),
      secrets: document.secrets,
      timeoutSeconds: Math.min(
        document.timeoutSeconds,
        JS_SCRIPT_MAX_TIMEOUT_SECONDS
      ),
      withToolbelt: true
    });
  };
}

async function loadGrader(): Promise<
  (document: JsScriptDocument, execute: JsScriptExecutor) => Promise<JsScriptTestReport>
> {
  const { gradeCodeCases } = await import("@nodetool-ai/agents");
  return async (document, execute) => {
    const report = await gradeCodeCases(
      document.tests.map((testCase, index) => ({
        name: testCase.name.trim() !== "" ? testCase.name : `case ${index + 1}`,
        inputs: testCase.inputs ?? {},
        ...(testCase.inputStreams
          ? { inputStreams: testCase.inputStreams }
          : {}),
        ...(testCase.expect ? { expect: testCase.expect } : {}),
        ...(testCase.expectedStreamed
          ? { expectedStreamed: testCase.expectedStreamed }
          : {})
      })),
      (testCase) =>
        execute(
          document,
          testCase.inputs,
          testCase.inputStreams
        ) as ReturnType<
          Parameters<typeof gradeCodeCases>[1]
        >
    );
    return report as JsScriptTestReport;
  };
}

async function loadBridgeFactory(): Promise<CreateJsScriptBridge> {
  const { createJsScriptToolBridge } = await import("@nodetool-ai/agents");
  return (initial) =>
    createJsScriptToolBridge(
      initial as Parameters<typeof createJsScriptToolBridge>[0]
    ) as unknown as JsScriptBridge;
}

function defaultOutDir(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "jsscript";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/jsscript-${slug}-${stamp}`);
}

/**
 * The document a target carries, parsed against the schema so the executor
 * gets defaults for anything the file left out. A document that does not parse
 * has already been reported by validation, so this is only reached on a sound
 * one.
 */
async function asDocument(raw: unknown): Promise<JsScriptDocument> {
  const { jsScriptDocument } = await import(
    "@nodetool-ai/protocol/api-schemas/js-scripts.js"
  );
  const parsed = jsScriptDocument.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `The document does not parse: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

/** Load a script and validate it — no sandbox, no bundle. */
export async function runJsScriptValidate(
  ref: string,
  deps: JsScriptDebugDeps
): Promise<JsScriptValidateResult> {
  const resolved = await resolveJsScriptTarget(ref, deps);
  const core = deps.core ?? (await loadCore());
  const validation = await core.validateJsScriptDoc(resolved.raw);
  return { target: resolved.target, validation };
}

export interface JsScriptRunOutcome {
  target: ResolvedJsScriptTarget["target"];
  result: JsScriptRunResult;
}

/** Run a script once with the given inputs. */
export async function runJsScriptOnce(
  ref: string,
  inputs: Record<string, unknown>,
  deps: JsScriptDebugDeps,
  inputStreams?: Record<string, unknown[]>
): Promise<JsScriptRunOutcome> {
  const resolved = await resolveJsScriptTarget(ref, deps);
  const document = await asDocument(resolved.raw);
  if (inputStreams) {
    const declared = new Set(document.inputs.map((port) => port.name));
    const undeclared = Object.keys(inputStreams).filter(
      (handle) => !declared.has(handle)
    );
    if (undeclared.length > 0) {
      throw new Error(
        `--input-streams names ${undeclared.join(", ")}, which the script does ` +
          `not declare as inputs (declared: ${[...declared].join(", ") || "none"}).`
      );
    }
  }
  const execute = deps.execute ?? (await loadExecutor());
  return {
    target: resolved.target,
    result: await execute(document, inputs, inputStreams)
  };
}

export interface JsScriptTestOutcome {
  target: ResolvedJsScriptTarget["target"];
  report: JsScriptTestReport;
}

/** Run a script's saved cases and grade them. */
export async function runJsScriptTests(
  ref: string,
  deps: JsScriptDebugDeps
): Promise<JsScriptTestOutcome> {
  const resolved = await resolveJsScriptTarget(ref, deps);
  const document = await asDocument(resolved.raw);
  if (document.tests.length === 0) {
    throw new Error(
      `${ref} has no saved test cases; there is nothing to run. Add some to the document's \`tests\`.`
    );
  }
  const execute = deps.execute ?? (await loadExecutor());
  const grade = deps.grade ?? (await loadGrader());
  return { target: resolved.target, report: await grade(document, execute) };
}

/**
 * Replay `--interact` against the headless bridge and write the bundle.
 *
 * A failing step is recorded and the script continues: a run that stops at the
 * first error hides every problem behind it, and the report is what the caller
 * came for.
 */
export async function runJsScriptDebug(
  ref: string,
  options: { interact?: JsScriptInteractionStep[]; outDir?: string },
  deps: JsScriptDebugDeps
): Promise<JsScriptDebugResult> {
  const resolved = await resolveJsScriptTarget(ref, deps);
  const core = deps.core ?? (await loadCore());

  const steps = options.interact ?? [];
  const interactions: JsScriptInteractionRecord[] = [];
  let snapshot: unknown;
  let finalDocument: unknown;

  if (steps.length > 0) {
    const createBridge = deps.createBridge ?? (await loadBridgeFactory());
    const bridge = createBridge({
      ...(resolved.target.name ? { name: resolved.target.name } : {}),
      document: (await asDocument(resolved.raw)) as Partial<JsScriptDocument>
    });
    const byName = new Map(bridge.tools.map((t) => [t.name, t]));

    for (const step of steps) {
      const tool = byName.get(step.tool);
      if (!tool) {
        const known = [...byName.keys()].sort().join(", ");
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: false,
          error: `No JS script tool named "${step.tool}". Available: ${known}.`
        });
        deps.onLog?.(`✗ ${step.tool}: unknown tool`);
        continue;
      }
      try {
        const result = await tool.execute(step.input);
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: true,
          result
        });
        deps.onLog?.(`✓ ${step.tool}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: false,
          error
        });
        deps.onLog?.(`✗ ${step.tool}: ${error}`);
      }
    }
    snapshot = bridge.finalState();
    finalDocument = bridge.document();
  }

  const report = await core.buildJsScriptDebugReport({
    target: resolved.target,
    document: resolved.raw,
    interactions,
    ...(snapshot !== undefined ? { finalState: snapshot } : {}),
    ...(finalDocument !== undefined ? { finalDocument } : {})
  });

  const bundleDir = options.outDir
    ? resolve(options.outDir)
    : defaultOutDir(ref);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, "jsscript.json"),
    JSON.stringify(resolved.raw, null, 2),
    "utf8"
  );
  await writeFile(
    join(bundleDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(
    join(bundleDir, "report.md"),
    core.renderJsScriptReportMarkdown(report),
    "utf8"
  );

  return { report, bundleDir };
}
