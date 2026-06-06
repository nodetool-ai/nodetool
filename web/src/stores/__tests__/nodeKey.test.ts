import { nodeKey, edgeKey } from "../nodeKey";

describe("nodeKey", () => {
  it("joins workflowId, jobId and nodeId with colons", () => {
    expect(nodeKey("wf-1", "job-1", "node-1")).toBe("wf-1:job-1:node-1");
    expect(nodeKey("workflow-123", "job-9", "node-abc")).toBe(
      "workflow-123:job-9:node-abc"
    );
  });

  it("handles empty strings", () => {
    expect(nodeKey("", "", "")).toBe("::");
  });
});

describe("edgeKey", () => {
  it("joins workflowId, jobId and edgeId with colons", () => {
    expect(edgeKey("wf-1", "job-1", "edge-1")).toBe("wf-1:job-1:edge-1");
    expect(edgeKey("workflow-123", "job-9", "edge-abc")).toBe(
      "workflow-123:job-9:edge-abc"
    );
  });
});
