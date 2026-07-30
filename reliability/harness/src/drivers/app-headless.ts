/**
 * Headless-app driver (§12) — wraps `nodetool app debug` (packages/cli's
 * app-debug runtime, `packages/cli/src/app-debug/`) for journeys whose
 * workflow carries an app document. Spawns the real CLI (`spawn-cli.ts`)
 * rather than importing the app-debug runtime directly: `@nodetool-ai/cli`'s
 * own `reliability` command (item 6) depends on this package, so a static
 * import the other way would be a circular workspace dependency — and
 * spawning the entry point is what every non-oracle driver does anyway
 * (§12: "drivers speak entry points, never internals").
 *
 * A journey "carries an app" when its workflow JSON has a top-level
 * `app_doc` field — the same shape `nodetool debug`/`workflows run` read
 * (`packages/cli/src/debug/target.ts`). None of the seed journeys (§5) do
 * yet, so `supports()` reports `false` for all of them today and the driver
 * is skipped as not-applicable — the "headless-app or n/a-clean" leg of C4's
 * done-when (item 8). The conversion half (`runRecordFromAppDebugReport`) is
 * still fully implemented and unit-tested against a fabricated report, so a
 * future app-carrying journey exercises real, proven code — not a stub.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { Journey } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { spawnNodetoolCli } from "./spawn-cli.js";
import type { RunDriver } from "./types.js";

/** Minimal shape this driver needs from an `AppDebugReport`'s `report.json`
 * (`packages/cli/src/app-debug/types.ts`). */
export interface AppDebugReportLike {
  target?: { workflowId?: string | null } | null;
  runs?: Array<{
    status?: string;
    error?: string | null;
    durationMs?: number | null;
    messagesFile?: string;
  }>;
}

/** True when a journey's workflow carries an `app_doc` the app-headless
 * driver can run — pure, no IO, so `compare.ts` and tests can check
 * applicability without spawning a process. */
export function journeyHasAppDoc(journey: Journey): boolean {
  return (journey.workflow as Record<string, unknown>)["app_doc"] != null;
}

/**
 * Folds a decoded `AppDebugReport` (`report.json`) plus each triggered run's
 * own `server/run-N.messages.jsonl` lines (already read, in `runs[]` order)
 * into one `RunRecord`. Pure — mirrors `record.ts`'s
 * `runRecordFromDebugBundle` split between the pure conversion and the IO
 * that reads the bundle off disk, so this half is unit-testable without a
 * real app document or a spawned process.
 */
export function runRecordFromAppDebugReport(
  report: AppDebugReportLike,
  runMessages: Array<Array<ProcessingMessage | Record<string, unknown>>>,
  options: { journeyId?: string; startedAt?: number } = {}
): RunRecord {
  const startedAt = options.startedAt ?? 0;
  const frames: RunFrame[] = [];
  let seq = 0;
  for (const messages of runMessages) {
    for (const message of messages) {
      frames.push(makeFrame(seq, "app-headless", "server_to_client", message, startedAt + seq));
      seq++;
    }
  }

  const runs = report.runs ?? [];
  const firstFailure = runs.find((r) => r.status && r.status !== "completed");
  const status = runs.length === 0 ? "unknown" : firstFailure?.status ?? "completed";
  const lastRun = runs[runs.length - 1];

  return {
    journeyId: options.journeyId,
    surface: "app-headless",
    jobId: null,
    workflowId: report.target?.workflowId ?? null,
    startedAt: frames.length > 0 ? startedAt : null,
    finishedAt: frames.length > 0 ? startedAt + Math.max(frames.length - 1, 0) : null,
    durationMs: lastRun?.durationMs ?? null,
    status,
    error: firstFailure?.error ?? runs.find((r) => r.error)?.error ?? null,
    params: {},
    frames
  };
}

export class AppHeadlessDriver implements RunDriver {
  readonly name = "app-headless";

  supports(journey: Journey): boolean {
    return journeyHasAppDoc(journey);
  }

  async run(journey: Journey): Promise<RunRecord> {
    if (!this.supports(journey)) {
      throw new Error(
        `journey "${journey.manifest.name}": app-headless driver only runs ` +
          `journeys whose workflow carries an "app_doc" — this journey has none (n/a)`
      );
    }

    const bundleDir = await mkdtemp(join(tmpdir(), "nodetool-reliability-app-"));
    try {
      const workflowPath = join(bundleDir, "workflow.json");
      await writeFile(workflowPath, JSON.stringify(journey.workflow), "utf8");

      const timeoutMs = journey.manifest.timeoutMs + 30_000;
      const { code, stdout, stderr } = await spawnNodetoolCli(
        [
          "app",
          "debug",
          workflowPath,
          "--params",
          JSON.stringify(journey.manifest.params ?? {}),
          "--out",
          bundleDir,
          "--json"
        ],
        timeoutMs
      );

      let report: AppDebugReportLike;
      try {
        report = JSON.parse(
          await readFile(join(bundleDir, "report.json"), "utf8")
        ) as AppDebugReportLike;
      } catch (err) {
        throw new Error(
          `journey "${journey.manifest.name}": app-headless driver produced no ` +
            `readable report (exit ${code})\n--- stdout ---\n${stdout}\n` +
            `--- stderr ---\n${stderr}\noriginal error: ${String(err)}`
        );
      }

      const runMessages: Array<Array<Record<string, unknown>>> = [];
      for (const run of report.runs ?? []) {
        if (!run.messagesFile) {
          runMessages.push([]);
          continue;
        }
        const raw = await readFile(join(bundleDir, run.messagesFile), "utf8").catch(
          () => ""
        );
        runMessages.push(
          raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line) as Record<string, unknown>)
        );
      }

      return runRecordFromAppDebugReport(report, runMessages, {
        journeyId: journey.manifest.name
      });
    } finally {
      await rm(bundleDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
