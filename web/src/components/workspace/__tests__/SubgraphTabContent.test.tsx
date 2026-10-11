import { act, render, screen } from "@testing-library/react";
import { create } from "zustand";

import { makeNodeStore } from "../../../test-utils/nodeStore";
import {
  useSubgraphTabsStore,
  type SubgraphGraph
} from "../../../stores/SubgraphTabsStore";
import type { NodeStore } from "../../../stores/NodeStore";

jest.mock("../../node_editor/NodeEditor", () => ({
  __esModule: true,
  default: ({ workflowId, active }: { workflowId: string; active: boolean }) => (
    <div
      data-testid="node-editor"
      data-workflow={workflowId}
      data-active={String(active)}
    />
  )
}));
jest.mock("../../editor/NodeCreateBridge", () => ({
  __esModule: true,
  default: () => <div data-testid="node-create-bridge" />
}));
jest.mock("../SubgraphTabStrip", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../KeyboardProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
jest.mock("../../../providers/ContextMenuProvider", () => ({
  ContextMenuProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));
jest.mock("../../../providers/ConnectableNodesProvider", () => ({
  ConnectableNodesProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));

const mockManager = create<{
  nodeStores: Record<string, NodeStore>;
  getNodeStore: (id: string) => NodeStore | undefined;
}>()((_set, get) => ({
  nodeStores: {},
  getNodeStore: (id) => get().nodeStores[id]
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (state: ReturnType<typeof mockManager.getState>) => T
  ) => mockManager(selector),
  useWorkflowManagerStore: () => mockManager
}));

import SubgraphTabContent from "../SubgraphTabContent";

/** The parent workflow, holding one SubgraphNode whose graph a test sets. */
const parentWith = (graph: SubgraphGraph | null): NodeStore =>
  makeNodeStore({
    findNode: (id: string) =>
      graph && id === "sub"
        ? { id, data: { properties: { graph } } }
        : undefined,
    updateNodeData: jest.fn()
  });

const openSubgraph = (workflowId: string, nodeId: string, graph: SubgraphGraph) =>
  useSubgraphTabsStore.getState().openTab({
    workflowId,
    nodeId,
    label: nodeId,
    initialGraph: graph
  });

const tabFor = (key: string) => {
  const tab = useSubgraphTabsStore.getState().getTab(key);
  if (!tab) {
    throw new Error(`No tab ${key}`);
  }
  return tab;
};

describe("SubgraphTabContent", () => {
  const graph: SubgraphGraph = { nodes: [], edges: [] };

  beforeEach(() => {
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
    mockManager.setState({ nodeStores: { w1: parentWith(graph) } });
  });

  it("takes node-menu requests only when its workspace tab is on screen", () => {
    const key = openSubgraph("w1", "sub", graph);
    const { rerender } = render(
      <SubgraphTabContent tab={tabFor(key)} active={false} />
    );
    expect(screen.queryByTestId("node-create-bridge")).not.toBeInTheDocument();
    expect(screen.getByTestId("node-editor")).toHaveAttribute(
      "data-active",
      "false"
    );

    rerender(<SubgraphTabContent tab={tabFor(key)} active />);
    expect(screen.getAllByTestId("node-create-bridge")).toHaveLength(1);
  });

  it("renders a subgraph opened inside it, and only that one takes requests", () => {
    const outerGraph: SubgraphGraph = {
      nodes: [{ id: "inner", type: "nodetool.workflows.Subgraph", data: { graph } }],
      edges: []
    };
    mockManager.setState({ nodeStores: { w1: parentWith(outerGraph) } });
    const outerKey = openSubgraph("w1", "sub", outerGraph);
    const innerKey = openSubgraph(outerKey, "inner", graph);

    render(<SubgraphTabContent tab={tabFor(outerKey)} active />);

    const editors = screen.getAllByTestId("node-editor");
    expect(editors.map((e) => e.getAttribute("data-workflow"))).toEqual([
      outerKey,
      innerKey
    ]);
    expect(screen.getAllByTestId("node-create-bridge")).toHaveLength(1);
  });

  it("rebuilds a reopened tab whose node's graph changed while it was hidden", () => {
    const key = openSubgraph("w1", "sub", graph);
    const staleStore = tabFor(key).store;
    // An undo in the parent restored an older inner graph.
    const restored: SubgraphGraph = {
      nodes: [{ id: "a", type: "nodetool.constant.String", data: {} }],
      edges: []
    };
    mockManager.setState({ nodeStores: { w1: parentWith(restored) } });

    render(<SubgraphTabContent tab={tabFor(key)} active />);

    const rebuilt = tabFor(key).store;
    expect(rebuilt).not.toBe(staleStore);
    expect(rebuilt.getState().nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("closes a tab whose subgraph node was deleted", () => {
    const key = openSubgraph("w1", "sub", graph);
    mockManager.setState({ nodeStores: { w1: parentWith(null), [key]: tabFor(key).store } });

    act(() => {
      render(<SubgraphTabContent tab={tabFor(key)} active />);
    });

    expect(useSubgraphTabsStore.getState().getTab(key)).toBeUndefined();
    expect(mockManager.getState().nodeStores[key]).toBeUndefined();
  });
});
