/**
 * The verdict rules the other app-debug suites do not reach. Each decides what
 * an empty widget means after a headless run: an execution field of an
 * operation that never ran, a variable only the UI writes, a branch the run did
 * not take, an operation past its timeout, and an app nothing ever ran.
 */
import { describe, expect, it, vi } from "vitest";
import { simulateApp } from "../src/app-debug/simulate.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "../src/app-debug/simulate.js";
import type {
  InteractionStep,
  ResolvedAppTarget
} from "../src/app-debug/types.js";
import { resolvedBundle, resolvedWorkflow } from "./app-debug-fixtures.js";

type RunOnServer = (input: AppServerRunInput) => Promise<AppServerRunOutcome>;

const runButton = {
  type: "Button",
  props: {
    id: "Button-1",
    label: "Run",
    events: [{ trigger: "click", kind: "run", key: "", value: "" }]
  }
};

/** A run that completes, emitting whatever messages the case asks for. */
const stubRunner = (
  messages: ReadonlyArray<Record<string, unknown>> = [
    {
      type: "output_update",
      node_id: "out1",
      output_name: "output",
      value: "done"
    },
    { type: "job_update", status: "completed" }
  ]
) =>
  vi.fn<RunOnServer>(async () => {
    const summary = collectExecutionSummary(messages);
    summary.status = "completed";
    return {
      report: {
        surface: "server" as const,
        ok: true,
        status: "completed",
        error: null,
        durationMs: 5,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

const run = async (
  target: ResolvedAppTarget,
  interact?: InteractionStep[],
  runOnServer: RunOnServer = stubRunner()
) => {
  const report = await simulateApp(
    target,
    { ...(interact ? { interact } : {}) },
    { loadFromDb: async () => null, runOnServer }
  );
  return { report, runOnServer };
};

const graph = {
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
};

/** A legacy `app_doc` target over `graph`. */
const appTarget = (
  content: Array<Record<string, unknown>>,
  variables: Array<Record<string, unknown>> = []
): ResolvedAppTarget =>
  resolvedWorkflow(graph, {
    version: 2,
    variables,
    data: { root: { props: { title: "Verdict App" } }, content, zones: {} }
  });

/** Two operations over two graphs; the run button drives the first. */
const twoOperationApp = (
  content: Array<Record<string, unknown>>,
  operationOverrides: Record<string, unknown> = {}
): ResolvedAppTarget =>
  resolvedBundle({
    schemaVersion: 1,
    name: "Two-step App",
    description: "",
    app: {
      schemaVersion: 3,
      ui: { root: { props: { title: "Two-step App" } }, content, zones: {} },
      operations: [
        {
          id: "draft",
          name: "Draft",
          workflowId: "wf-draft",
          inputs: {},
          outputs: {},
          policy: "replace",
          ...operationOverrides
        },
        {
          id: "publish",
          name: "Publish",
          workflowId: "wf-publish",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      resources: [],
      variables: []
    },
    workflows: [
      {
        key: "wf-draft",
        name: "Draft",
        graph: {
          nodes: [
            {
              id: "out1",
              type: "nodetool.output.StringOutput",
              data: { name: "result" }
            }
          ],
          edges: []
        }
      },
      {
        key: "wf-publish",
        name: "Publish",
        graph: {
          nodes: [
            {
              id: "out2",
              type: "nodetool.output.StringOutput",
              data: { name: "published" }
            }
          ],
          edges: []
        }
      }
    ]
  });

describe("app verdict — execution-state bindings", () => {
  it("fails when a widget shows execution state of an operation nothing ran", async () => {
    const { report } = await run(
      twoOperationApp([
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        {
          type: "Text",
          props: { id: "Text-1", binding: "op:publish/exec#progress" }
        },
        runButton
      ]),
      [{ click: "Button-1" }]
    );

    expect(report.verdict.issues.join("\n")).toMatch(
      /Text "Text-1" shows operation "publish" progress, but that operation never ran\./
    );
    expect(report.verdict.ok).toBe(false);
  });

  it("only warns when the operation ran but reported no activity", async () => {
    const { report } = await run(
      twoOperationApp([
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        {
          type: "Text",
          props: { id: "Text-1", binding: "op:draft/exec#activity" }
        },
        runButton
      ]),
      [{ click: "Button-1" }]
    );

    expect(report.verdict.warnings.join("\n")).toMatch(
      /Text "Text-1" shows activity, but the run reported none/
    );
    expect(report.verdict.issues).toEqual([]);
    expect(report.verdict.ok).toBe(true);
  });

  it("says nothing when the run did report activity", async () => {
    const { report } = await run(
      twoOperationApp([
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        {
          type: "Text",
          props: { id: "Text-1", binding: "op:draft/exec#activity" }
        },
        runButton
      ]),
      [{ click: "Button-1" }],
      stubRunner([
        {
          type: "tool_call_update",
          name: "search",
          message: "searching the web"
        },
        {
          type: "output_update",
          node_id: "out1",
          output_name: "output",
          value: "done"
        },
        { type: "job_update", status: "completed" }
      ])
    );

    expect(report.verdict.warnings.join("\n")).not.toMatch(/shows activity/);
    expect(report.verdict.ok).toBe(true);
  });
});

describe("app verdict — variables only the UI writes", () => {
  const conversation = [
    { id: "conversation", name: "conversation", scope: "instance", persist: false }
  ];

  it("does not fault an empty conversation a composer would have filled", async () => {
    const { report } = await run(
      appTarget(
        [
          {
            type: "ChatThread",
            props: { id: "ChatThread-1", binding: "var:conversation" }
          },
          {
            type: "ChatComposer",
            props: {
              id: "ChatComposer-1",
              binding: "prompt",
              historyBinding: "var:conversation",
              events: [{ trigger: "click", kind: "run", key: "", value: "" }]
            }
          }
        ],
        conversation
      ),
      [{ click: "ChatComposer-1" }]
    );

    expect(report.verdict.issues).toEqual([]);
    expect(report.verdict.warnings.join("\n")).not.toMatch(/ChatThread-1/);
    expect(report.verdict.ok).toBe(true);
  });

  it("still faults an empty variable no widget writes", async () => {
    const { report } = await run(
      appTarget(
        [
          {
            type: "Markdown",
            props: { id: "Markdown-1", binding: "var:conversation" }
          },
          runButton
        ],
        conversation
      ),
      [{ click: "Button-1" }]
    );

    expect(report.verdict.issues.join("\n")).toMatch(
      /Markdown "Markdown-1" is bound to "var:conversation" but never received a value/
    );
  });
});

describe("app verdict — a branch the run did not take", () => {
  const branchingGraph = {
    nodes: [
      {
        id: "in1",
        type: "nodetool.input.StringInput",
        data: { name: "prompt", value: "hello" }
      },
      { id: "if1", type: "nodetool.control.If", data: { name: "branch" } },
      {
        id: "out1",
        type: "nodetool.output.StringOutput",
        data: { name: "taken" }
      },
      {
        id: "out2",
        type: "nodetool.output.StringOutput",
        data: { name: "untaken" }
      }
    ],
    edges: [
      { id: "e1", source: "if1", target: "out1" },
      { id: "e2", source: "if1", target: "out2" }
    ]
  };

  it("warns rather than fails on a widget downstream of an untaken branch", async () => {
    const target = resolvedWorkflow(branchingGraph, {
      version: 2,
      variables: [],
      data: {
        root: { props: { title: "Branching App" } },
        content: [
          { type: "Markdown", props: { id: "Markdown-1", binding: "taken" } },
          { type: "Markdown", props: { id: "Markdown-2", binding: "untaken" } },
          runButton
        ],
        zones: {}
      }
    });

    const { report } = await run(target, [{ click: "Button-1" }]);

    expect(report.verdict.warnings.join("\n")).toMatch(
      /Markdown "Markdown-2" is bound to "untaken", downstream of a branch that was not taken this run/
    );
    expect(report.verdict.issues).toEqual([]);
    expect(report.verdict.ok).toBe(true);
  });
});

describe("app verdict — an operation that outlived its timeout", () => {
  it("fails and says the app would still show it running", async () => {
    const hangs: RunOnServer = () => new Promise(() => {});
    const { report } = await run(
      twoOperationApp(
        [
          { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
          runButton
        ],
        { timeoutMs: 5 }
      ),
      [{ click: "Button-1" }],
      hangs
    );

    expect(report.verdict.issues.join("\n")).toMatch(
      /Operation "draft" did not finish within its 5ms timeout — the app would show it still running\./
    );
    expect(report.verdict.ok).toBe(false);
  });
});

describe("app verdict — nothing ever ran", () => {
  const widgets = [
    { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
    { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
    runButton
  ];

  it("fails an app whose script triggered no run at all", async () => {
    const { report, runOnServer } = await run(appTarget(widgets), []);

    expect(runOnServer).not.toHaveBeenCalled();
    expect(report.verdict.issues).toContain(
      "No interaction triggered a workflow run — the app was never executed."
    );
    expect(report.verdict.headline).toMatch(/^App has issues —/);
  });

  it("reports the static check only when runs are disabled", async () => {
    const report = await simulateApp(
      appTarget(widgets),
      { run: false },
      { loadFromDb: async () => null, runOnServer: stubRunner() }
    );

    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.headline).toBe(
      "App wiring is valid (static check only — no run executed)."
    );
  });
});
