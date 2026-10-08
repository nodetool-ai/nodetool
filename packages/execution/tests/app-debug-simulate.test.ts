/**
 * Tests for the parts of the simulator that decide what a run actually sees and
 * what a scripted step is allowed to do: node-property overlays, writes that
 * address something no widget can fill, and which operation a bare-name binding
 * resolves against. The workflow runner is stubbed, so what these assert is the
 * simulator's own behaviour.
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

const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", value: "hello" }
    },
    {
      id: "llm1",
      type: "nodetool.text.Generate",
      data: { name: "generate", strength: 0.2 }
    },
    { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } }
  ],
  edges: []
};

const runButton = {
  type: "Button",
  props: {
    id: "Button-1",
    label: "Run",
    events: [{ trigger: "click", kind: "run", key: "", value: "" }]
  }
};

const appTarget = (content: Array<Record<string, unknown>>): ResolvedAppTarget =>
  resolvedWorkflow(graph, {
    version: 2,
    variables: [],
    data: { root: { props: { title: "Sim App" } }, content, zones: {} }
  });

const stubRunner = () =>
  vi.fn<(input: AppServerRunInput) => Promise<AppServerRunOutcome>>(async () => {
    const messages = [
      { type: "output_update", node_id: "out1", output_name: "output", value: "done" },
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
        durationMs: 5,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

const run = async (target: ResolvedAppTarget, interact?: InteractionStep[]) => {
  const runOnServer = stubRunner();
  const report = await simulateApp(
    target,
    { ...(interact ? { interact } : {}) },
    { loadFromDb: async () => null, runOnServer }
  );
  return { report, runOnServer };
};

/** The `properties` a run's graph carried for one node. */
const propsOf = (input: AppServerRunInput, nodeId: string) =>
  input.graph.nodes.find((n) => n.id === nodeId)?.properties as
    | Record<string, unknown>
    | undefined;

describe("app debug — node-property bindings", () => {
  it("overlays a widget-driven node property onto the graph the run receives", async () => {
    const target = appTarget([
      {
        type: "Slider",
        props: { id: "Slider-1", binding: "op:main/prop:llm1#strength" }
      },
      { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
      runButton
    ]);
    const { report, runOnServer } = await run(target, [
      { set: { key: "op:main/prop:llm1#strength", value: 0.9 } },
      { click: "Button-1" }
    ]);

    expect(report.interactions.map((i) => i.error)).toEqual([null, null]);
    expect(propsOf(runOnServer.mock.calls[0][0], "llm1")).toMatchObject({
      strength: 0.9
    });
    // The resolved target keeps the stored value — the overlay is per run.
    expect(target.graph.nodes.find((n) => n.id === "llm1")?.properties).toMatchObject(
      { strength: 0.2 }
    );
  });

  it("leaves the graph alone when no node property is bound", async () => {
    const { runOnServer } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        runButton
      ])
    );

    expect(propsOf(runOnServer.mock.calls[0][0], "llm1")).toMatchObject({
      strength: 0.2
    });
  });
});

/** A two-operation bundle whose workflows both contain a node called `up`. */
const sharedNodeIdBundle = (upscale: string) => ({
  schemaVersion: 1,
  name: "Upscale",
  description: "",
  app: {
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Upscale" } },
      content: [
        {
          type: "Slider",
          props: { id: "Slider-faithful", binding: "op:faithful/prop:up#scale" }
        },
        {
          type: "Slider",
          props: { id: "Slider-clarity", binding: "op:clarity/prop:up#scale" }
        },
        {
          type: "Button",
          props: {
            id: "Button-faithful",
            label: "Faithful",
            events: [
              { trigger: "click", kind: "run", operationId: "faithful" }
            ]
          }
        },
        {
          type: "Button",
          props: {
            id: "Button-clarity",
            label: "Clarity",
            events: [{ trigger: "click", kind: "run", operationId: "clarity" }]
          }
        }
      ],
      zones: {}
    },
    operations: ["faithful", "clarity"].map((id) => ({
      id,
      name: id,
      workflowId: `wf-${id}`,
      inputs: {},
      outputs: {},
      policy: "replace" as const
    })),
    resources: [],
    variables: []
  },
  workflows: ["faithful", "clarity"].map((id) => ({
    key: `wf-${id}`,
    name: id,
    graph: {
      nodes: [
        { id: "up", type: upscale, data: { scale: 1 } },
        {
          id: "out1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" }
        }
      ],
      edges: []
    }
  }))
});

describe("app debug — overlays are scoped to one operation", () => {
  it("keeps each operation's node-property override out of the other's run", async () => {
    const { runOnServer } = await run(
      resolvedBundle(sharedNodeIdBundle("nodetool.image.Upscale")),
      [
        { set: { key: "op:faithful/prop:up#scale", value: 2 } },
        { set: { key: "op:clarity/prop:up#scale", value: 4 } },
        { click: "Button-faithful" },
        { click: "Button-clarity" }
      ]
    );

    expect(runOnServer).toHaveBeenCalledTimes(2);
    expect(propsOf(runOnServer.mock.calls[0][0], "up")).toMatchObject({
      scale: 2
    });
    expect(propsOf(runOnServer.mock.calls[1][0], "up")).toMatchObject({
      scale: 4
    });
  });

  it("leaves an operation's run untouched by another operation's override", async () => {
    const { runOnServer } = await run(
      resolvedBundle(sharedNodeIdBundle("nodetool.image.Upscale")),
      [
        { set: { key: "op:faithful/prop:up#scale", value: 2 } },
        { click: "Button-clarity" }
      ]
    );

    expect(propsOf(runOnServer.mock.calls[0][0], "up")).toMatchObject({
      scale: 1
    });
  });
});

describe("app debug — writes that cannot land", () => {
  it("fails a set step that names an output", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        runButton
      ]),
      [{ set: { key: "result", value: "typed by hand" } }]
    );

    expect(report.interactions[0]).toMatchObject({ actions: [] });
    expect(report.interactions[0].error).toMatch(/resolves to an output/);
    expect(report.verdict.ok).toBe(false);
  });

  it("fails a change step on a widget whose binding resolves to nothing", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "ghost" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        runButton
      ]),
      [{ change: "TextInput-1", value: "typed" }]
    );

    expect(report.interactions[0]).toMatchObject({ actions: [] });
    expect(report.interactions[0].error).toMatch(/resolves to nothing/);
  });

  it("warns instead of failing when a param names an output", async () => {
    const runOnServer = stubRunner();
    const report = await simulateApp(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        runButton
      ]),
      { params: { result: "typed by hand" } },
      { loadFromDb: async () => null, runOnServer }
    );

    expect(report.validation.warnings.join("\n")).toMatch(
      /Param "result" resolves to an output/
    );
  });

  it("clears a value when a change step sets null", async () => {
    // The input's default is non-empty, so a `disabledWhen … empty` button is
    // enabled until the step clears the field.
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
        {
          ...runButton,
          props: {
            ...runButton.props,
            disabledWhen: { binding: "prompt", op: "empty" }
          }
        }
      ]),
      [{ change: "TextInput-1", value: null }, { click: "Button-1" }]
    );

    expect(report.interactions[0].actions).toEqual(["set main:in1"]);
    expect(report.interactions[1].error).toMatch(/disabled by `prompt empty`/);
  });
});

describe("app debug — default operation", () => {
  it("resolves a bare name against the first declared operation", async () => {
    const target = resolvedBundle({
      schemaVersion: 1,
      name: "Two-step App",
      description: "",
      app: {
        schemaVersion: 3,
        ui: {
          root: { props: { title: "Two-step App" } },
          content: [
            { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
            runButton
          ],
          zones: {}
        },
        operations: [
          {
            id: "draft",
            name: "Draft",
            workflowId: "wf-draft",
            inputs: {},
            outputs: {},
            policy: "replace"
          },
          {
            id: "main",
            name: "Publish",
            workflowId: "wf-main",
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
                id: "outA",
                type: "nodetool.output.StringOutput",
                data: { name: "result" }
              }
            ],
            edges: []
          }
        },
        {
          key: "wf-main",
          name: "Publish",
          graph: {
            nodes: [
              {
                id: "outB",
                type: "nodetool.output.StringOutput",
                data: { name: "result" }
              }
            ],
            edges: []
          }
        }
      ]
    });

    const { report } = await run(target, []);

    // The web runtime takes `operations[0]`, whatever it is called, so the same
    // document must not resolve "result" to the operation named "main" here.
    expect(report.widgets.find((w) => w.id === "Markdown-1")?.stateKey).toBe(
      "draft:outA"
    );
  });
});

describe("app debug — static binding checks", () => {
  it("errors on an ID-form binding to a node the workflow does not have", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        {
          type: "Markdown",
          props: { id: "Markdown-1", binding: "op:main/out:ghost" }
        },
        runButton
      ]),
      []
    );

    expect(report.validation.errors.join("\n")).toMatch(
      /Markdown "Markdown-1": bound to "op:main\/out:ghost" but operation "main" runs a workflow with no node "ghost"/
    );
    expect(report.verdict.ok).toBe(false);
  });

  it("warns when a condition binding resolves to nothing", async () => {
    const { report } = await run(
      appTarget([
        { type: "TextInput", props: { id: "TextInput-1", binding: "prompt" } },
        {
          type: "Markdown",
          props: {
            id: "Markdown-1",
            binding: "result",
            visibleWhen: { binding: "ghostName", op: "notEmpty" }
          }
        },
        runButton
      ]),
      []
    );

    expect(report.validation.warnings.join("\n")).toMatch(
      /visibleWhen reads "ghostName", which resolves to nothing/
    );
    // The runtime behaviour is unchanged: an unresolvable condition is ignored.
    expect(report.widgets.find((w) => w.id === "Markdown-1")?.visible).toBe(true);
  });
});


describe("app debug — dynamic ChoiceCards", () => {
  const target = () => resolvedWorkflow(graph, {
    schemaVersion: 4,
    operations: [{ id: "main", name: "Run", workflowId: "wf1", inputs: {}, outputs: {}, policy: "replace" }],
    resources: [],
    variables: [{ id: "choices", name: "choices", scope: "instance", persist: false, default: [{ value: "hero", title: "Hero" }, { value: "locked", disabled: true }] }],
    ui: { root: { props: { title: "Choices" } }, content: [
      { type: "ChoiceCards", props: { id: "directions", binding: "prompt", optionsBinding: "var:choices" } },
      runButton
    ], zones: {} }
  });
  it("resolves a readable options binding and writes only available selections", async () => {
    const { report } = await run(target(), [
      { change: "directions", value: "hero" },
      { change: "directions", value: "locked" },
      { change: "directions", value: "missing" },
      { set: { key: "var:choices", value: [{ value: "new", title: "New" }] } },
      { change: "directions", value: "hero" },
      { change: "directions", value: "new" }
    ]);
    expect(report.validation.errors).toEqual([]);
    expect(report.interactions.map((interaction) => interaction.error)).toEqual([
      null,
      'changed "directions" to an unavailable or disabled choice.',
      'changed "directions" to an unavailable or disabled choice.',
      null,
      'changed "directions" to an unavailable or disabled choice.',
      null
    ]);
    expect(report.interactions[0].actions).toEqual(["set main:in1"]);
    expect(report.interactions[1].actions).toEqual([]);
  });
  it("diagnoses a missing operation output in optionsBinding", async () => {
    const { report } = await run(appTarget([
      { type: "ChoiceCards", props: { id: "directions", binding: "prompt", optionsBinding: "op:main/out:missing" } },
      runButton
    ]), []);
    expect(report.validation.errors.join("\n")).toMatch(/optionsBinding.*missing/);
  });
});

it("app debug selects choices delivered by a real output message fold", async () => {
  const target = appTarget([
    { type: "ChoiceCards", props: { id: "directions", binding: "prompt", optionsBinding: "op:main/out:out1" } },
    runButton
  ]);
  const runner = stubRunner();
  const report = await simulateApp(target, { interact: [{ click: "Button-1" }, { change: "directions", value: "hero" }] }, {
    loadFromDb: async () => null,
    runOnServer: async (input) => {
      const outcome = await runner(input);
      const messages = [{ type: "output_update", node_id: "out1", output_name: "output", value: [{ value: "hero", title: "Product hero", image: "asset://hero" }] }, { type: "job_update", status: "completed" }];
      return { ...outcome, rawMessages: messages as never[], report: { ...outcome.report, summary: collectExecutionSummary(messages) } };
    }
  });
  expect(report.interactions.map((interaction) => interaction.error)).toEqual([null, null]);
  expect(report.interactions[1].actions).toEqual(["set main:in1"]);
});

it("app debug lets a run's output land after the click's later setVariable, as the web runtime does", async () => {
  // The web runtime fires a click's events without waiting on the run, so a
  // `setVariable` after the `run` lands first and the run's output last.
  const target = resolvedWorkflow(graph, {
    schemaVersion: 4,
    operations: [{ id: "main", name: "Run", workflowId: "wf1", inputs: {}, outputs: { out1: { to: "variable", variableId: "phase" } }, policy: "replace" }],
    resources: [],
    variables: [{ id: "phase", name: "phase", scope: "instance", persist: false, default: "start" }],
    ui: { root: { props: { title: "Phases" } }, content: [
      { type: "Button", props: { id: "go", label: "Go", events: [
        { trigger: "click", kind: "run", operationId: "main" },
        { trigger: "click", kind: "setVariable", key: "var:phase", value: "working" }
      ] } },
      { type: "Text", props: { id: "phase-text", binding: "var:phase" } }
    ], zones: {} }
  });
  const { report } = await run(target, [{ click: "go" }]);
  expect(report.interactions[0].error).toBeNull();
  expect(report.variables["phase"]).toBe("done");
});

it("app debug sends a variable an operation both reads and writes as it was before the run", async () => {
  const target = resolvedWorkflow(graph, {
    schemaVersion: 4,
    operations: [{
      id: "main", name: "Run", workflowId: "wf1",
      inputs: { in1: { from: "variable", variableId: "draft" } },
      outputs: { out1: { to: "variable", variableId: "draft" } },
      policy: "replace"
    }],
    resources: [],
    variables: [{ id: "draft", name: "draft", scope: "instance", persist: false, default: "first draft" }],
    ui: { root: { props: { title: "Rewrite" } }, content: [runButton], zones: {} }
  });
  const { report, runOnServer } = await run(target, [{ click: "Button-1" }]);
  expect(runOnServer.mock.calls[0][0].params).toMatchObject({ prompt: "first draft" });
  expect(report.variables["draft"]).toBe("done");
});
