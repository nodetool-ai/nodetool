/**
 * Web mounts for the native parity harness (native/parity/README.md). Each
 * mount renders one production component with fixture state and reports the
 * same probe fields as the Qt host's mount of the same name.
 */
import type { ReactElement } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import NodeMenu from "../components/node_menu/NodeMenu";
import { NodeContext } from "../contexts/NodeContext";
import { createReadOnlyNodeStore } from "../stores/readOnlyNodeStore";
import useMetadataStore from "../stores/MetadataStore";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { useFavoriteNodesStore } from "../stores/FavoriteNodesStore";
import type { NodeMetadata, Workflow } from "../stores/ApiTypes";

export interface ParityFixture {
  metadata: NodeMetadata[];
  recent?: string[];
  favorites?: string[];
}

/** One entry of the intent log: what the component asked its host to do. */
export interface ParityIntent {
  intent: string;
  args: unknown[];
}

export interface ParityMount {
  element: ReactElement;
  /** Size of the Qt view for the same component. */
  size: { width: number; height: number };
  /** The element a screenshot covers: the component's own root. */
  screenshot: string;
  probe: () => Record<string, unknown>;
}

const workflow: Workflow = {
  id: "parity", name: "Parity", description: "", access: "private",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  graph: { nodes: [], edges: [] }
};

const seedCatalog = (fixture: ParityFixture): void => {
  useMetadataStore.getState().setMetadata(
    Object.fromEntries(fixture.metadata.map((node) => [node.node_type, node]))
  );
  useRecentNodesStore.setState({
    recentNodes: (fixture.recent ?? []).map((nodeType) => ({ nodeType, timestamp: 0 }))
  });
  useFavoriteNodesStore.setState({
    favorites: (fixture.favorites ?? []).map((nodeType) => ({ nodeType, timestamp: 0 }))
  });
};

/**
 * NodeMenu, opened at the top left as the editor opens it from the canvas.
 * The node store records the nodes the menu adds as `addNode` intents.
 */
const nodeMenu = (fixture: ParityFixture, record: (intent: ParityIntent) => void): ParityMount => {
  seedCatalog(fixture);
  const store = createReadOnlyNodeStore([], [], workflow);
  store.setState({
    createNode: (metadata: NodeMetadata, position: { x: number; y: number }) => ({
      id: `parity-${metadata.node_type}`, type: metadata.node_type, position,
      data: { workflow_id: workflow.id, properties: {}, dynamic_properties: {}, selectable: true }
    }),
    addNode: (node: { type: string }) => record({ intent: "addNode", args: [node.type] })
  } as never);
  useNodeMenuStore.getState().openNodeMenu({ x: 0, y: 0 });
  return {
    size: { width: 980, height: 620 },
    screenshot: ".floating-node-menu",
    element: (
      <ReactFlowProvider>
        <NodeContext.Provider value={store}>
          <NodeMenu focusSearchInput />
        </NodeContext.Provider>
      </ReactFlowProvider>
    ),
    probe: () => {
      const state = useNodeMenuStore.getState();
      const results = state.groupedSearchResults.flatMap((group) => group.nodes.map((node) => node.node_type));
      return {
        query: state.searchTerm,
        home: state.searchTerm.trim() === "" && state.selectedPath.length === 0,
        results,
        highlighted: state.getSelectedNode()?.node_type ?? null
      };
    }
  };
};

export const MOUNTS: Record<string, (fixture: ParityFixture, record: (intent: ParityIntent) => void) => ParityMount> = {
  NodeMenu: nodeMenu
};
