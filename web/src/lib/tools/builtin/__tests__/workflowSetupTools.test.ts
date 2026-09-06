/**
 * @jest-environment jsdom
 *
 * The `ui_workflow_*` tools (PRD § 11.6, criterion 6).
 *
 * Every § 11.7 criterion has to be reachable through these four as well as
 * through the flow, so this suite drives the same journey headlessly: write the
 * brief and the category, store a plan, fix the step whose node type the
 * registry does not have, build the graph, and see the step id land on the
 * node.
 */
import { z } from "zod";

import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import {
  readWorkflowSetup,
  writeWorkflowSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import useMetadataStore from "../../../../stores/MetadataStore";
import type { NodeMetadata } from "../../../../stores/ApiTypes";
import "../workflowSetup";

const WORKFLOW = "w1";

const METADATA = {
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
} as unknown as Record<string, NodeMetadata>;

let settings: Record<string, unknown> = {};
const nodeToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const saveWorkflow = jest.fn(async () => {});

/** The node tools the build replays through, recorded rather than executed. */
const recordNodeTool = (name: `ui_${string}`) =>
  FrontendToolRegistry.register({
    name,
    description: name,
    parameters: z.object({}).passthrough(),
    async execute(args) {
      nodeToolCalls.push({ name, args: args as Record<string, unknown> });
      return { ok: true };
    }
  });

const state = (): FrontendToolState =>
  ({
    nodeMetadata: METADATA,
    currentWorkflowId: WORKFLOW,
    getWorkflow: () => ({
      id: WORKFLOW,
      name: "W",
      settings,
      graph: null
    }),
    getNodeStore: () => undefined,
    updateWorkflow: (workflow: { settings: unknown }) => {
      settings = workflow.settings as Record<string, unknown>;
    },
    saveWorkflow
  }) as unknown as FrontendToolState;

let seq = 0;
const call = (name: string, args: Record<string, unknown> = {}) =>
  FrontendToolRegistry.call(name, args, `t${++seq}`, { getState: state });

const PLAN = {
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

let unregister: Array<() => boolean> = [];

beforeEach(() => {
  settings = {};
  nodeToolCalls.length = 0;
  saveWorkflow.mockClear();
  useMetadataStore.setState({ metadata: METADATA });
  unregister = [
    recordNodeTool("ui_add_node"),
    recordNodeTool("ui_update_node_data"),
    recordNodeTool("ui_connect_nodes")
  ];
});

afterEach(() => {
  for (const remove of unregister) {
    remove();
  }
});

describe("ui_workflow_set_setup", () => {
  it("writes the brief, category, run mode and stage, and persists them", async () => {
    await call("ui_workflow_set_setup", {
      brief: "Summarize a PDF and email it",
      category: "content-pipeline",
      run_mode: "app",
      stage: "category"
    });
    expect(readWorkflowSetup(settings)).toMatchObject({
      brief: "Summarize a PDF and email it",
      category: "content-pipeline",
      run_mode: "app",
      stage: "category"
    });
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
  });

  it("leaves the rest of settings alone", async () => {
    settings = { hide_ui: true };
    await call("ui_workflow_set_setup", { brief: "b" });
    expect(settings["hide_ui"]).toBe(true);
  });

  it("refuses a call that sets nothing", async () => {
    await expect(call("ui_workflow_set_setup", {})).rejects.toThrow(
      "Nothing to set"
    );
  });
});

describe("ui_workflow_plan", () => {
  // Criterion 3, headlessly.
  it("stores the plan, moves the stage to review, and places no node", async () => {
    const result = (await call("ui_workflow_plan", { plan: PLAN })) as {
      nodes_placed: number;
    };
    expect(readWorkflowSetup(settings)?.stage).toBe("review");
    expect(result.nodes_placed).toBe(0);
    expect(nodeToolCalls).toEqual([]);
  });

  it("fills in a step id the caller did not give", async () => {
    await call("ui_workflow_plan", {
      plan: {
        ...PLAN,
        steps: [{ title: "A", summary: "a", node_type: null }]
      }
    });
    expect(readWorkflowSetup(settings)?.plan?.steps[0].id).toBe("step-1");
  });

  it("marks a step whose node type this install does not have", async () => {
    const result = (await call("ui_workflow_plan", {
      plan: {
        ...PLAN,
        steps: [
          { id: "s1", title: "A", summary: "a", node_type: "nodetool.made.Up" }
        ]
      }
    })) as { review: { can_continue: boolean; steps: { unknown_node_type: boolean }[] } };
    expect(result.review.steps[0].unknown_node_type).toBe(true);
    expect(result.review.can_continue).toBe(false);
  });
});

describe("ui_workflow_update_plan_step", () => {
  beforeEach(async () => {
    await call("ui_workflow_plan", { plan: PLAN });
  });

  it("replaces a node type the registry does not have", async () => {
    await call("ui_workflow_update_plan_step", {
      step_id: "compose",
      node_type: "nodetool.input.StringInput"
    });
    expect(readWorkflowSetup(settings)?.plan?.steps[0].node_type).toBe(
      "nodetool.input.StringInput"
    );
  });

  it("adds, moves and removes steps", async () => {
    await call("ui_workflow_update_plan_step", {
      op: "add",
      step_id: "second",
      title: "Second",
      node_type: "nodetool.text.Template"
    });
    await call("ui_workflow_update_plan_step", {
      op: "move",
      step_id: "second",
      index: 0
    });
    expect(
      readWorkflowSetup(settings)?.plan?.steps.map((step) => step.id)
    ).toEqual(["second", "compose"]);

    await call("ui_workflow_update_plan_step", {
      op: "remove",
      step_id: "compose"
    });
    expect(
      readWorkflowSetup(settings)?.plan?.steps.map((step) => step.id)
    ).toEqual(["second"]);
  });

  it("names the step ids when the one asked for is not there", async () => {
    await expect(
      call("ui_workflow_update_plan_step", { step_id: "nope", title: "x" })
    ).rejects.toThrow("compose");
  });
});

describe("ui_workflow_build_from_plan", () => {
  it("refuses a plan that still names a type the registry does not have (D23)", async () => {
    await call("ui_workflow_plan", {
      plan: {
        ...PLAN,
        steps: [
          { id: "s1", title: "A", summary: "a", node_type: "nodetool.made.Up" }
        ]
      }
    });
    await expect(call("ui_workflow_build_from_plan", {})).rejects.toThrow(
      "nodetool.made.Up"
    );
    expect(nodeToolCalls).toEqual([]);
  });

  it("places the plan through the node tools and writes the terminal stage", async () => {
    await call("ui_workflow_plan", { plan: PLAN });
    const result = (await call("ui_workflow_build_from_plan", {})) as {
      nodes_placed: number;
      edges_placed: number;
      issues: string[];
      sample_inputs: Record<string, unknown>;
    };
    expect(result.nodes_placed).toBe(3);
    expect(result.edges_placed).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.sample_inputs).toEqual({ text: "hello" });
    expect(readWorkflowSetup(settings)?.stage).toBe("done");
    expect(nodeToolCalls.map((entry) => entry.name)).toEqual([
      "ui_add_node",
      "ui_add_node",
      "ui_update_node_data",
      "ui_add_node",
      "ui_connect_nodes",
      "ui_connect_nodes"
    ]);
  });

  it("carries the plan step id onto the node it placed", async () => {
    await call("ui_workflow_plan", { plan: PLAN });
    await call("ui_workflow_build_from_plan", {});
    const update = nodeToolCalls.find(
      (entry) => entry.name === "ui_update_node_data"
    );
    expect(update?.args).toMatchObject({
      node_id: "step_1",
      data: { setupStepId: "compose" }
    });
  });

  // R6: the build reports the wiring it could not do rather than reporting a
  // graph that validates and produces nothing as done.
  it("reports an output with no step upstream", async () => {
    await call("ui_workflow_plan", { plan: { ...PLAN, steps: [] } });
    const result = (await call("ui_workflow_build_from_plan", {})) as {
      issues: string[];
    };
    expect(result.issues.join(" ")).toContain("produces nothing");
  });

  it("refuses to build before a plan exists", async () => {
    await expect(call("ui_workflow_build_from_plan", {})).rejects.toThrow(
      "has no plan"
    );
  });
});
