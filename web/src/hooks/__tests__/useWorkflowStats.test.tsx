/**
 * Tests for useWorkflowStats hook types and exports
 */

import type { WorkflowStats, NodeTypeStats } from "../useWorkflowStats";

describe("useWorkflowStats types", () => {
  it("should export WorkflowStats interface", () => {
    // This test verifies the type exists and has the correct properties
    const stats: WorkflowStats = {
      nodeCount: 0,
      edgeCount: 0,
      inputNodeCount: 0,
      outputNodeCount: 0,
      groupNodeCount: 0,
      commentNodeCount: 0,
      processingNodeCount: 0,
      constantNodeCount: 0,
      nodeTypeDistribution: [],
      selectedNodeCount: 0
    };

    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.inputNodeCount).toBe(0);
    expect(stats.outputNodeCount).toBe(0);
    expect(stats.groupNodeCount).toBe(0);
    expect(stats.commentNodeCount).toBe(0);
    expect(stats.processingNodeCount).toBe(0);
    expect(stats.constantNodeCount).toBe(0);
    expect(stats.selectedNodeCount).toBe(0);
    expect(Array.isArray(stats.nodeTypeDistribution)).toBe(true);
  });

  it("should export NodeTypeStats interface", () => {
    // This test verifies the type exists and has the correct properties
    const nodeType: NodeTypeStats = {
      type: "test_type",
      count: 1,
      category: "Test"
    };

    expect(nodeType.type).toBe("test_type");
    expect(nodeType.count).toBe(1);
    expect(nodeType.category).toBe("Test");
  });

  it("should allow node type distribution array", () => {
    // This test verifies that nodeTypeDistribution is an array of NodeTypeStats
    const distribution: NodeTypeStats[] = [
      { type: "nodetool.input.StringInput", count: 2, category: "Input" },
      { type: "nodetool.processing.TextProcessor", count: 3, category: "Processing" }
    ];

    expect(distribution.length).toBe(2);
    expect(distribution[0].category).toBe("Input");
    expect(distribution[1].category).toBe("Processing");
  });
});
