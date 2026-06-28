import { describe, it, expect } from "vitest";
import { diffReports, diffIsEmpty, formatDiff } from "../src/debug/diff.js";
import type { DebugReport } from "../src/debug/types.js";

function report(opts: {
  ok: boolean;
  issues: string[];
  status?: string;
  tokens?: number;
  cost?: number;
}): DebugReport {
  const hasTrace = opts.tokens != null || opts.cost != null;
  return {
    generatedAt: "now",
    target: { ref: "wf", source: "json", workflowId: null, nodeCount: 0, edgeCount: 0 },
    workflow: { nodes: [], edges: [] },
    server: opts.status
      ? ({
          surface: "server",
          ok: opts.ok,
          status: opts.status,
          error: null,
          durationMs: 1,
          summary: {} as never,
          trace: hasTrace
            ? {
                spanCount: 0,
                totalDurationMs: 0,
                tokens: { input: 0, output: 0, total: opts.tokens ?? 0 },
                costUsd: opts.cost ?? 0,
                byName: {},
                slowest: []
              }
            : null
        } as never)
      : null,
    browser: null,
    verdict: { ok: opts.ok, headline: "", issues: opts.issues },
    bundleDir: null
  };
}

describe("diffReports", () => {
  it("reports no change when nothing actionable moved", () => {
    const a = report({ ok: true, issues: [], status: "completed" });
    const b = report({ ok: true, issues: [], status: "completed" });
    const diff = diffReports(a, b);
    expect(diffIsEmpty(diff)).toBe(true);
    expect(formatDiff(diff)).toBe("No change since last run.");
  });

  it("detects a fail → pass transition", () => {
    const a = report({ ok: false, issues: ["Server node X: boom"], status: "failed" });
    const b = report({ ok: true, issues: [], status: "completed" });
    const diff = diffReports(a, b);
    expect(diff.okChanged).toEqual({ from: false, to: true });
    expect(diff.serverStatusChanged).toEqual({ from: "failed", to: "completed" });
    expect(diff.resolvedIssues).toEqual(["Server node X: boom"]);
    expect(diff.newIssues).toEqual([]);
    expect(formatDiff(diff)).toContain("Now passing");
  });

  it("surfaces new issues on a regression", () => {
    const a = report({ ok: true, issues: [], status: "completed" });
    const b = report({ ok: false, issues: ["Server node Y: nope"], status: "failed" });
    const diff = diffReports(a, b);
    expect(diff.newIssues).toEqual(["Server node Y: nope"]);
    expect(diff.okChanged).toEqual({ from: true, to: false });
    expect(formatDiff(diff)).toContain("+ new: Server node Y: nope");
  });

  it("computes token and cost deltas when both runs traced", () => {
    const a = report({ ok: true, issues: [], status: "completed", tokens: 100, cost: 0.01 });
    const b = report({ ok: true, issues: [], status: "completed", tokens: 150, cost: 0.025 });
    const diff = diffReports(a, b);
    expect(diff.tokenDelta).toBe(50);
    expect(diff.costDelta).toBeCloseTo(0.015, 6);
  });

  it("leaves deltas null when a run has no trace", () => {
    const a = report({ ok: true, issues: [], status: "completed" });
    const b = report({ ok: true, issues: [], status: "completed", tokens: 10 });
    const diff = diffReports(a, b);
    expect(diff.tokenDelta).toBeNull();
    expect(diff.costDelta).toBeNull();
  });
});
