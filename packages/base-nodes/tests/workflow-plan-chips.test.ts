/**
 * Criterion 5: every shipped inspiration chip's plan builds a graph that passes
 * the same static check `validate_workflow` runs (PRD § 11.7).
 *
 * It lives here because it needs the real node registry, and this is the
 * package that has one. The chips name real base nodes; a chip whose node type
 * is renamed or dropped has to fail here rather than in front of a creator on
 * their first click.
 *
 * Validation is not the whole bar — a graph can validate and produce nothing
 * (R6). The app-build harness's `workflow-plan-to-graph` case runs a built
 * graph on the kernel and grades what came out; this suite covers the half that
 * can be checked for every chip with no provider.
 */

import { describe, expect, it } from "vitest";
import { NodeRegistry, validateGraph } from "@nodetool-ai/node-sdk";
import {
  WORKFLOW_INSPIRATION_CHIPS,
  planNodeShape,
  planToPlacement,
  resolveWorkflowPlan
} from "@nodetool-ai/protocol";
import { registerBaseNodes } from "../src/index.js";

const registry = new NodeRegistry();
registerBaseNodes(registry);

/** The models the setup step (PRD § 11.3) would have chosen for these roles. */
const MODELS = {
  language: {
    type: "language_model",
    provider: "ollama",
    id: "llama3.2:1b",
    name: "llama3.2:1b",
    path: null,
    supported_tasks: []
  },
  image: {
    type: "image_model",
    provider: "fake",
    id: "fake",
    name: "fake",
    path: null,
    supported_tasks: []
  }
};

const lookup = (nodeType: string) => {
  const meta = registry.getMetadata(nodeType);
  return meta ? planNodeShape(meta) : null;
};

const build = (plan: (typeof WORKFLOW_INSPIRATION_CHIPS)[number]["plan"]) => {
  const placement = planToPlacement(plan, lookup, { models: MODELS });
  const graph = {
    nodes: placement.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.properties,
      ui_properties: { position: node.position },
      dynamic_properties: node.dynamicProperties ?? {},
      dynamic_outputs: {}
    })),
    edges: placement.edges.map((edge, index) => ({ id: `e${index}`, ...edge }))
  };
  const report = validateGraph(graph, {
    has: (type: string) => registry.has(type),
    getMetadata: (type: string) => registry.getMetadata(type),
    validateNode: (
      descriptor: Parameters<typeof registry.validateNode>[0],
      handles: Parameters<typeof registry.validateNode>[1]
    ) => registry.validateNode(descriptor, handles)
  });
  return { placement, report };
};

describe("shipped inspiration chips", () => {
  it("ships the three chips step 1 offers", () => {
    expect(WORKFLOW_INSPIRATION_CHIPS.map((chip) => chip.brief)).toEqual([
      "Summarize a PDF and email it",
      "Batch-generate product shots from a CSV",
      "Turn a YouTube URL into a blog post"
    ]);
  });

  for (const chip of WORKFLOW_INSPIRATION_CHIPS) {
    it(`"${chip.brief}" names only node types the registry has`, () => {
      const resolved = resolveWorkflowPlan(chip.plan, {
        knownNodeType: (type) => registry.has(type),
        providerConfigured: () => true
      });
      expect(
        resolved.steps
          .filter((entry) => entry.unknownNodeType)
          .map((entry) => entry.step.node_type)
      ).toEqual([]);
      expect(resolved.canContinue).toBe(true);
    });

    it(`"${chip.brief}" builds a graph with nothing left unwired`, () => {
      expect(build(chip.plan).placement.issues).toEqual([]);
    });

    it(`"${chip.brief}" builds a graph that validates`, () => {
      const { report } = build(chip.plan);
      expect(
        report.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
      ).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it(`"${chip.brief}" feeds every output node from a step`, () => {
      const { placement } = build(chip.plan);
      // An output node with no incoming edge is the R6 shape exactly: the
      // graph validates and the run produces nothing.
      const fed = new Set(placement.edges.map((edge) => edge.target));
      for (const node of placement.nodes) {
        if (node.type !== "nodetool.output.Output") continue;
        expect(fed.has(node.id)).toBe(true);
      }
    });
  }

  it("blocks a plan whose step names a type the registry lost", () => {
    const chip = WORKFLOW_INSPIRATION_CHIPS[0];
    const resolved = resolveWorkflowPlan(
      {
        ...chip.plan,
        steps: chip.plan.steps.map((step) => ({
          ...step,
          node_type: "nodetool.renamed.Away"
        }))
      },
      {
        knownNodeType: (type) => registry.has(type),
        providerConfigured: () => true
      }
    );
    expect(resolved.canContinue).toBe(false);
  });

  it("leaves a model role no provider covers marked, not silently wired", () => {
    const resolved = resolveWorkflowPlan(WORKFLOW_INSPIRATION_CHIPS[0].plan, {
      knownNodeType: (type) => registry.has(type),
      providerConfigured: () => false
    });
    expect(resolved.missingRoles).toEqual(["language"]);
    expect(resolved.canContinue).toBe(false);
  });

  it("says so when a step needs a model and none was chosen", () => {
    const placement = planToPlacement(
      WORKFLOW_INSPIRATION_CHIPS[0].plan,
      lookup
    );
    expect(placement.issues.join(" ")).toContain("needs a language model");
  });
});
