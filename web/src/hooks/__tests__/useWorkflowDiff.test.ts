import { renderHook, act } from "@testing-library/react";
import { useWorkflowDiff } from "../useWorkflowDiff";
import type { WorkflowVersion } from "../../stores/VersionHistoryStore";

const mockOldVersion: WorkflowVersion = {
  id: "old-version",
  workflow_id: "workflow-1",
  version: 1,
  created_at: "2026-01-15T10:00:00Z",
  name: "Initial version",
  graph: {
    nodes: [
      { id: "node-1", type: "text", data: { text: "Hello" } },
      { id: "node-2", type: "llm", data: { model: "gpt-4" } },
      { id: "node-3", type: "output", data: { format: "text" } },
    ],
    edges: [
      { id: "edge-1", source: "node-1", target: "node-2" },
      { id: "edge-2", source: "node-2", target: "node-3" },
    ],
  },
};

const mockNewVersion: WorkflowVersion = {
  id: "new-version",
  workflow_id: "workflow-1",
  version: 2,
  created_at: "2026-01-16T10:00:00Z",
  name: "Updated version",
  graph: {
    nodes: [
      { id: "node-1", type: "text", data: { text: "Hello World" } },
      { id: "node-2", type: "llm", data: { model: "gpt-4-turbo" } },
      { id: "node-4", type: "image", data: { format: "png" } },
    ],
    edges: [
      { id: "edge-1", source: "node-1", target: "node-2" },
      { id: "edge-3", source: "node-2", target: "node-4" },
    ],
  },
};

describe("useWorkflowDiff", () => {
  it("returns empty diff when both versions are null", () => {
    const { result } = renderHook(() => useWorkflowDiff(null, null));

    expect(result.current).toEqual({
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      unchangedNodes: [],
      unchangedEdges: [],
    });
  });

  it("returns full new diff when old version is null", () => {
    const { result } = renderHook(() => useWorkflowDiff(null, mockNewVersion));

    expect(result.current.addedNodes).toHaveLength(3);
    expect(result.current.removedNodes).toHaveLength(0);
    expect(result.current.modifiedNodes).toHaveLength(0);
    expect(result.current.addedEdges).toHaveLength(2);
  });

  it("returns full old diff when new version is null", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, null));

    expect(result.current.addedNodes).toHaveLength(0);
    expect(result.current.removedNodes).toHaveLength(3);
    expect(result.current.modifiedNodes).toHaveLength(0);
    expect(result.current.removedEdges).toHaveLength(2);
  });

  it("correctly identifies added nodes", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    const addedNodeIds = result.current.addedNodes.map((n) => n.id);
    expect(addedNodeIds).toContain("node-4");
    expect(addedNodeIds).not.toContain("node-1");
    expect(addedNodeIds).not.toContain("node-2");
  });

  it("correctly identifies removed nodes", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    const removedNodeIds = result.current.removedNodes.map((n) => n.id);
    expect(removedNodeIds).toContain("node-3");
    expect(removedNodeIds).not.toContain("node-1");
    expect(removedNodeIds).not.toContain("node-2");
  });

  it("correctly identifies modified nodes", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    expect(result.current.modifiedNodes).toHaveLength(2);

    const modifiedNodeIds = result.current.modifiedNodes.map((n) => n.id);
    expect(modifiedNodeIds).toContain("node-1");
    expect(modifiedNodeIds).toContain("node-2");

    const node1Changes = result.current.modifiedNodes.find((n) => n.id === "node-1")?.changes;
    expect(node1Changes).toBeDefined();
    expect(node1Changes).toHaveLength(1);
    expect(node1Changes?.[0].field).toBe("data.text");
    expect(node1Changes?.[0].oldValue).toBe("Hello");
    expect(node1Changes?.[0].newValue).toBe("Hello World");

    const node2Changes = result.current.modifiedNodes.find((n) => n.id === "node-2")?.changes;
    expect(node2Changes).toBeDefined();
    expect(node2Changes).toHaveLength(1);
    expect(node2Changes?.[0].field).toBe("data.model");
    expect(node2Changes?.[0].oldValue).toBe("gpt-4");
    expect(node2Changes?.[0].newValue).toBe("gpt-4-turbo");
  });

  it("correctly identifies added edges", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    expect(result.current.addedEdges).toHaveLength(1);
    expect(result.current.addedEdges[0].id).toBe("edge-3");
    expect(result.current.addedEdges[0].source).toBe("node-2");
    expect(result.current.addedEdges[0].target).toBe("node-4");
  });

  it("correctly identifies removed edges", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    expect(result.current.removedEdges).toHaveLength(1);
    expect(result.current.removedEdges[0].id).toBe("edge-2");
    expect(result.current.removedEdges[0].source).toBe("node-2");
    expect(result.current.removedEdges[0].target).toBe("node-3");
  });

  it("correctly identifies unchanged nodes and edges", () => {
    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, mockNewVersion));

    expect(result.current.unchangedNodes).toHaveLength(0);
    expect(result.current.unchangedEdges).toHaveLength(1);
    expect(result.current.unchangedEdges[0]).toBe("edge-1");
  });

  it("handles versions with same nodes but different order", () => {
    const reorderedVersion: WorkflowVersion = {
      ...mockNewVersion,
      graph: {
        ...mockNewVersion.graph,
        nodes: [
          mockNewVersion.graph.nodes[1],
          mockNewVersion.graph.nodes[0],
          mockNewVersion.graph.nodes[2],
        ],
      },
    };

    const { result } = renderHook(() => useWorkflowDiff(mockOldVersion, reorderedVersion));

    expect(result.current.addedNodes).toHaveLength(1);
    expect(result.current.removedNodes).toHaveLength(1);
  });
});
