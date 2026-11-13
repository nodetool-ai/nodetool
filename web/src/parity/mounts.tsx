/**
 * Web mounts for the native parity harness (native/parity/README.md). Each
 * mount renders one production component with fixture state and reports the
 * same probe fields as the Qt host's mount of the same name.
 */
import { useState, type ReactElement } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { QueryClient } from "@tanstack/react-query";
import NodeMenu from "../components/node_menu/NodeMenu";
import MediaChatComposer from "../components/chat/composer/MediaChatComposer";
import { NodeContext } from "../contexts/NodeContext";
import { createReadOnlyNodeStore } from "../stores/readOnlyNodeStore";
import useMetadataStore from "../stores/MetadataStore";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { useFavoriteNodesStore } from "../stores/FavoriteNodesStore";
import useGlobalChatStore from "../stores/GlobalChatStore";
import useMediaGenerationStore from "../stores/MediaGenerationStore";
import type { LanguageModel, NodeMetadata, ProviderInfo, Workflow } from "../stores/ApiTypes";

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
type MountFactory = (fixture: ParityFixture, record: (intent: ParityIntent) => void, queryClient: QueryClient) => ParityMount;

const nodeMenu: MountFactory = (fixture, record) => {
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

/** A connected chat provider, as the Qt host's session reports it connected. */
const chatModel: LanguageModel = { type: "language_model", id: "parity-model", name: "Parity model", provider: "anthropic" };
const chatProviders: ProviderInfo[] = [{ provider: "anthropic", capabilities: ["generate_message"] }];

/**
 * The composer as CanvasMediaComposer holds it: a send starts a reply, which
 * a stop ends, and both are recorded as `send` and `stop` intents.
 */
function ParityComposer({ record, onRunning }: { record: (intent: ParityIntent) => void; onRunning: (running: boolean) => void }): ReactElement {
  const [running, setRunning] = useState(false);
  const change = (next: boolean): void => {
    onRunning(next);
    setRunning(next);
  };
  return (
    <MediaChatComposer
      isLoading={false}
      isStreaming={running}
      onSendMessage={(_content, prompt) => {
        record({ intent: "send", args: [prompt] });
        change(true);
      }}
      onStop={() => {
        record({ intent: "stop", args: [] });
        change(false);
      }}
      selectedModel={chatModel}
      threadId="parity-thread"
    />
  );
}

const chatComposer: MountFactory = (_fixture, record, queryClient) => {
  let running = false;
  queryClient.setQueryData(["providers"], chatProviders);
  useMediaGenerationStore.setState({ mode: "chat" });
  useGlobalChatStore.setState({ permissionMode: {}, lastPermissionMode: "default" });
  return {
    size: { width: 400, height: 160 },
    screenshot: ".media-chat-composer",
    element: (
      <div style={{ width: 400 }}>
        <ParityComposer record={record} onRunning={(next) => { running = next; }} />
      </div>
    ),
    probe: () => ({
      draft: document.querySelector<HTMLTextAreaElement>("textarea.media-compose-input")?.value ?? "",
      running,
      compact: document.querySelector(".media-chip-row")?.classList.contains("narrow") ?? false,
      permission: useGlobalChatStore.getState().getPermissionMode("parity-thread")
    })
  };
};

export const MOUNTS: Record<string, MountFactory> = {
  ChatComposer: chatComposer,
  NodeMenu: nodeMenu
};
