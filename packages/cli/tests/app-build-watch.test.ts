/**
 * `nodetool app build --watch`: the projection a build hands the shared differ,
 * and the loop that drives it. No model runs here — the loop takes whatever
 * `run` returns, so a fake build is enough to pin the diff a maintainer sees.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import type { BuildReport } from "@nodetool-ai/agents";
import { registerAppCommands } from "../src/commands/app.js";
import { snapshotBuildReport } from "../src/app-build/watch.js";
import { runWatchLoop, type FileWatcher } from "../src/debug/watch.js";

function buildReport(opts: {
  ok: boolean;
  stage?: { stage: string; status: "ok" | "failed" | "skipped" };
  repairIssues?: Array<{ stage: string; code: string; message: string }>;
  stageIssues?: Array<{ stage: string; code: string; message: string }>;
  cost?: number;
}): BuildReport {
  const stage = opts.stage ?? { stage: "judge", status: "ok" as const };
  return {
    target: { prompt: "", specPath: "spec.json" },
    spec: {
      title: "Drafter",
      operations: [],
      variables: [],
      widgets: [],
      interactions: []
    },
    interactions: [],
    stages: [
      {
        stage: stage.stage,
        round: 0,
        status: stage.status,
        startedAt: new Date(0).toISOString(),
        durationMs: 1,
        issues: opts.stageIssues ?? [],
        costUsd: 0
      }
    ] as BuildReport["stages"],
    repairs: opts.repairIssues
      ? ([
          { round: 1, issues: opts.repairIssues, fingerprints: [] }
        ] as BuildReport["repairs"])
      : [],
    appDebug: null,
    judge: null,
    supervision: null,
    verdict: { ok: opts.ok, reason: "", notSimulated: [] },
    cost: { usd: opts.cost ?? 0, byStage: {} },
    bundle: null
  };
}

describe("snapshotBuildReport", () => {
  it("reports a green build as ok with no issues", () => {
    const snapshot = snapshotBuildReport(buildReport({ ok: true, cost: 0.5 }));
    expect(snapshot).toEqual({
      ok: true,
      issues: [],
      status: "judge/ok",
      tokens: null,
      costUsd: 0.5
    });
  });

  it("takes the outstanding issues from the last repair round", () => {
    const snapshot = snapshotBuildReport(
      buildReport({
        ok: false,
        stage: { stage: "check", status: "failed" },
        repairIssues: [
          { stage: "check", code: "unknown_widget_type", message: "no Chart" }
        ]
      })
    );
    expect(snapshot.issues).toEqual([
      "[check/unknown_widget_type] no Chart"
    ]);
    expect(snapshot.status).toBe("check/failed");
  });

  it("falls back to stage issues when the build failed before any repair", () => {
    const snapshot = snapshotBuildReport(
      buildReport({
        ok: false,
        stage: { stage: "spec", status: "failed" },
        stageIssues: [
          { stage: "spec", code: "spec_invalid", message: "no operations" }
        ]
      })
    );
    expect(snapshot.issues).toEqual(["[spec/spec_invalid] no operations"]);
  });
});

describe("runWatchLoop", () => {
  /** A watcher whose change events the test fires by hand. */
  function fakeWatcher(): { watch: FileWatcher; fire: () => void; closed: () => boolean } {
    let onChange: (() => void) | null = null;
    let closed = false;
    return {
      watch: (_path, handler) => {
        onChange = handler;
        return {
          close: () => {
            closed = true;
          }
        };
      },
      fire: () => onChange?.(),
      closed: () => closed
    };
  }

  it("diffs each re-run against the previous one and stops on the signal", async () => {
    const watcher = fakeWatcher();
    const lines: string[] = [];
    const reports = [
      buildReport({
        ok: false,
        stage: { stage: "check", status: "failed" },
        repairIssues: [{ stage: "check", code: "bad_binding", message: "dangling" }],
        cost: 0.1
      }),
      buildReport({ ok: true, cost: 0.3 })
    ];
    let stopWatching = (): void => {};
    const stop = new Promise<void>((resolve) => {
      stopWatching = resolve;
    });

    const loop = runWatchLoop({
      file: "/tmp/spec.json",
      first: reports[0] as BuildReport,
      run: async () => reports[1] as BuildReport,
      snapshot: snapshotBuildReport,
      statusLabel: "stage",
      log: (line) => lines.push(line),
      debounceMs: 0,
      stop,
      watchFile: watcher.watch
    });

    watcher.fire();
    await new Promise((resolve) => setTimeout(resolve, 5));
    stopWatching();
    await loop;

    const printed = lines.join("\n");
    expect(printed).toContain("Watching /tmp/spec.json");
    expect(printed).toContain("✅ Now passing (was failing)");
    expect(printed).toContain("stage: check/failed → judge/ok");
    expect(printed).toContain("- resolved: [check/bad_binding] dangling");
    expect(printed).toContain("cost: +$0.2000");
    expect(watcher.closed()).toBe(true);
  });

  it("keeps watching after a re-run throws", async () => {
    const watcher = fakeWatcher();
    const lines: string[] = [];
    let stopWatching = (): void => {};
    const stop = new Promise<void>((resolve) => {
      stopWatching = resolve;
    });

    const loop = runWatchLoop({
      file: "/tmp/spec.json",
      first: buildReport({ ok: true }),
      run: async () => {
        throw new Error("spec.json is not valid JSON");
      },
      snapshot: snapshotBuildReport,
      log: (line) => lines.push(line),
      debounceMs: 0,
      stop,
      watchFile: watcher.watch
    });

    watcher.fire();
    await new Promise((resolve) => setTimeout(resolve, 5));
    stopWatching();
    await loop;

    expect(lines.join("\n")).toContain(
      "Re-run failed: Error: spec.json is not valid JSON"
    );
  });
});

describe("app build --watch flag", () => {
  it("is registered on the build command", () => {
    const program = new Command();
    registerAppCommands(program);
    const app = program.commands.find((c) => c.name() === "app");
    const build = app?.commands.find((c) => c.name() === "build");
    expect(build?.options.map((o) => o.long)).toContain("--watch");
  });
});
