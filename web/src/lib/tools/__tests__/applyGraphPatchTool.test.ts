/**
 * @jest-environment node
 */
jest.mock("../../../components/node_types/PlaceholderNode", () => () => null);

import { FrontendToolRegistry } from "../frontendTools";
import { makeFrontendToolState } from "../../../test-utils/frontendToolState";
import { createNodeStore } from "../../../stores/NodeStore";
import useMetadataStore from "../../../stores/MetadataStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import "../builtin/applyGraphPatch";

const WF = "wf-patch";
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
  const call = (args: Record<string, unknown>) =>
    FrontendToolRegistry.call("ui_apply_graph_patch", { workflow_id: WF, ...args }, "patch", {
      getState: () => state
    });
  return { store, call };
};

const twoNodes = [
  { id: "a", type: TEXT, position: { x: 0, y: 0 }, properties: { text: "hi" } },
  { id: "b", type: TEXT, position: { x: 300, y: 0 } }
];

describe("ui_apply_graph_patch", () => {
  it("adds nodes and wires them as one undo step", async () => {
    const { store, call } = setup();

    const result = (await call({
      add_nodes: twoNodes,
      add_edges: [{ source_node_id: "a", source_handle: "output", target_node_id: "b", target_handle: "text" }]
    })) as { ok: boolean; applied: Array<Record<string, unknown>> };

    expect(result.ok).toBe(true);
    expect(result.applied.map((entry) => entry.op)).toEqual(["add_nodes", "add_nodes", "add_edges"]);
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(store.getState().edges).toHaveLength(1);

    store.temporal.getState().undo();
    expect(store.getState().nodes).toEqual([]);
    expect(store.getState().edges).toEqual([]);
  });

  it("applies nothing and adds no undo step when an entry fails", async () => {
    const { store, call } = setup();
    const undoDepth = store.temporal.getState().pastStates.length;

    await expect(
      call({
        add_nodes: twoNodes,
        add_edges: [{ source_node_id: "a", source_handle: "missing", target_node_id: "b", target_handle: "text" }]
      })
    ).rejects.toThrow(/add_edges\[0\]: .*missing.* No change was applied\./);

    expect(store.getState().nodes).toEqual([]);
    expect(store.getState().edges).toEqual([]);
    expect(store.temporal.getState().pastStates.length).toBe(undoDepth);
  });
});
