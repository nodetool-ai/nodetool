/**
 * The four headless Workflow-flow capabilities (PRD § 11.6, criterion 6).
 *
 * Every § 11.7 criterion has to be reachable with no editor open, so this suite
 * drives the whole journey on a stored row: write the brief and the category,
 * store a plan, fix the step whose node type the registry does not have, build
 * the graph, and check what the row holds afterwards.
 *
 * Two rules carry the phase and both are asserted here:
 * `plan_workflow` places no node (criterion 3), and `build_workflow_from_plan`
 * refuses a plan that still names an unknown type (D23) and reports the wiring
 * it could not do rather than a graph that validates and produces nothing (R6).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import { readWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";

const METADATA: Record<string, unknown> = {
  "nodetool.input.StringInput": {
    node_type: "nodetool.input.StringInput",
    title: "String Input",
    description: "A string input",
    namespace: "nodetool.input",
    properties: [{ name: "name", type: { type: "str", type_args: [] } }],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }]
  },
  "nodetool.text.Template": {
    node_type: "nodetool.text.Template",
    title: "Template",
    description: "Format a string",
    namespace: "nodetool.text",
    inline_fields: ["string"],
    properties: [{ name: "string", type: { type: "str", type_args: [] } }],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }]
  },
  "nodetool.output.Output": {
    node_type: "nodetool.output.Output",
    title: "Output",
    description: "A workflow output",
    namespace: "nodetool.output",
    properties: [{ name: "value", type: { type: "any", type_args: [] } }],
    outputs: []
  }
};

const registry = {
  has: (type: string) => type in METADATA,
  getMetadata: (type: string) => METADATA[type],
  validateNode: () => []
} as unknown as NodeRegistry;

const context = { userId: "u1" } as unknown as ProcessingContext;

const run = () =>
  createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry });

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

const makeWorkflow = () =>
  Workflow.create<Workflow>({
    user_id: "u1",
    name: "W",
    description: "",
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  });

const reload = async (id: string) =>
  readWorkflowSetup(((await Workflow.get(id)) as Workflow | null)?.settings);

beforeEach(() => initTestDb());

describe("capability shape", () => {
  it("classifies all four as writes", () => {
    for (const name of [
      "set_workflow_setup",
      "plan_workflow",
      "update_workflow_plan_step",
      "build_workflow_from_plan"
    ]) {
      expect(capabilityCategoryFor(name)).toBe("write");
    }
  });
});

describe("set_workflow_setup", () => {
  it("writes the answers and leaves the rest of settings alone", async () => {
    const workflow = await makeWorkflow();
    await Workflow.updateFieldsIfUnchanged(workflow.id, workflow.updated_at, {
      settings: { hide_ui: true }
    });
    await run().invoke("set_workflow_setup", {
      workflow_id: workflow.id,
      brief: "Summarize a PDF and email it",
      category: "content-pipeline",
      run_mode: "app",
      stage: "category"
    });
    const stored = (await Workflow.get(workflow.id)) as Workflow;
    expect(stored.settings?.["hide_ui"]).toBe(true);
    expect(readWorkflowSetup(stored.settings)).toMatchObject({
      brief: "Summarize a PDF and email it",
      category: "content-pipeline",
      run_mode: "app",
      stage: "category"
    });
  });

  it("refuses a workflow that is not yours", async () => {
    const workflow = await makeWorkflow();
    const other = createCapabilityRun({
      context: { userId: "u2" } as unknown as ProcessingContext,
      gate: UNGATED,
      nodeRegistry: registry
    });
    const result = (await other.invoke("set_workflow_setup", {
      workflow_id: workflow.id,
      brief: "b"
    })) as { error?: string };
    expect(result.error).toContain("not yours");
  });

  it("refuses a call that sets nothing", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("set_workflow_setup", {
      workflow_id: workflow.id
    })) as { error?: string };
    expect(result.error).toContain("Nothing to set");
  });
});

describe("plan_workflow", () => {
  // Criterion 3: the plan is text, and no node is placed.
  it("stores a supplied plan, moves to review, and places no node", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    })) as { nodes_placed: number; review: { can_continue: boolean } };
    expect(result.nodes_placed).toBe(0);
    expect(result.review.can_continue).toBe(true);
    expect((await reload(workflow.id))?.stage).toBe("review");
    const stored = (await Workflow.get(workflow.id)) as Workflow;
    expect(stored.getGraph().nodes).toEqual([]);
  });

  it("marks a step whose node type the registry does not have", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], node_type: "nodetool.made.Up" }]
      }
    })) as {
      review: { can_continue: boolean; steps: { unknown_node_type: boolean }[] };
    };
    expect(result.review.steps[0].unknown_node_type).toBe(true);
    expect(result.review.can_continue).toBe(false);
  });

  it("refuses to plan a workflow with no brief and no supplied plan", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      provider: "p",
      model: "m"
    })) as { error?: string };
    expect(result.error).toContain("no brief");
  });
});

describe("update_workflow_plan_step", () => {
  it("replaces an unknown node type, then the review clears", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], node_type: "nodetool.made.Up" }]
      }
    });
    const result = (await run().invoke("update_workflow_plan_step", {
      workflow_id: workflow.id,
      step_id: "compose",
      node_type: "nodetool.text.Template"
    })) as { review: { can_continue: boolean } };
    expect(result.review.can_continue).toBe(true);
  });

  it("adds, moves and removes steps", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    });
    await run().invoke("update_workflow_plan_step", {
      workflow_id: workflow.id,
      op: "add",
      step_id: "second",
      title: "Second",
      node_type: "nodetool.text.Template"
    });
    await run().invoke("update_workflow_plan_step", {
      workflow_id: workflow.id,
      op: "move",
      step_id: "second",
      index: 0
    });
    expect(
      (await reload(workflow.id))?.plan?.steps.map((step) => step.id)
    ).toEqual(["second", "compose"]);

    await run().invoke("update_workflow_plan_step", {
      workflow_id: workflow.id,
      op: "remove",
      step_id: "compose"
    });
    expect(
      (await reload(workflow.id))?.plan?.steps.map((step) => step.id)
    ).toEqual(["second"]);
  });

  it("names the step ids when the one asked for is not there", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    });
    const result = (await run().invoke("update_workflow_plan_step", {
      workflow_id: workflow.id,
      step_id: "nope",
      title: "x"
    })) as { error?: string };
    expect(result.error).toContain("compose");
  });
});

describe("build_workflow_from_plan", () => {
  // D23: an unknown type blocks the build, not the review.
  it("refuses a plan that still names a type the registry does not have", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], node_type: "nodetool.made.Up" }]
      }
    });
    const result = (await run().invoke("build_workflow_from_plan", {
      workflow_id: workflow.id
    })) as { error?: string };
    expect(result.error).toContain("nodetool.made.Up");
    const stored = (await Workflow.get(workflow.id)) as Workflow;
    expect(stored.getGraph().nodes).toEqual([]);
  });

  it("builds the chain, validates it, and writes the terminal stage", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    });
    const result = (await run().invoke("build_workflow_from_plan", {
      workflow_id: workflow.id
    })) as {
      saved: boolean;
      issues: string[];
      sample_inputs: Record<string, unknown>;
      graph: { nodes: { id: string }[]; edges: unknown[] };
      validation: { ok?: boolean };
    };
    expect(result.saved).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.sample_inputs).toEqual({ text: "hello" });
    expect(result.graph.nodes.map((node) => node.id)).toEqual([
      "input_1",
      "step_1",
      "output_1"
    ]);
    expect(result.graph.edges).toHaveLength(2);
    expect(result.validation.ok).toBe(true);
    expect((await reload(workflow.id))?.stage).toBe("done");
  });

  it("carries the plan step id onto the node it placed (PRD § 11.5)", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    });
    await run().invoke("build_workflow_from_plan", { workflow_id: workflow.id });
    const stored = (await Workflow.get(workflow.id)) as Workflow;
    const step = stored
      .getGraph()
      .nodes.find((node) => (node as { id: string }).id === "step_1") as {
      ui_properties?: { setup_step_id?: string };
    };
    expect(step.ui_properties?.setup_step_id).toBe("compose");
  });

  // R6: the graph validates and would produce nothing. The build says so.
  it("reports an output with no step upstream rather than calling it done", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: { ...PLAN, steps: [] }
    });
    const result = (await run().invoke("build_workflow_from_plan", {
      workflow_id: workflow.id
    })) as { issues: string[]; validation: { ok?: boolean } };
    expect(result.validation.ok).toBe(true);
    expect(result.issues.join(" ")).toContain("produces nothing");
  });

  it("builds without saving when asked", async () => {
    const workflow = await makeWorkflow();
    await run().invoke("plan_workflow", {
      workflow_id: workflow.id,
      plan: PLAN
    });
    const result = (await run().invoke("build_workflow_from_plan", {
      workflow_id: workflow.id,
      save: false
    })) as { saved: boolean };
    expect(result.saved).toBe(false);
    const stored = (await Workflow.get(workflow.id)) as Workflow;
    expect(stored.getGraph().nodes).toEqual([]);
  });

  it("refuses to build before a plan exists", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("build_workflow_from_plan", {
      workflow_id: workflow.id
    })) as { error?: string };
    expect(result.error).toContain("no plan");
  });
});
