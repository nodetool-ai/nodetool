/**
 * The orchestrator: stage order, complaints, and the bounds.
 *
 * Every case here runs the real loop — the real bridge, the real simulator, the
 * real oracle — with a scripted provider standing in for the model and a stub
 * kernel runner standing in for a workflow run. No network, no database, no
 * registry: what is asserted is the orchestration, which is all `build.ts`
 * owns.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import { collectExecutionSummary } from "@nodetool-ai/execution/debug";
import { buildApp, type BuildAppOptions } from "../src/app-build/build.js";
import type { BuildSpec } from "../src/app-build/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

// --- fixtures ---------------------------------------------------------------

const GRAPH = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      properties: { name: "prompt", value: "" }
    },
    {
      id: "out1",
      type: "nodetool.output.StringOutput",
      properties: { name: "text" }
    }
  ],
  edges: []
};

const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

const spec = (): BuildSpec => ({
  title: "Drafter",
  operations: [
    {
      id: "draft",
      objective: "",
      workflowId: "wf1",
      inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
      outputs: [{ name: "text", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "prompt-input",
      type: "TextInput",
      binding: "op:draft/in:prompt",
      label: "Prompt"
    },
    { role: "run-button", type: "Button", binding: "", label: "Draft it" },
    {
      role: "draft-output",
      type: "Markdown",
      binding: "op:draft/out:text",
      label: "Draft"
    }
  ],
  interactions: [
    {
      name: "draft-once",
      steps: [
        { set: { key: "prompt", value: "a haiku", operationId: "draft" } },
        { click: "run-button" }
      ],
      expect: [{ widget: "draft-output", check: "nonEmpty" }]
    }
  ]
});

const APP = "app-under-build";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * A provider that replays one scripted list of tool calls per turn through the
 * tools' own `execute` closures, the way `generateLoop` dispatches
 * self-executing tools. Each `buildApp` round consumes the next script.
 */
function scriptedProvider(
  scripts: ScriptedCall[][],
  opts: { costPerCall?: number } = {}
): BaseProvider & { turns: number } {
  let turn = 0;
  let cost = 0;
  const provider = {
    provider: "scripted",
    turns: 0,
    hasToolSupport: async () => true,
    getTotalCost: () => cost,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const script = scripts[Math.min(turn, scripts.length - 1)] ?? [];
      turn += 1;
      provider.turns = turn;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
        cost += opts.costPerCall ?? 0;
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  };
  return provider as unknown as BaseProvider & { turns: number };
}

const stubRunner = () =>
  vi.fn(async (_input: AppServerRunInput): Promise<AppServerRunOutcome> => {
    const messages = [
      {
        type: "output_update",
        node_id: "out1",
        output_name: "output",
        value: "a drafted note"
      },
      { type: "job_update", status: "completed" }
    ];
    const summary = collectExecutionSummary(messages);
    summary.status = "completed";
    return {
      report: {
        surface: "server",
        ok: true,
        status: "completed",
        error: null,
        durationMs: 3,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

/** The tool calls that author the app the spec above describes. */
const goodAuthorScript = (): ScriptedCall[] => [
  {
    name: "ui_app_add_operation",
    args: {
      application_id: APP,
      id: "draft",
      name: "draft",
      target_workflow_id: "wf-draft"
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "TextInput",
      props: { label: "Prompt", binding: "op:draft/in:in1" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Markdown",
      props: { label: "Draft", binding: "op:draft/out:out1" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Button",
      props: {
        label: "Draft it",
        events: [{ trigger: "click", kind: "run", operationId: "draft" }]
      }
    }
  },
  {
    name: "ui_app_finish",
    args: { application_id: APP, summary: "a drafting app" }
  }
];

/** The same app, but the display widget is bound to a node that is not there. */
const badBindingScript = (): ScriptedCall[] =>
  goodAuthorScript().map((call) =>
    call.name === "ui_app_add_component" &&
    (call.args.props as { label?: string })?.label === "Draft"
      ? {
          ...call,
          args: {
            ...call.args,
            props: { label: "Draft", binding: "op:draft/out:result" }
          }
        }
      : call
  );

function options(
  provider: BaseProvider,
  overrides: Partial<BuildAppOptions> = {}
): BuildAppOptions {
  return {
    spec: spec(),
    provider,
    model: "m",
    context: createMockContext(),
    registry,
    runOnServer: stubRunner(),
    loadWorkflow: async (id: string) =>
      id === "wf1" ? { graph: GRAPH, name: "Drafter workflow" } : null,
    ...overrides
  };
}

// --- tests ------------------------------------------------------------------

describe("buildApp", () => {
  it("builds, checks, runs and reports a green app in one pass", async () => {
    const provider = scriptedProvider([goodAuthorScript()]);
    const report = await buildApp(options(provider));

    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.reason).toBe("green on the first pass");
    expect(report.repairs).toEqual([]);
    expect(report.stages.map((s) => s.stage)).toEqual([
      "spec",
      "plan",
      "author",
      "check",
      "run",
      "judge"
    ]);
    expect(report.bundle?.workflows.map((w) => w.key)).toEqual(["wf-draft"]);
    expect(report.bundle?.app.operations[0]?.workflowId).toBe("wf-draft");
    // The judge is a stub, and the verdict says so rather than implying a score.
    expect(report.verdict.notSimulated.join(" ")).toMatch(/judge stage/i);
    expect(report.judge?.interactions[0]?.achieved).toBe(true);
  });

  it("names an unresolvable binding and repairs it by editing, not rebuilding", async () => {
    const provider = scriptedProvider([
      badBindingScript(),
      [
        {
          name: "ui_app_update_component",
          args: {
            application_id: APP,
            id: "Markdown-2",
            props: { binding: "op:draft/out:out1" }
          }
        },
        {
          name: "ui_app_finish",
          args: { application_id: APP, summary: "fixed the binding" }
        }
      ]
    ]);
    const report = await buildApp(options(provider));

    expect(report.repairs).toHaveLength(1);
    expect(report.repairs[0]?.issues.map((i) => i.code)).toContain(
      "binding_node_missing"
    );
    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.reason).toBe("green after 1 repair round(s)");
    // The repair edited: the widget ids are the ones the first round created,
    // so nothing was deleted and re-added.
    const ids = report.appDebug?.spec?.widgets.map((w) => w.id) ?? [];
    expect(ids).toEqual(["TextInput-1", "Markdown-2", "Button-3"]);
  });

  it("fails with the repair budget named when the app never comes good", async () => {
    const provider = scriptedProvider([badBindingScript()]);
    const report = await buildApp(options(provider, { maxRepairs: 1 }));

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toMatch(/repair budget exhausted \(1 repair/);
    expect(report.bundle).toBeNull();
  });

  it("ends the build when a fixed issue comes back", async () => {
    const provider = scriptedProvider([
      // Round 0: bad binding.
      badBindingScript(),
      // Round 1: fixed.
      [
        {
          name: "ui_app_update_component",
          args: {
            application_id: APP,
            id: "Markdown-2",
            props: { binding: "op:draft/out:out1" }
          }
        },
        // …but the run trigger is removed, so the round still fails.
        {
          name: "ui_app_remove_component",
          args: { application_id: APP, id: "Button-3" }
        },
        { name: "ui_app_finish", args: { application_id: APP, summary: "x" } }
      ],
      // Round 2: the button comes back, and so does the bad binding.
      [
        {
          name: "ui_app_update_component",
          args: {
            application_id: APP,
            id: "Markdown-2",
            props: { binding: "op:draft/out:result" }
          }
        },
        {
          name: "ui_app_add_component",
          args: {
            application_id: APP,
            type: "Button",
            props: {
              label: "Draft it",
              events: [{ trigger: "click", kind: "run", operationId: "draft" }]
            }
          }
        },
        { name: "ui_app_finish", args: { application_id: APP, summary: "x" } }
      ]
    ]);
    const report = await buildApp(options(provider, { maxRepairs: 5 }));

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toMatch(/oscillating/);
    expect(report.verdict.reason).toMatch(/round 1 and is back in round 2/);
    expect(report.bundle).toBeNull();
  });

  it("fails closed when the wall clock runs out", async () => {
    const provider = scriptedProvider([goodAuthorScript()]);
    const report = await buildApp(options(provider, { timeoutMs: -1 }));

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toMatch(/wall-clock budget exhausted/);
    expect(report.bundle).toBeNull();
  });

  it("fails closed when the cost cap is spent", async () => {
    const provider = scriptedProvider([goodAuthorScript()], {
      costPerCall: 1
    });
    const report = await buildApp(
      options(provider, { costCapUsd: 0.5, maxRepairs: 1 })
    );

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toMatch(/cost budget exhausted \(\$0\.50\)/);
  });

  it("fails closed when the spec names a workflow it does not fit", async () => {
    const provider = scriptedProvider([goodAuthorScript()]);
    const mismatched = spec();
    mismatched.operations[0]!.outputs = [{ name: "summary", type: "string" }];
    const report = await buildApp(
      options(provider, { spec: mismatched })
    );

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toMatch(/planning failed/);
    const planStage = report.stages.find((s) => s.stage === "plan");
    expect(planStage?.issues.map((i) => i.code)).toEqual([
      "declared_io_mismatch"
    ]);
  });

  it("aborts cleanly when cancelled mid-author", async () => {
    const controller = new AbortController();
    const provider = scriptedProvider([
      [
        {
          name: "ui_app_add_operation",
          args: {
            application_id: APP,
            id: "draft",
            target_workflow_id: "wf-draft"
          }
        },
        ...goodAuthorScript().slice(1)
      ]
    ]);
    const report = await buildApp(
      options(provider, {
        signal: controller.signal,
        onLog: () => controller.abort()
      })
    );

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.reason).toBe("cancelled");
    expect(report.bundle).toBeNull();
  });

  it("writes one ledger row per billable stage when attributed", async () => {
    const provider = scriptedProvider([goodAuthorScript()], {
      costPerCall: 0.01
    });
    const create = vi.fn(async () => ({}));
    vi.doMock("@nodetool-ai/models", () => ({ Prediction: { create } }));

    const report = await buildApp(
      options(provider, { ledger: { userId: "1" }, buildId: "build-1" })
    );

    expect(report.cost.usd).toBeGreaterThan(0);
    expect(create).toHaveBeenCalled();
    const row = create.mock.calls[0]?.[0] as unknown as {
      node_type: string;
      node_id: string;
    };
    expect(row.node_type).toBe("app-build");
    expect(row.node_id).toBe("build-1");
    vi.doUnmock("@nodetool-ai/models");
  });
});
