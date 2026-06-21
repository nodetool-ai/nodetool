/**
 * Tests for the debug harness verdict + Markdown renderer
 * (src/debug/verdict.ts, src/debug/markdown.ts).
 */
import { describe, expect, it } from "vitest";
import { buildVerdict } from "../src/debug/verdict.js";
import { renderReportMarkdown } from "../src/debug/markdown.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type { BrowserRunReport, DebugReport, ServerRunReport } from "../src/debug/types.js";

function serverReport(over: Partial<ServerRunReport> = {}): ServerRunReport {
  return {
    surface: "server",
    ok: true,
    status: "completed",
    error: null,
    durationMs: 1234,
    summary: collectExecutionSummary([{ type: "job_update", status: "completed" }]),
    trace: null,
    ...over
  };
}

describe("buildVerdict", () => {
  it("is ok when the server run completes clean", () => {
    const verdict = buildVerdict(serverReport(), null);
    expect(verdict.ok).toBe(true);
    expect(verdict.headline).toContain("clean");
  });

  it("collects server node errors as issues", () => {
    const summary = collectExecutionSummary([
      { type: "node_update", node_id: "b", node_type: "ns.B", status: "error", error: "kaboom" },
      { type: "job_update", status: "failed", error: "node failed" }
    ]);
    const verdict = buildVerdict(
      serverReport({ ok: false, status: "failed", error: "node failed", summary }),
      null
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join("\n")).toContain("kaboom");
  });

  it("treats an unavailable browser surface as non-fatal", () => {
    const browser: BrowserRunReport = {
      surface: "browser",
      ok: false,
      status: "unavailable",
      error: null,
      durationMs: null,
      summary: collectExecutionSummary([]),
      consoleErrors: [],
      unavailableReason: "web deps not installed"
    };
    const verdict = buildVerdict(serverReport(), browser);
    expect(verdict.ok).toBe(true);
    expect(verdict.issues.some((i) => i.includes("unavailable"))).toBe(true);
  });

  it("flags browser console errors", () => {
    const browser: BrowserRunReport = {
      surface: "browser",
      ok: true,
      status: "completed",
      error: null,
      durationMs: 100,
      summary: collectExecutionSummary([{ type: "job_update", status: "completed" }]),
      consoleErrors: ["TypeError: x is undefined"]
    };
    const verdict = buildVerdict(serverReport(), browser);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join("\n")).toContain("TypeError");
  });
});

describe("renderReportMarkdown", () => {
  it("renders headline, target, surfaces and issues", () => {
    const server = serverReport({
      ok: false,
      status: "failed",
      error: "boom",
      summary: collectExecutionSummary([
        { type: "node_update", node_id: "n1", node_type: "ns.N", status: "error", error: "boom" },
        { type: "log_update", node_id: "n1", severity: "error", content: "stack trace here" },
        { type: "job_update", status: "failed", error: "boom" }
      ])
    });
    const report: DebugReport = {
      generatedAt: "2026-06-21T00:00:00Z",
      target: { ref: "wf.json", source: "json", workflowId: "wf1", nodeCount: 2, edgeCount: 1 },
      workflow: { nodes: [], edges: [] },
      server,
      browser: null,
      verdict: buildVerdict(server, null),
      bundleDir: "/tmp/bundle"
    };
    const md = renderReportMarkdown(report);
    expect(md).toContain("# Workflow debug report");
    expect(md).toContain("Server surface");
    expect(md).toContain("ns.N");
    expect(md).toContain("stack trace here");
    expect(md).toContain("## Issues");
  });
});
