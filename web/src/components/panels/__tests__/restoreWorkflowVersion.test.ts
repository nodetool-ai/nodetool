import { act } from "@testing-library/react";
import type { Graph, Workflow } from "../../../stores/ApiTypes";
import { createNodeStore } from "../../../stores/NodeStore";
import { useSubgraphTabsStore } from "../../../stores/SubgraphTabsStore";
import { stub } from "../../../test-utils/doubles";
import { restoreWorkflowVersion } from "../restoreWorkflowVersion";

const workflow = stub<Workflow>({
  id: "wf-1",
  name: "Restore",
  access: "private",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  graph: { nodes: [], edges: [] }
});

const versionGraph = stub<Graph>({
  nodes: [
    {
      id: "legacy",
      type: "nodetool.text.FormatText",
      data: { template: "Hello {{ name }}" },
      ui_properties: { position: { x: 0, y: 0 } }
    }
  ],
  edges: []
});

describe("restoreWorkflowVersion", () => {
  beforeEach(() => {
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
  });

  it("closes the workflow's subgraph tabs and loads the graph like a load does", () => {
    const store = createNodeStore(workflow);
    act(() => {
      useSubgraphTabsStore.getState().openTab({
        workflowId: "wf-1",
        nodeId: "sub",
        label: "Subgraph",
        initialGraph: { nodes: [], edges: [] }
      });
      useSubgraphTabsStore.getState().openTab({
        workflowId: "wf-2",
        nodeId: "sub",
        label: "Other workflow",
        initialGraph: { nodes: [], edges: [] }
      });
    });

    const closed = restoreWorkflowVersion(store, "wf-1", versionGraph);

    expect(closed).toEqual(["wf-1:sub"]);
    expect(useSubgraphTabsStore.getState().tabs.map((tab) => tab.key)).toEqual([
      "wf-2:sub"
    ]);
    const restored = store.getState().findNode("legacy");
    expect(restored?.type).toBe("nodetool.text.Prompt");
    expect(restored?.data.properties.prompt).toBe("Hello {{ name }}");
  });
});
