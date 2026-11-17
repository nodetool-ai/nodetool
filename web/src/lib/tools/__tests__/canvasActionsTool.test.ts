/**
 * @jest-environment node
 */
jest.mock("../../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../../../hooks/useFitNodeEvent", () => ({ requestFitNode: jest.fn() }));

import { FrontendToolRegistry } from "../frontendTools";
import { makeFrontendToolState } from "../../../test-utils/frontendToolState";
import { createNodeStore } from "../../../stores/NodeStore";
import useMetadataStore from "../../../stores/MetadataStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { requestFitNode } from "../../../hooks/useFitNodeEvent";
import "../builtin/applyGraphPatch";
import "../builtin/canvasActions";

const WF = "wf-canvas";
const TEXT = "test.Text";
const metadata = {
  [TEXT]: {
    node_type: TEXT,
    title: "Text",
    namespace: "test",
    properties: [{ name: "text", type: { type: "str", type_args: [] }, default: "" }],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }]
  }
} as unknown as Record<string, NodeMetadata>;

const setup = () => {
  useMetadataStore.getState().setMetadata(metadata);
  const store = createNodeStore(undefined, { nodes: [], edges: [] });
  const state = makeFrontendToolState({
    currentWorkflowId: WF,
    getOpenWorkflowIds: () => [WF],
    nodeMetadata: metadata,
    getNodeStore: jest.fn().mockReturnValue(store)
  });
  const call = (name: string, args: Record<string, unknown>) =>
    FrontendToolRegistry.call(name, { workflow_id: WF, ...args }, name, { getState: () => state });
  const addNode = (id: string, x: number) =>
    call("ui_apply_graph_patch", { add_nodes: [{ id, type: TEXT, position: { x, y: 0 } }] }) as Promise<{
      document_revision: string;
    }>;
  return { store, call, addNode };
};

describe("ui_focus_nodes", () => {
  it("selects the found nodes, frames them, and reports the missing ids", async () => {
    const { store, call, addNode } = setup();
    await addNode("a", 0);
    await addNode("b", 300);

    const result = await call("ui_focus_nodes", { node_ids: ["b", "gone"] });

    expect(result).toEqual({ ok: true, focused: ["b"], missing: ["gone"] });
    expect(store.getState().nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(["b"]);
    expect(requestFitNode).toHaveBeenCalledWith({ nodeId: "b", nodeIds: ["b"], workflowId: WF });
  });

  it("fails when no node matches", async () => {
    const { call } = setup();
    await expect(call("ui_focus_nodes", { node_ids: ["gone"] })).rejects.toThrow("No node found for gone");
  });
});

describe("ui_undo", () => {
  it("undoes the agent's last edit", async () => {
    const { store, call, addNode } = setup();
    await addNode("a", 0);
    const last = await addNode("b", 300);

    const result = await call("ui_undo", { based_on_revision: last.document_revision });

    expect(result).toMatchObject({ ok: true, undone: 1 });
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["a"]);
  });

  it("undoes nothing when the user edited after the agent", async () => {
    const { store, call, addNode } = setup();
    const last = await addNode("a", 0);
    store.getState().updateNodeData("a", { title: "Renamed by the user" });
    const before = store.getState().nodes;

    await expect(call("ui_undo", { based_on_revision: last.document_revision })).rejects.toThrow(
      "document_revision_conflict"
    );
    expect(store.getState().nodes).toBe(before);
  });
});
