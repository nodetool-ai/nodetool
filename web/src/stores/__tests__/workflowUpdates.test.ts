import { hashKey } from "../ResultsStore";

describe("workflowUpdates - hashKey utility", () => {
  describe("hashKey", () => {
    it("creates correct hash key for workflow and node", () => {
      expect(hashKey("workflow-1", "node-1")).toBe("workflow-1:node-1");
    });

    it("creates hash key with special characters", () => {
      expect(hashKey("wf-123", "node_abc")).toBe("wf-123:node_abc");
    });

    it("handles empty workflow id", () => {
      expect(hashKey("", "node-1")).toBe(":node-1");
    });

    it("handles empty node id", () => {
      expect(hashKey("workflow-1", "")).toBe("workflow-1:");
    });

    it("creates unique keys for different combinations", () => {
      const key1 = hashKey("wf-a", "node-1");
      const key2 = hashKey("wf-b", "node-1");
      const key3 = hashKey("wf-a", "node-2");
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });
});

describe("WorkflowAttributes type", () => {
  it("accepts valid workflow attributes", () => {
    const workflow = {
      id: "workflow-1",
      name: "Test Workflow",
      nodes: [],
      edges: []
    };

    expect(workflow.id).toBe("workflow-1");
    expect(workflow.name).toBe("Test Workflow");
    expect(workflow.nodes).toEqual([]);
    expect(workflow.edges).toEqual([]);
  });
});
