/**
 * The build (PRD § 11.3, criterion 5; R6).
 *
 * What is asserted: the plan is replayed through the node tools in plan order,
 * each step's node carries its step id, the terminal stage is written as soon
 * as the nodes are down, and the test run only starts on a graph that both
 * validates *and* has nothing left unwired — because a graph with an output
 * fed by nothing validates and produces nothing, which is R6.
 */
import { act, renderHook } from "@testing-library/react";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
let graphValidation: { errors: string[] } = { errors: [] };
let runThrows: Error | null = null;
jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    call: jest.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "ui_get_graph") {
        return { validation: graphValidation };
      }
      if (name === "ui_run_workflow" && runThrows) {
        throw runThrows;
      }
      return { ok: true };
    })
  }
}));
jest.mock("../../../lib/tools/frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: () => ({})
}));

let settings: Record<string, unknown> = {};
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const metadata = {
  "nodetool.input.StringInput": {
    node_type: "nodetool.input.StringInput",
    properties: [{ name: "name", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "str" } }]
  },
  "nodetool.text.Template": {
    node_type: "nodetool.text.Template",
    inline_fields: ["string"],
    properties: [{ name: "string", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "str" } }]
  },
  "nodetool.output.Output": {
    node_type: "nodetool.output.Output",
    properties: [{ name: "value", type: { type: "any" } }],
    outputs: []
  }
};
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ metadata }),
    { getState: () => ({ metadata }) }
  )
}));

import { readWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { useBuildFromPlan } from "../useBuildFromPlan";
import type { BuildFromPlanResult } from "../useBuildFromPlan";

const PLAN: WorkflowSetupPlan = {
  inputs: [{ name: "text", type: "string", sample: "hello" }],
  steps: [
    {
      id: "compose",
      title: "Compose",
      summary: "lay it into the template",
      node_type: "nodetool.text.Template"
    }
  ],
  outputs: [{ name: "post", type: "string" }]
};

const build = async (
  plan: WorkflowSetupPlan = PLAN
): Promise<BuildFromPlanResult> => {
  const { result } = renderHook(() => useBuildFromPlan("w1"));
  // Named off the hook rather than inferred from the variable: TypeScript
  // narrows a `let` assigned only inside a callback to its initializer, which
  // made `NonNullable<typeof built>` resolve to `never`.
  let built: BuildFromPlanResult | undefined;
  await act(async () => {
    built = await result.current.buildFromPlan({
      plan,
      sampleInputs: { text: "hello" }
    });
  });
  if (!built) {
    throw new Error("buildFromPlan did not resolve");
  }
  return built;
};

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  settings = {};
  graphValidation = { errors: [] };
  runThrows = null;
});

describe("buildFromPlan", () => {
  it("places the nodes and then the edges, through the node tools", async () => {
    await build();
    expect(calls.map((call) => call.name)).toEqual([
      "ui_open_workflow",
      "ui_add_node",
      "ui_add_node",
      "ui_update_node_data",
      "ui_add_node",
      "ui_connect_nodes",
      "ui_connect_nodes",
      "ui_get_graph",
      "ui_run_workflow"
    ]);
  });

  it("carries the plan step id onto the node it placed (PRD § 11.5)", async () => {
    await build();
    const update = calls.find((call) => call.name === "ui_update_node_data");
    expect(update?.args).toMatchObject({
      node_id: "step_1",
      data: { setupStepId: "compose" }
    });
  });

  it("puts the input's sample on the node so a run has a value", async () => {
    await build();
    const input = calls.find(
      (call) =>
        call.name === "ui_add_node" &&
        call.args["type"] === "nodetool.input.StringInput"
    );
    expect(input?.args["properties"]).toEqual({
      name: "text",
      value: "hello"
    });
  });

  it("writes the terminal stage once the nodes are placed", async () => {
    await build();
    expect(readWorkflowSetup(settings)?.stage).toBe("done");
  });

  it("runs once with the sample inputs when the graph is clean", async () => {
    const result = await build();
    expect(result.testRun).toEqual({ started: true, error: null });
    const run = calls.find((call) => call.name === "ui_run_workflow");
    expect(run?.args["params"]).toEqual({ text: "hello" });
  });

  it("does not run a graph that failed validation, and reports the errors", async () => {
    graphValidation = { errors: ["Node x: required property missing"] };
    const result = await build();
    expect(result.validationErrors).toEqual([
      "Node x: required property missing"
    ]);
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.testRun.started).toBe(false);
  });

  // R6: the graph validates and would produce nothing. The build says so, and
  // does not report a green test run on it.
  it("does not run a graph that validates but left the output unwired", async () => {
    const result = await build({ ...PLAN, steps: [] });
    expect(result.validationErrors).toEqual([]);
    expect(result.issues.join(" ")).toContain("produces nothing");
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.testRun.started).toBe(false);
  });

  it("reports a refused run instead of throwing out of the build", async () => {
    runThrows = new Error("no worker available");
    const result = await build();
    expect(result.testRun).toEqual({
      started: false,
      error: "no worker available"
    });
    // The graph is still built and the stage still terminal — the creator lands
    // on the canvas with the reason, not back in the flow.
    expect(readWorkflowSetup(settings)?.stage).toBe("done");
  });
});
