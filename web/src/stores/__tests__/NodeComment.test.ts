import { createNodeStore } from "../NodeStore";
import { Workflow } from "../ApiTypes";
import { uuidv4 } from "../uuidv4";

describe("addNodeComment frontend tool", () => {
  let store: ReturnType<typeof createNodeStore>;
  let workflowId: string;
  let nodeId: string;

  beforeEach(() => {
    workflowId = uuidv4();
    const workflow = {
      id: workflowId,
      name: "Test Workflow",
      access: "private" as const,
      description: "",
      thumbnail: "",
      tags: [],
      settings: {},
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      graph: {
        nodes: [],
        edges: []
      }
    };
    store = createNodeStore(workflow);

    nodeId = store.getState().generateNodeId();
    store.getState().addNode({
      id: nodeId,
      type: "nodetool.input.StringInput",
      position: { x: 100, y: 100 },
      parentId: "",
      selected: false,
      dragHandle: "",
      expandParent: true,
      style: { width: 200, height: undefined },
      zIndex: 0,
      data: {
        properties: {},
        dynamic_properties: {},
        dynamic_outputs: {},
        sync_mode: "on_any",
        workflow_id: workflowId,
        selectable: true
      }
    });
  });

  afterEach(() => {
    store.destroy();
  });

  it("should add a comment to a node", () => {
    const commentText = "This is a test comment";

    store.getState().updateNodeData(nodeId, {
      comment: commentText
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBe(commentText);
  });

  it("should update an existing comment", () => {
    const initialComment = "Initial comment";
    const updatedComment = "Updated comment";

    store.getState().updateNodeData(nodeId, {
      comment: initialComment
    });

    store.getState().updateNodeData(nodeId, {
      comment: updatedComment
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBe(updatedComment);
  });

  it("should remove comment when set to empty string", () => {
    const commentText = "Test comment";

    store.getState().updateNodeData(nodeId, {
      comment: commentText
    });

    store.getState().updateNodeData(nodeId, {
      comment: ""
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBeUndefined();
  });

  it("should remove comment when set to whitespace only", () => {
    const commentText = "Test comment";

    store.getState().updateNodeData(nodeId, {
      comment: commentText
    });

    store.getState().updateNodeData(nodeId, {
      comment: "   "
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBeUndefined();
  });

  it("should handle long comments", () => {
    const longComment = "This is a very long comment that exceeds typical length limits but should still be handled correctly by the system";

    store.getState().updateNodeData(nodeId, {
      comment: longComment
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBe(longComment);
  });

  it("should handle special characters in comments", () => {
    const specialComment = "Test <script>alert('xss')</script> & special chars \"quotes\" 'single'";

    store.getState().updateNodeData(nodeId, {
      comment: specialComment
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBe(specialComment);
  });

  it("should handle multiline comments", () => {
    const multilineComment = "Line 1\nLine 2\nLine 3";

    store.getState().updateNodeData(nodeId, {
      comment: multilineComment
    });

    const node = store.getState().findNode(nodeId);
    expect(node?.data.comment).toBe(multilineComment);
  });
});
