/**
 * `nodetool jsscript validate`, `run`, `test`, `debug` and `versions` — the
 * JS-script harness commands.
 *
 * `validate` checks a script document statically: the body's syntax and
 * imports, ports the body reads that nothing declares, outputs no emit/output
 * call reaches, tests naming ports the script lacks. `run` executes the body
 * once in the QuickJS sandbox; `test` runs the document's own saved cases and
 * exits non-zero on any failure — the selfcheck-friendly command. `debug`
 * replays a scripted `--interact` session against the headless
 * `ui_jsscript_*` bridge and writes a bundle. Every target is a script JSON
 * file or a `js_scripts` row id; file targets need no database.
 *
 * Heavy dependencies (the database, the validator core, the sandbox, the
 * bridge) are imported lazily inside each action, so command registration
 * stays light and unit-testable.
 */
import type { Command } from "commander";
import type { JsScriptDebugReport } from "@nodetool-ai/execution/js-script-debug";
import type { JsScriptRecord } from "../js-script-debug/target.js";
import type { JsScriptTestReport } from "../js-script-debug/harness.js";
import { printCommandError } from "../command-errors.js";
import { renderJsScriptValidation } from "./js-script-validation-output.js";
import { registerJsScriptVersionsCommands } from "./js-script-versions.js";

export { renderJsScriptValidation };

interface JsScriptValidateCliOptions {
  json?: boolean;
  warningsAsErrors?: boolean;
}

interface JsScriptRunCliOptions {
  inputs?: string;
  inputStreams?: string;
  json?: boolean;
}

interface JsScriptDebugCliOptions {
  interact?: string;
  out?: string;
  json?: boolean;
}

/** Read a `js_scripts` row through the local database. */
async function scriptLoader(): Promise<
  (id: string) => Promise<JsScriptRecord | null>
> {
  const { initDb, JsScript } = await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  let ready = false;
  return async (id: string) => {
    if (!ready) {
      initDb(getDefaultDbPath());
      ready = true;
    }
    const row = await JsScript.findById(id);
    return row ? { id: row.id, name: row.name, document: row.document } : null;
  };
}

/** `--inputs` is a JSON object; anything else names itself in the error. */
export function parseInputsOption(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--inputs is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--inputs must be a JSON object, e.g. '{\"a\":1}'");
  }
  return parsed as Record<string, unknown>;
}

/**
 * `--input-streams` stages items per handle for a body that reads `stream`:
 * a JSON object whose every value is an array.
 */
export function parseInputStreamsOption(
  raw: string
): Record<string, unknown[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `--input-streams is not valid JSON: ${(e as Error).message}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "--input-streams must be a JSON object of arrays, e.g. '{\"nums\":[1,2,3]}'"
    );
  }
  const staged: Record<string, unknown[]> = {};
  for (const [handle, items] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (!Array.isArray(items)) {
      throw new Error(`--input-streams entry "${handle}" is not an array`);
    }
    staged[handle] = items;
  }
  return staged;
}

export function registerJsScriptCommands(program: Command): void {
  const jsscript = program
    .command("jsscript")
    .description("Work with JS script documents");

  jsscript
    .command("validate <script_id_or_file>")
    .description(
      "Validate a JS script without running it: body syntax, imports against the declared packages, undeclared inputs, outputs nothing emits, tests naming ports the script lacks. Takes a script JSON file or a js_scripts row id"
    )
    .option("--json", "Print the full JsScriptValidation as JSON")
    .option(
      "--warnings-as-errors",
      "Exit non-zero when there are warnings (not just errors)"
    )
    .action(async (ref: string, opts: JsScriptValidateCliOptions) => {
      try {
        const { runJsScriptValidate } =
          await import("../js-script-debug/index.js");
        const { target, validation } = await runJsScriptValidate(ref, {
          loadScript: await scriptLoader()
        });

        if (opts.json) {
          console.log(JSON.stringify({ target, validation }, null, 2));
        } else {
          console.log(renderJsScriptValidation(validation).join("\n"));
        }

        const failed =
          !validation.ok ||
          (opts.warningsAsErrors === true && validation.warnings.length > 0);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  jsscript
    .command("run <script_id_or_file>")
    .description(
      "Run a JS script once in the QuickJS sandbox and print its outputs, streamed emits, logs and error"
    )
    .option("--inputs <json>", "Input values, e.g. '{\"a\":1}'")
    .option(
      "--input-streams <json>",
      "Items staged per handle for a body that reads `stream`, e.g. '{\"nums\":[1,2,3]}'"
    )
    .option("--json", "Print the run result as JSON")
    .action(async (ref: string, opts: JsScriptRunCliOptions) => {
      let ok = false;
      try {
        const { runJsScriptOnce } = await import("../js-script-debug/index.js");
        const inputs = opts.inputs ? parseInputsOption(opts.inputs) : {};
        const inputStreams = opts.inputStreams
          ? parseInputStreamsOption(opts.inputStreams)
          : undefined;
        const { result } = await runJsScriptOnce(
          ref,
          inputs,
          { loadScript: await scriptLoader() },
          inputStreams
        );

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printRunResult(result);
        }
        ok = result.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(ok ? 0 : 1);
    });

  jsscript
    .command("test <script_id_or_file>")
    .description(
      "Run a JS script's saved test cases and grade each one. Exits non-zero when any case fails"
    )
    .option("--json", "Print the grade report as JSON")
    .action(async (ref: string, opts: { json?: boolean }) => {
      let ok = false;
      try {
        const { runJsScriptTests } =
          await import("../js-script-debug/index.js");
        const { report } = await runJsScriptTests(ref, {
          loadScript: await scriptLoader()
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printTestReport(report);
        }
        ok = report.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(ok ? 0 : 1);
    });

  jsscript
    .command("debug <script_id_or_file>")
    .description(
      "Replay a scripted editing session against a JS script headlessly and collect a debug bundle (the document, the report, every step's result)"
    )
    .option(
      "--interact <json>",
      'Scripted steps: [{"tool":"set_code","input":{"code":"..."}}] — the ui_jsscript_ prefix is optional'
    )
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/jsscript-<id>-<timestamp>)"
    )
    .option("--json", "Print the full JsScriptDebugReport as JSON to stdout")
    .action(async (ref: string, opts: JsScriptDebugCliOptions) => {
      try {
        const { parseInteractionScript, runJsScriptDebug } =
          await import("../js-script-debug/index.js");
        const interact = opts.interact
          ? parseInteractionScript(opts.interact)
          : undefined;

        const debugOptions: Parameters<typeof runJsScriptDebug>[1] = {};
        if (interact) {
          debugOptions.interact = interact;
        }
        if (opts.out) {
          debugOptions.outDir = opts.out;
        }
        const { report, bundleDir } = await runJsScriptDebug(
          ref,
          debugOptions,
          {
            loadScript: await scriptLoader(),
            onLog: (line) => console.error(line)
          }
        );

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printJsScriptSummary(report, bundleDir);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  registerJsScriptVersionsCommands(jsscript);
}

function printRunResult(result: {
  ok: boolean;
  outputs?: Record<string, unknown>;
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}): void {
  console.log(
    `\n${result.ok ? "✅" : "❌"} ${result.ok ? "ran" : "failed"} in ${result.duration_ms}ms`
  );
  if (result.error) console.log(`  error:    ${result.error}`);
  if (result.outputs) {
    console.log(`  outputs:  ${JSON.stringify(result.outputs)}`);
  }
  if (result.streamed && result.streamed.length > 0) {
    console.log(`  streamed: ${JSON.stringify(result.streamed)}`);
  }
  for (const line of result.logs) console.log(`  log:      ${line}`);
}

function printTestReport(report: JsScriptTestReport): void {
  console.log(
    `\n${report.ok ? "✅" : "❌"} ${report.passed} passed, ${report.failed} failed`
  );
  for (const testCase of report.results) {
    console.log(`  ${testCase.ok ? "✓" : "✗"} ${testCase.name}`);
    if (testCase.error) console.log(`      error: ${testCase.error}`);
    for (const mismatch of testCase.mismatches) {
      console.log(
        `      ${mismatch.output}: expected ${JSON.stringify(mismatch.expected)}, got ${JSON.stringify(mismatch.actual)}`
      );
    }
  }
}

function printJsScriptSummary(
  report: JsScriptDebugReport,
  bundleDir: string
): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  console.log(
    `  script:  ${report.meta.inputCount} input(s), ${report.meta.outputCount} output(s), ${report.meta.testCount} test(s)`
  );
  const failed = report.interactions.filter((i) => !i.ok).length;
  if (report.interactions.length > 0) {
    console.log(
      `  session: ${report.interactions.length} step(s), ${failed} failed`
    );
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.verdict.warnings && report.verdict.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.verdict.warnings)
      console.log(`  - ${warning}`);
  }
  console.log(`\nDebug bundle: ${bundleDir}`);
  console.log("  report.md / report.json · jsscript.json");
}
