import { createNodeStore } from "../NodeStore";
import { Workflow } from "../ApiTypes";

describe("toggleCommentSelected", () => {
  let store: ReturnType<typeof createNodeStore>;
  let workflow: Workflow;

  beforeEach(() => {
    workflow = {
      id: "test-workflow",
      name: "Test Workflow",
      access: "private",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      description: "Test description",
      graph: {
        nodes: [],
        edges: []
      }
    };
    store = createNodeStore(workflow);
  });

  afterEach(() => {
    store.destroy();
  });

  it("adds empty comment to all selected nodes when none have comments", () => {
    store.getState().addNode({
      id: "node1",
      type: "test",
      position: { x: 0, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);
    store.getState().addNode({
      id: "node2",
      type: "test",
      position: { x: 100, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);

    store.getState().toggleCommentSelected();

    const nodes = store.getState().nodes;
    expect(nodes[0].data.comment).toBe("");
    expect(nodes[1].data.comment).toBe("");
  });

  it("removes comments from all selected nodes when majority have comments", () => {
    store.getState().addNode({
      id: "node1",
      type: "test",
      position: { x: 0, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow", comment: "comment1" }
    } as any);
    store.getState().addNode({
      id: "node2",
      type: "test",
      position: { x: 100, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow", comment: "comment2" }
    } as any);

    store.getState().toggleCommentSelected();

    const nodes = store.getState().nodes;
    expect(nodes[0].data.comment).toBeUndefined();
    expect(nodes[1].data.comment).toBeUndefined();
  });

  it("does nothing when no nodes are selected", () => {
    store.getState().addNode({
      id: "node1",
      type: "test",
      position: { x: 0, y: 0 },
      selected: false,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);

    store.getState().toggleCommentSelected();

    const nodes = store.getState().nodes;
    expect(nodes[0].data.comment).toBeUndefined();
  });

  it("adds comments when exactly half have comments", () => {
    store.getState().addNode({
      id: "node1",
      type: "test",
      position: { x: 0, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow", comment: "existing" }
    } as any);
    store.getState().addNode({
      id: "node2",
      type: "test",
      position: { x: 100, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);

    store.getState().toggleCommentSelected();

    const nodes = store.getState().nodes;
    expect(nodes[0].data.comment).toBeUndefined();
    expect(nodes[1].data.comment).toBe("");
  });

  it("only affects selected nodes", () => {
    store.getState().addNode({
      id: "node1",
      type: "test",
      position: { x: 0, y: 0 },
      selected: true,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);
    store.getState().addNode({
      id: "node2",
      type: "test",
      position: { x: 100, y: 0 },
      selected: false,
      data: { properties: {}, workflow_id: "test-workflow" }
    } as any);

    store.getState().toggleCommentSelected();

    const nodes = store.getState().nodes;
    expect(nodes[0].data.comment).toBe("");
    expect(nodes[1].data.comment).toBeUndefined();
  });
});
