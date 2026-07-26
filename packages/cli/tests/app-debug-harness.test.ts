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
    expect(report.app).toEqual({ version: 3, title: "Demo App", widgetCount: 3 });
    expect(runOnServer).toHaveBeenCalledOnce();
    expect(runOnServer.mock.calls[0][0].params).toEqual({ prompt: "what is it?" });

    expect(report.interactions).toHaveLength(1);
    expect(report.interactions[0]).toMatchObject({
      step: "click Button-1",
      actions: ["run main"],
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

  it("warns rather than fails when the empty widget sits on an untaken branch", async () => {
    // One `If` fires one handle per run, so the other branch's widget is
    // legitimately empty. It still gets said out loud: a branch no input can
    // reach looks identical from inside a single run.
    const branching = workflowFile({
      graph: {
        nodes: [
          {
            id: "in1",
            type: "nodetool.input.StringInput",
            data: { name: "prompt", value: "hello" }
          },
          { id: "gate", type: "nodetool.control.If", data: {} },
          {
            id: "out1",
            type: "nodetool.output.StringOutput",
            data: { name: "result" }
          }
        ],
        edges: [
          { id: "e1", source: "in1", target: "gate" },
          { id: "e2", source: "gate", target: "out1" }
        ]
      }
    });
    const runOnServer = stubRunner([{ type: "job_update", status: "completed" }]);
    const report = await runAppDebug(
      branching,
      { outDir: mkdtempSync(join(tmpdir(), "app-bundle-")) },
      deps(runOnServer)
    );

    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.issues).not.toContainEqual(
      expect.stringMatching(/never received a value/)
    );
    expect(report.verdict.warnings?.join("\n")).toMatch(/branch that was not taken/);
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

/** A v3 app document: explicit operations, variables, and ID-form bindings. */
const v3File = (over: {
  operations?: unknown[];
  variables?: unknown[];
  resources?: unknown[];
  content?: unknown[];
}): string => {
  const dir = mkdtempSync(join(tmpdir(), "app-debug-v3-"));
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
          { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } }
        ],
        edges: []
      },
      app_doc: {
        schemaVersion: 3,
        ui: {
          root: { props: { title: "V3 App" } },
          content: over.content ?? [
            {
              type: "Markdown",
              props: { id: "Markdown-1", binding: "op:main/out:out1" }
            },
            {
              type: "Button",
              props: {
                id: "Button-1",
                label: "Run",
                events: [{ trigger: "click", kind: "run" }]
              }
            }
          ],
          zones: {}
        },
        operations: over.operations ?? [
          { id: "main", name: "Run", workflowId: "", inputs: {}, outputs: {}, policy: "replace" }
        ],
        variables: over.variables ?? [],
        resources: over.resources ?? []
      }
    }),
    "utf8"
  );
  return file;
};

const ANSWER = [
  { type: "output_update", node_id: "out1", output_name: "output", value: "the answer" },
  { type: "job_update", status: "completed" }
];

const outDir = () => mkdtempSync(join(tmpdir(), "app-bundle-"));

describe("runAppDebug — operations", () => {
  const twoOperations = [
    { id: "main", name: "Run", workflowId: "", inputs: {}, outputs: {}, policy: "replace" },
    { id: "polish", name: "Polish", workflowId: "", inputs: {}, outputs: {}, policy: "replace" }
  ];

  it("runs a named operation and keeps its values under its own key", async () => {
    const runOnServer = stubRunner(ANSWER);
    const dir = outDir();
    const report = await runAppDebug(
      v3File({
        operations: twoOperations,
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:polish/out:out1" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          },
          {
            type: "Button",
            props: {
              id: "Button-2",
              events: [{ trigger: "click", kind: "run", operationId: "polish" }]
            }
          }
        ]
      }),
      { interact: [{ run: "polish" }], outDir: dir },
      deps(runOnServer)
    );

    expect(report.verdict.ok).toBe(true);
    expect(report.interactions[0]).toMatchObject({ step: "run polish", runIndex: 0 });
    expect(report.invocations).toHaveLength(1);
    expect(report.invocations[0]).toMatchObject({
      operationId: "polish",
      decision: "start",
      status: "completed"
    });
    expect(report.values["polish.result"]).toBe("the answer");
    expect(report.values.result).toBeUndefined();
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("## Invocations");
  });

  it("clicking a widget dispatches to the operation its event names", async () => {
    const runOnServer = stubRunner(ANSWER);
    const report = await runAppDebug(
      v3File({
        operations: twoOperations,
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:polish/out:out1" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          },
          {
            type: "Button",
            props: {
              id: "Button-2",
              events: [{ trigger: "click", kind: "run", operationId: "polish" }]
            }
          }
        ]
      }),
      { interact: [{ click: "Button-2" }], outDir: outDir() },
      deps(runOnServer)
    );
    expect(report.interactions[0].actions).toEqual(["run polish"]);
    expect(report.invocations[0].operationId).toBe("polish");
  });

  it("cancels an operation's live invocation", async () => {
    const runOnServer = vi.fn(() => new Promise<ServerRunOutcome>(() => {}));
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: {},
            outputs: {},
            policy: "replace",
            timeoutMs: 5
          }
        ]
      }),
      { interact: [{ click: "Button-1" }, { cancel: "main" }], outDir: outDir() },
      deps(runOnServer as never)
    );
    expect(report.interactions[1].actions[0]).toMatch(/cancel main \(headless-1\)/);
    expect(report.invocations[0].status).toBe("cancelled");
  });

  it("reports a run that outlived the operation's timeout", async () => {
    const runOnServer = vi.fn(() => new Promise<ServerRunOutcome>(() => {}));
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: {},
            outputs: {},
            policy: "replace",
            timeoutMs: 5
          }
        ]
      }),
      { outDir: outDir() },
      deps(runOnServer as never)
    );
    expect(report.invocations[0].timedOutMs).toBe(5);
    expect(report.verdict.issues.join("\n")).toMatch(
      /did not finish within its 5ms timeout/
    );
    expect(report.verdict.issues.join("\n")).not.toMatch(/never executed/);
  });

  it("flags an operation whose workflow is not in the database", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          { id: "main", name: "Run", workflowId: "", inputs: {}, outputs: {}, policy: "replace" },
          {
            id: "other",
            name: "Other",
            workflowId: "missing-wf",
            inputs: {},
            outputs: {},
            policy: "replace"
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(/not in the local database/);
  });
});

describe("runAppDebug — variables", () => {
  const draft = {
    id: "draft",
    name: "draft",
    scope: "instance",
    persist: false
  };

  it("fans an output mapped to a variable into the variable and reports it", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: {},
            outputs: { out1: { to: "variable", variableId: "draft" } },
            policy: "replace"
          }
        ],
        variables: [draft],
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "var:draft" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.ok).toBe(true);
    expect(report.variables).toEqual({ draft: "the answer" });
    expect(report.widgets[0]).toMatchObject({ id: "Markdown-1", value: "the answer" });
  });

  it("seeds a declared variable default before the first run", async () => {
    const report = await runAppDebug(
      v3File({
        variables: [{ ...draft, default: "seeded" }],
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:main/out:out1" } },
          { type: "Text", props: { id: "Text-1", binding: "var:draft" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.variables.draft).toBe("seeded");
  });

  it("flags an output that writes a variable the app never declares", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: {},
            outputs: { out1: { to: "variable", variableId: "ghost" } },
            policy: "replace"
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(
      /writes variable "ghost", which the app does not declare/
    );
  });

  it("flags an input that reads a variable the app never declares", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: { in1: { from: "variable", variableId: "ghost" } },
            outputs: {},
            policy: "replace"
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(
      /reads variable "ghost", which the app does not declare/
    );
  });

  it("flags an input that reads a resource binding the app never declares", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "",
            inputs: { in1: { from: "resource", resourceBindingId: "ghost" } },
            outputs: {},
            policy: "replace"
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(
      /reads resource binding "ghost", which the app does not declare/
    );
  });

  it("warns that a persisted instance-scoped variable was downgraded", async () => {
    const report = await runAppDebug(
      v3File({ variables: [{ ...draft, persist: true }] }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.validation.warnings.join("\n")).toMatch(/downgraded to in-memory/);
  });
});

describe("runAppDebug — execution bindings", () => {
  it("flags a widget bound to an operation the app never declares", async () => {
    const report = await runAppDebug(
      v3File({
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:main/out:out1" } },
          { type: "Text", props: { id: "Text-1", binding: "op:ghost/exec#activity" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(
      /declares no operation "ghost"/
    );
  });

  it("flags an activity display for an operation no widget can run", async () => {
    const report = await runAppDebug(
      v3File({
        operations: [
          { id: "main", name: "Run", workflowId: "", inputs: {}, outputs: {}, policy: "replace" },
          { id: "polish", name: "Polish", workflowId: "", inputs: {}, outputs: {}, policy: "replace" }
        ],
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:main/out:out1" } },
          { type: "Text", props: { id: "Text-1", binding: "op:polish/exec#activity" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          }
        ]
      }),
      { outDir: outDir() },
      deps(stubRunner(ANSWER))
    );
    expect(report.verdict.issues.join("\n")).toMatch(/shows its execution state/);
  });

  it("reports the activity labels a streaming run emitted", async () => {
    const report = await runAppDebug(
      v3File({
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "op:main/out:out1" } },
          { type: "Text", props: { id: "Text-1", binding: "op:main/exec#activity" } },
          {
            type: "Button",
            props: { id: "Button-1", events: [{ trigger: "click", kind: "run" }] }
          }
        ]
      }),
      { outDir: outDir() },
      deps(
        stubRunner([
          { type: "tool_call_update", name: "search", message: "searching the web" },
          ...ANSWER
        ])
      )
    );
    expect(report.verdict.ok).toBe(true);
    expect(report.activity.map((a) => a.label)).toEqual(["searching the web"]);
    expect(report.widgets.find((w) => w.id === "Text-1")?.value).toBe(
      "searching the web"
    );
  });
});

describe("defaultInteractions", () => {
  it("falls back to an on-change run input when there is no run button", () => {
    const { spec } = parseAppSpec(
      {
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
      },
      {
        inputs: [
          { nodeId: "in1", nodeType: "nodetool.input.IntegerInput", name: "count" }
        ],
        outputs: [],
        variables: [],
        nodeIds: ["in1"]
      }
    );
    expect(defaultInteractions(spec!)).toEqual([
      { change: "Slider-1", value: undefined }
    ]);
  });
});
