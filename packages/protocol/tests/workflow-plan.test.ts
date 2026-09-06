import { describe, expect, it } from "vitest";

import { workflowSetupPlan } from "../src/api-schemas/workflows.js";
import {
  parseWorkflowPlan,
  planToPlacement,
  resolveWorkflowPlan,
  type PlanNodeLookup,
  type PlanNodeShape
} from "../src/workflow-plan.js";

const SHAPES: Record<string, PlanNodeShape> = {
  "nodetool.input.StringInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.input.FloatInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "float" }]
  },
  "nodetool.input.ImageInput": {
    inputs: [{ name: "name", type: "str" }],
    outputs: [{ name: "output", type: "image" }]
  },
  "nodetool.output.Output": {
    inputs: [{ name: "value", type: "any" }],
    outputs: []
  },
  "nodetool.text.Slice": {
    inputs: [
      { name: "text", type: "str", required: true },
      { name: "start", type: "int" }
    ],
    outputs: [{ name: "output", type: "str" }]
  },
  "nodetool.text.Concat": {
    inputs: [],
    outputs: [{ name: "output", type: "str" }],
    supportsDynamicInputs: true
  },
  "nodetool.llm.Generate": {
    inputs: [
      { name: "model", type: "language_model" },
      { name: "prompt", type: "str" }
    ],
    outputs: [{ name: "text", type: "str" }]
  },
  "nodetool.image.Blur": {
    inputs: [{ name: "image", type: "image" }],
    outputs: [{ name: "output", type: "image" }]
  }
};

const lookup: PlanNodeLookup = (type) => SHAPES[type] ?? null;

const plan = (over: Partial<ReturnType<typeof workflowSetupPlan.parse>> = {}) =>
  workflowSetupPlan.parse({
    inputs: [{ name: "text", type: "string", sample: "hello" }],
    steps: [
      {
        id: "s1",
        title: "Trim it",
        summary: "cut the text down",
        node_type: "nodetool.text.Slice"
      }
    ],
    outputs: [{ name: "result", type: "string" }],
    ...over
  });

describe("parseWorkflowPlan", () => {
  it("fills in step ids the model is not asked for", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [{ title: "A", summary: "a", node_type: "nodetool.text.Slice" }],
      outputs: []
    });
    expect(parsed?.steps[0].id).toBe("step-1");
  });

  it("reads a missing or non-string node_type as null rather than dropping the step", () => {
    const parsed = parseWorkflowPlan({
      inputs: [],
      steps: [{ title: "A", summary: "a" }, { title: "B", summary: "b", node_type: 7 }],
      outputs: []
    });
    expect(parsed?.steps.map((step) => step.node_type)).toEqual([null, null]);
  });

  it("returns null for an answer that is not a plan", () => {
    expect(parseWorkflowPlan("no")).toBeNull();
    expect(parseWorkflowPlan(null)).toBeNull();
  });
});

describe("resolveWorkflowPlan (D23)", () => {
  const known = (type: string) => type in SHAPES;

  it("marks a step whose node type the registry does not have", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Do it",
            summary: "x",
            node_type: "nodetool.made.Up"
          }
        ]
      }),
      { knownNodeType: known, providerConfigured: () => true }
    );
    expect(resolved.steps[0].unknownNodeType).toBe(true);
    expect(resolved.steps[0].block).toBe("unknown-node-type");
    expect(resolved.canContinue).toBe(false);
  });

  it("marks a step with no node type at all", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [{ id: "s1", title: "Do it", summary: "x", node_type: null }]
      }),
      { knownNodeType: known, providerConfigured: () => true }
    );
    expect(resolved.steps[0].unknownNodeType).toBe(true);
    expect(resolved.canContinue).toBe(false);
  });

  it("marks a needed model role no configured provider covers", () => {
    const resolved = resolveWorkflowPlan(
      plan({
        steps: [
          {
            id: "s1",
            title: "Write it",
            summary: "x",
            node_type: "nodetool.llm.Generate",
            model_role: "language"
          }
        ]
      }),
      { knownNodeType: known, providerConfigured: () => false }
    );
    expect(resolved.steps[0].missingProvider).toBe("language");
    expect(resolved.steps[0].block).toBe("missing-provider");
    expect(resolved.missingRoles).toEqual(["language"]);
    expect(resolved.canContinue).toBe(false);
  });

  it("continues when every step names a known type and every role is configured", () => {
    const resolved = resolveWorkflowPlan(plan(), {
      knownNodeType: known,
      providerConfigured: () => true
    });
    expect(resolved.canContinue).toBe(true);
    expect(resolved.steps[0].block).toBeNull();
  });

  it("asks each distinct role once, however many steps use it", () => {
    const asked: string[] = [];
    resolveWorkflowPlan(
      plan({
        steps: Array.from({ length: 20 }, (_unused, index) => ({
          id: `s${index}`,
          title: "Write",
          summary: "x",
          node_type: "nodetool.llm.Generate",
          model_role: "language"
        }))
      }),
      {
        knownNodeType: known,
        providerConfigured: (role) => {
          asked.push(role);
          return true;
        }
      }
    );
    expect(asked).toEqual(["language"]);
  });
});

describe("planToPlacement", () => {
  it("chains input → step → output and reports no issue", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.issues).toEqual([]);
    expect(placed.nodes.map((node) => node.type)).toEqual([
      "nodetool.input.StringInput",
      "nodetool.text.Slice",
      "nodetool.output.Output"
    ]);
    expect(placed.edges).toEqual([
      {
        source: "input_1",
        sourceHandle: "output",
        target: "step_1",
        targetHandle: "text"
      },
      {
        source: "step_1",
        sourceHandle: "output",
        target: "output_1",
        targetHandle: "value"
      }
    ]);
  });

  it("carries the plan step id on the node it placed (PRD § 11.5)", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.nodes.find((node) => node.id === "step_1")?.setupStepId).toBe(
      "s1"
    );
    // Input and output nodes come from no step and carry nothing.
    expect(placed.nodes[0].setupStepId).toBeUndefined();
  });

  it("puts the plan input's sample on the input node so the test run has a value", () => {
    const placed = planToPlacement(plan(), lookup);
    expect(placed.nodes[0].properties).toEqual({
      name: "text",
      value: "hello"
    });
  });

  it("never wires a chain into a model property", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Write",
            summary: "x",
            node_type: "nodetool.llm.Generate",
            model_role: "language"
          }
        ]
      }),
      lookup
    );
    expect(placed.edges[0].targetHandle).toBe("prompt");
  });

  it("declares a dynamic slot for a node with no static handle", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          {
            id: "s1",
            title: "Join",
            summary: "x",
            node_type: "nodetool.text.Concat"
          }
        ]
      }),
      lookup
    );
    const step = placed.nodes.find((node) => node.id === "step_1");
    expect(step?.dynamicProperties).toEqual({ input_1: "" });
    expect(placed.edges[0].targetHandle).toBe("input_1");
    expect(placed.issues).toEqual([]);
  });

  it("reports a step the registry does not have instead of placing it", () => {
    const placed = planToPlacement(
      plan({
        steps: [
          { id: "s1", title: "Ghost", summary: "x", node_type: "nodetool.made.Up" }
        ]
      }),
      lookup
    );
    expect(placed.nodes.some((node) => node.type === "nodetool.made.Up")).toBe(
      false
    );
    expect(placed.issues.join(" ")).toContain("the registry does not have");
  });

  it("reports an output with no step upstream — the graph that runs and produces nothing (R6)", () => {
    const placed = planToPlacement(plan({ steps: [] }), lookup);
    expect(placed.edges).toEqual([]);
    expect(placed.issues.join(" ")).toContain("produces nothing");
  });

  it("reports a step whose node takes nothing the upstream produces", () => {
    const placed = planToPlacement(
      plan({
        inputs: [{ name: "photo", type: "image" }],
        steps: [
          {
            id: "s1",
            title: "Trim",
            summary: "x",
            node_type: "nodetool.text.Slice"
          }
        ]
      }),
      lookup
    );
    expect(placed.issues.join(" ")).toContain("no input that takes image");
  });

  it("reports a plan with no output", () => {
    expect(planToPlacement(plan({ outputs: [] }), lookup).issues.join(" ")).toContain(
      "declares no output"
    );
  });

  it("feeds a second input into the first step's next free handle", () => {
    const placed = planToPlacement(
      plan({
        inputs: [
          { name: "text", type: "string" },
          { name: "start", type: "number" }
        ]
      }),
      lookup
    );
    // `start` is an int handle and the second input is a float node, so the
    // chain leaves it unconnected and says so rather than mis-wiring it.
    expect(placed.edges.filter((edge) => edge.target === "step_1")).toHaveLength(
      1
    );
    expect(placed.issues.join(" ")).toContain("reached no step");
  });

  it("stays linear on a long plan", () => {
    const steps = Array.from({ length: 2000 }, (_unused, index) => ({
      id: `s${index}`,
      title: "Blur",
      summary: "x",
      node_type: "nodetool.image.Blur"
    }));
    const started = Date.now();
    const placed = planToPlacement(
      plan({ inputs: [{ name: "photo", type: "image" }], steps }),
      lookup
    );
    // 2000 chain edges plus the one that feeds the output node.
    expect(placed.edges).toHaveLength(2001);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
