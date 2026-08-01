import { describe, it, expect } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { getNodeMetadata } from "../src/node-metadata.js";
import { NodeRegistry, hydrateGraphNodeFlags } from "../src/registry.js";

/** Deterministic in-process transform — the category PR 1 opts in. */
class PureTransformNode extends BaseNode {
  static readonly nodeType = "test.retrySafe.PureTransform";
  static readonly retrySafe = true;
  static readonly title = "Pure Transform";
  static readonly description = "";

  async process() {
    return { output: "ok" };
  }
}

/** No opt-in: the default, and what every unclassified node gets. */
class UnclassifiedNode extends BaseNode {
  static readonly nodeType = "test.retrySafe.Unclassified";
  static readonly title = "Unclassified";
  static readonly description = "";

  async process() {
    return { output: "ok" };
  }
}

/**
 * Stands in for WorkflowNode/SubgraphNode: the inner graph can contain
 * anything, so retrying it can replay arbitrary side effects.
 */
class InnerGraphNode extends BaseNode {
  static readonly nodeType = "test.retrySafe.InnerGraph";
  static readonly title = "Inner Graph";
  static readonly description = "";

  async process() {
    return { output: null };
  }
}

describe("retrySafe", () => {
  it("defaults to false on BaseNode", () => {
    expect(BaseNode.retrySafe).toBe(false);
    expect(UnclassifiedNode.retrySafe).toBe(false);
  });

  it("surfaces retry_safe: true through getNodeMetadata for a declaring node", () => {
    expect(getNodeMetadata(PureTransformNode).retry_safe).toBe(true);
  });

  it("omits retry_safe from metadata for a node that does not declare it", () => {
    expect(getNodeMetadata(UnclassifiedNode).retry_safe).toBeUndefined();
    expect(getNodeMetadata(InnerGraphNode).retry_safe).toBeUndefined();
  });

  it("stamps retry_safe on the descriptor a declaring node produces", () => {
    expect(PureTransformNode.toDescriptor("n1").retry_safe).toBe(true);
  });

  it("leaves retry_safe off the descriptor of an inner-graph node", () => {
    expect(InnerGraphNode.toDescriptor("n2").retry_safe).toBeUndefined();
  });

  it("hydrates graph nodes from the registry, not from saved JSON", () => {
    const registry = new NodeRegistry();
    registry.register(PureTransformNode);
    registry.register(InnerGraphNode);

    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          { id: "a", type: PureTransformNode.nodeType },
          // A stale saved `true` must not survive: the class is authoritative.
          { id: "b", type: InnerGraphNode.nodeType, retry_safe: true }
        ],
        edges: []
      },
      registry
    );

    expect(hydrated.nodes[0].retry_safe).toBe(true);
    expect(hydrated.nodes[1].retry_safe).toBe(false);
  });
});
