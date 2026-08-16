/**
 * The app-builder debug harness: the CLI host around the shared simulator.
 *
 * Resolves the target (application id, `ApplicationBundle` file, or workflow
 * carrying a legacy `app_doc`), runs `simulateApp` from
 * `@nodetool-ai/execution` — which owns every simulation rule — and writes the
 * self-contained bundle: the graph, the app document, each run's raw message
 * stream, and the report in both JSON and Markdown. The `AppDebugReport` comes
 * back so an agent can iterate without re-reading the bundle.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  renderAppReportMarkdown,
  simulateApp,
  type AppDebugOptions,
  type AppDebugReport,
  type JsScriptOperationLoader,
  type JsScriptOperationRunner
} from "@nodetool-ai/execution/app-debug";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { resolveAppTarget, type AppTargetDeps } from "./app-target.js";
import type { DebugGraph } from "../debug/types.js";
import type {
  ServerRunInput,
  ServerRunOutcome
} from "../debug/server-runner.js";

export { defaultInteractions } from "@nodetool-ai/execution/app-debug";

/** The local single-user id every direct-DB CLI command runs as. */
const LOCAL_USER_ID = "1";

export interface AppDebugDeps {
  /** Load a workflow by DB id, including its legacy `app_doc`. */
  loadFromDb: (
    id: string
  ) => Promise<{ graph: DebugGraph; app_doc?: unknown } | null>;
  /**
   * Load an application by DB id. Without it a bare id is only ever read as a
   * workflow, which is what a caller with no database wants.
   */
  loadApplication?: AppTargetDeps["loadApplication"];
  /** Progress/log sink. */
  onLog?: (line: string) => void;
  /** Injected for tests; defaults to the kernel server runner. */
  runOnServer?: (input: ServerRunInput) => Promise<ServerRunOutcome>;
  /** Injected for tests; defaults to the sandbox script runner. */
  runScript?: JsScriptOperationRunner;
  /** Resolve a pinned script version an operation targets but the target lacks. */
  loadScript?: JsScriptOperationLoader;
}

function defaultOutDir(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workflow";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/app-${slug}-${stamp}`);
}

export async function runAppDebug(
  ref: string,
  options: AppDebugOptions,
  deps: AppDebugDeps
): Promise<AppDebugReport> {
  const targetDeps: Parameters<typeof resolveAppTarget>[1] = {
    loadFromDb: deps.loadFromDb
  };
  if (deps.loadApplication) {
    targetDeps.loadApplication = deps.loadApplication;
  }
  const resolved = await resolveAppTarget(ref, targetDeps);
  const outDir = options.outDir ? resolve(options.outDir) : defaultOutDir(ref);
  await mkdir(join(outDir, "server"), { recursive: true });
  await writeFile(
    join(outDir, "workflow.json"),
    JSON.stringify(resolved.graph, null, 2),
    "utf8"
  );
  if (resolved.appDoc != null) {
    await writeFile(
      join(outDir, "app.json"),
      JSON.stringify(resolved.appDoc, null, 2),
      "utf8"
    );
  }

  // Loaded on first run, not up front: a `--no-run` check must not pull in the
  // node registries the server runner boots.
  const runOnServer =
    deps.runOnServer ??
    (async (input: ServerRunInput): Promise<ServerRunOutcome> =>
      (await import("../debug/server-runner.js")).runOnServer(input));

  // Both load lazily for the same reason `runOnServer` does: a `--no-run`
  // check must not pull in the sandbox or the database.
  const runScript =
    deps.runScript ??
    (async (input) => {
      const { createJsScriptAppRunner } = await import("@nodetool-ai/agents");
      const { getSecret } = await import("@nodetool-ai/models");
      return createJsScriptAppRunner(LOCAL_USER_ID, {
        secretResolver: getSecret
      })(input);
    });
  const loadScript =
    deps.loadScript ??
    (async (scriptId: string, scriptVersion: number) => {
      const { createJsScriptResolver } = await import("@nodetool-ai/models");
      const resolved = await createJsScriptResolver().resolve({
        id: scriptId,
        version: scriptVersion
      });
      return resolved
        ? { name: resolved.name, document: resolved.document }
        : null;
    });

  const simulateDeps: Parameters<typeof simulateApp>[2] = {
    loadFromDb: deps.loadFromDb,
    runOnServer,
    runScript,
    loadScript,
    onRunMessages: async (runIndex: number, messages: ProcessingMessage[]) => {
      const messagesFile = `server/run-${runIndex + 1}.messages.jsonl`;
      await writeFile(
        join(outDir, messagesFile),
        messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
        "utf8"
      );
      return messagesFile;
    }
  };
  if (deps.onLog) {
    simulateDeps.onLog = deps.onLog;
  }
  const report = await simulateApp(resolved, options, simulateDeps);
  report.bundleDir = outDir;

  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(
    join(outDir, "report.md"),
    renderAppReportMarkdown(report),
    "utf8"
  );

  return report;
}
