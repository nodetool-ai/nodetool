/**
 * Tests for the app-debug orchestrator (src/app-debug/harness.ts), with the
 * kernel server runner stubbed out. Uses a workflow JSON file target carrying
 * an `app_doc`, and checks the interaction simulation, widget states, verdict,
 * and the on-disk bundle.
 */
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAppDebug, defaultInteractions } from "../src/app-debug/harness.js";
import { parseAppSpec } from "../src/app-debug/app-spec.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type { ServerRunInput, ServerRunOutcome } from "../src/debug/server-runner.js";

const workflowFile = (over: Record<string, unknown> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), "app-debug-"));
  const file = join(dir, "workflow.json");
  writeFileSync(
    file,
    JSON.stringify({
      id: "wf1",
      graph: {
        nodes: [
          {
            id: "in1",
            type: "nodetool.input.StringInput",
            data: { name: "prompt", value: "hello" }
          },
          {
            id: "out1",
            type: "nodetool.output.StringOutput",
            data: { name: "result" }
          }
        ],
        edges: []
      },
      app_doc: {
        version: 2,
        data: {
          root: { props: { title: "Demo App" } },
          content: [
            { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
            { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
            {
              type: "Button",
              props: {
                id: "Button-1",
                label: "Run",
                events: [{ trigger: "click", kind: "run", key: "", value: "" }]
              }
            }
          ],
          zones: {}
        }
      },
      ...over
    }),
    "utf8"
  );
  return file;
};

const stubRunner = (
  messages: Array<Record<string, unknown>>,
  status = "completed"
) =>
  vi.fn(async (input: ServerRunInput): Promise<ServerRunOutcome> => {
    const summary = collectExecutionSummary(messages);
    summary.status = status;
    return {
      report: {
        surface: "server",
        ok: status === "completed",
        status,
        error: null,
        durationMs: 5,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

const deps = (runOnServer: ReturnType<typeof stubRunner>) => ({
  loadFromDb: async () => null,
  runOnServer
});

describe("runAppDebug", () => {
  it("runs the app end-to-end: default click interaction, value folding, clean verdict, bundle", async () => {
    const runOnServer = stubRunner([
      { type: "output_update", node_id: "out1", output_name: "output", value: "the answer" },
      { type: "job_update", status: "completed" }
    ]);
    const outDir = mkdtempSync(join(tmpdir(), "app-bundle-"));
    const report = await runAppDebug(
      workflowFile(),
      { params: { prompt: "what is it?" }, outDir },
      deps(runOnServer)
    );

    expect(report.verdict.ok).toBe(true);
    expect(report.app).toEqual({ version: 2, title: "Demo App", widgetCount: 3 });
    expect(runOnServer).toHaveBeenCalledOnce();
    expect(runOnServer.mock.calls[0][0].params).toEqual({ prompt: "what is it?" });

    expect(report.interactions).toHaveLength(1);
    expect(report.interactions[0]).toMatchObject({
      step: "click Button-1",
      actions: ["run"],
      runIndex: 0,
      error: null
    });

    const markdown = report.widgets.find((w) => w.id === "Markdown-1");
    expect(markdown).toMatchObject({ value: "the answer", hasValue: true });
    expect(report.values.result).toBe("the answer");

    for (const file of ["report.json", "report.md", "app.json", "workflow.json"]) {
      expect(existsSync(join(outDir, file))).toBe(true);
    }
    expect(existsSync(join(outDir, "server", "run-1.messages.jsonl"))).toBe(true);
    expect(readFileSync(join(outDir, "report.md"), "utf8")).toContain("Demo App");
  });

  it("fails the verdict when a bound display widget never receives a value", async () => {
    const runOnServer = stubRunner([{ type: "job_update", status: "completed" }]);
    const report = await runAppDebug(
      workflowFile(),
      { outDir: mkdtempSync(join(tmpdir(), "app-bundle-")) },
      deps(runOnServer)
    );
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toMatch(/never received a value/);
  });

  it("surfaces run failures and node errors in the verdict", async () => {
    const runOnServer = stubRunner(
      [
        { type: "node_update", node_id: "llm", node_type: "ns.Agent", status: "error", error: "no api key" },
        { type: "job_update", status: "failed", error: "node failed" }
      ],
      "failed"
    );
    const report = await runAppDebug(
      workflowFile(),
      { outDir: mkdtempSync(join(tmpdir(), "app-bundle-")) },
      deps(runOnServer)
    );
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toMatch(/Run ended failed/);
    expect(report.verdict.issues.join("\n")).toMatch(/no api key/);
  });

  it("supports a scripted interaction sequence with set/change/click steps", async () => {
    const runOnServer = stubRunner([
      { type: "output_update", node_id: "out1", output_name: "output", value: "ok" },
      { type: "job_update", status: "completed" }
    ]);
    const report = await runAppDebug(
      workflowFile(),
      {
        interact: [
          { set: { key: "prompt", value: "scripted" } },
          { click: "Button" } // unique type reference
        ],
        outDir: mkdtempSync(join(tmpdir(), "app-bundle-"))
      },
      deps(runOnServer)
    );
    expect(report.verdict.ok).toBe(true);
    expect(runOnServer.mock.calls[0][0].params).toEqual({ prompt: "scripted" });
  });

  it("records an error for an unresolvable widget reference", async () => {
    const runOnServer = stubRunner([{ type: "job_update", status: "completed" }]);
    const report = await runAppDebug(
      workflowFile(),
      {
        interact: [{ click: "NoSuchWidget" }],
        outDir: mkdtempSync(join(tmpdir(), "app-bundle-"))
      },
      deps(runOnServer)
    );
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toMatch(/no widget matches/);
    expect(runOnServer).not.toHaveBeenCalled();
  });

  it("--no-run performs a static wiring check without executing the workflow", async () => {
    const runOnServer = stubRunner([]);
    const report = await runAppDebug(
      workflowFile(),
      { run: false, outDir: mkdtempSync(join(tmpdir(), "app-bundle-")) },
      deps(runOnServer)
    );
    expect(runOnServer).not.toHaveBeenCalled();
    expect(report.runs).toEqual([]);
    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.headline).toMatch(/static check only/);
  });

  it("fails the verdict when the workflow has no app_doc", async () => {
    const runOnServer = stubRunner([]);
    const report = await runAppDebug(
      workflowFile({ app_doc: undefined }),
      { outDir: mkdtempSync(join(tmpdir(), "app-bundle-")) },
      deps(runOnServer)
    );
    expect(report.spec).toBeNull();
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toMatch(/no app_doc/);
  });
});

describe("defaultInteractions", () => {
  it("falls back to an on-change run input when there is no run button", () => {
    const { spec } = parseAppSpec({
      version: 2,
      data: {
        root: { props: {} },
        content: [
          {
            type: "Slider",
            props: {
              id: "Slider-1",
              binding: "count",
              events: [{ trigger: "change", kind: "run", key: "", value: "" }]
            }
          }
        ],
        zones: {}
      }
    });
    expect(defaultInteractions(spec!)).toEqual([
      { change: "Slider-1", value: undefined }
    ]);
  });
});
