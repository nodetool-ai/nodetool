import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import type { Node } from "@xyflow/react";

import { NodeProvider, useNodes } from "../../../../contexts/NodeContext";
import { WORKFLOW_NODE_TYPE } from "../../../../constants/nodeTypes";
import type { Workflow } from "../../../../stores/ApiTypes";
import type { NodeData } from "../../../../stores/NodeData";
import { createNodeStore, type NodeStore } from "../../../../stores/NodeStore";
import { useNotificationStore } from "../../../../stores/NotificationStore";
import { stub } from "../../../../test-utils/doubles";
import mockTheme from "../../../../__mocks__/themeMock";
import { WorkflowLoader } from "../WorkflowLoader";

const nodeStores: Record<string, NodeStore> = {};
const workflowList: Array<{ id: string; name: string }> = [];

jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({
      load: async () => ({ workflows: workflowList }),
      getWorkflow: (id: string) => nodeStores[id]?.getState().getWorkflow(),
      fetchWorkflow: async () => undefined,
      nodeStores
    })
}));

const workflow = (id: string): Workflow =>
  stub<Workflow>({
    id,
    name: `Workflow ${id}`,
    access: "private",
    description: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    graph: { nodes: [], edges: [] }
  });

const workflowNode = (
  hostId: string,
  properties: Record<string, unknown>
): Node<NodeData> => ({
  id: "wf-node",
  type: WORKFLOW_NODE_TYPE,
  position: { x: 0, y: 0 },
  data: {
    properties,
    selectable: true,
    dynamic_properties: {},
    workflow_id: hostId
  }
});

const openWorkflow = (
  id: string,
  properties: Record<string, unknown>
): NodeStore => {
  const store = createNodeStore(workflow(id), {
    nodes: [workflowNode(id, properties)]
  });
  nodeStores[id] = store;
  return store;
};

const LiveLoader = () => {
  const data = useNodes((state) => state.findNode("wf-node")?.data);
  return data ? <WorkflowLoader nodeId="wf-node" data={data} /> : null;
};

const renderLoader = async (store: NodeStore) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  await act(async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <QueryClientProvider client={queryClient}>
          <NodeProvider createStore={() => store}>
            <LiveLoader />
          </NodeProvider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

const countNodeUpdates = (store: NodeStore): (() => number) => {
  let count = 0;
  store.subscribe((state, previous) => {
    if (state.nodes !== previous.nodes) {
      count += 1;
    }
  });
  return () => count;
};

describe("WorkflowLoader cycles", () => {
  beforeEach(() => {
    for (const id of Object.keys(nodeStores)) {
      delete nodeStores[id];
    }
    workflowList.length = 0;
    useNotificationStore.setState({ notifications: [] });
  });

  it("does not copy its own workflow into the node", async () => {
    const host = openWorkflow("A", { workflow_id: "A" });
    const updates = countNodeUpdates(host);

    await renderLoader(host);

    expect(updates()).toBe(0);
    expect(
      host.getState().findNode("wf-node")?.data.properties.workflow_json
    ).toBeUndefined();
    expect(screen.getByText(/runs this workflow/)).toBeTruthy();
  });

  it("does not copy a workflow that runs the host back (A to B to A)", async () => {
    openWorkflow("B", { workflow_id: "A" });
    const host = openWorkflow("A", { workflow_id: "B" });
    const updates = countNodeUpdates(host);

    await renderLoader(host);

    expect(updates()).toBe(0);
    expect(
      host.getState().findNode("wf-node")?.data.properties.workflow_json
    ).toBeUndefined();
  });

  it("leaves the host out of the options and rejects a cyclic pick", async () => {
    workflowList.push(
      { id: "A", name: "Workflow A" },
      { id: "B", name: "Workflow B" }
    );
    openWorkflow("B", { workflow_id: "A" });
    const host = openWorkflow("A", {});

    await renderLoader(host);
    fireEvent.mouseDown(screen.getByLabelText("Select workflow"));

    expect(screen.queryByRole("option", { name: "Workflow A" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Workflow B" }));
    });

    expect(
      host.getState().findNode("wf-node")?.data.properties.workflow_id
    ).toBeUndefined();
    expect(
      useNotificationStore
        .getState()
        .notifications.some((n) => n.content.includes("runs this workflow"))
    ).toBe(true);
  });

  it("still copies a workflow without a cycle", async () => {
    openWorkflow("B", {});
    const host = openWorkflow("A", { workflow_id: "B" });

    await renderLoader(host);

    const json = host.getState().findNode("wf-node")?.data.properties
      .workflow_json as { id?: string } | undefined;
    expect(json?.id).toBe("B");
  });
});
