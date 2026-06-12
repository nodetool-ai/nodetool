import { create } from "zustand";
import { createNodeStore, type NodeStore } from "./NodeStore";
import type { Workflow } from "./ApiTypes";

export interface SubgraphTab {
  /** `${workflowId}:${nodeId}` — unique across the editor. */
  key: string;
  /** Parent workflow id (the one shown in a workflow tab). */
  workflowId: string;
  /** SubgraphNode id within the parent workflow. */
  nodeId: string;
  /** Display label for the tab chrome. */
  label: string;
  /** Isolated NodeStore for the subgraph's inner DAG. */
  store: NodeStore;
}

interface SubgraphTabsState {
  tabs: SubgraphTab[];
  activeKey: string | null;
  openTab: (params: {
    workflowId: string;
    nodeId: string;
    label: string;
    initialGraph: { nodes: unknown[]; edges: unknown[] };
  }) => string;
  closeTab: (key: string) => void;
  setActive: (key: string | null) => void;
  closeForWorkflow: (workflowId: string) => void;
  getTab: (key: string) => SubgraphTab | undefined;
}

const tabKey = (workflowId: string, nodeId: string) => `${workflowId}:${nodeId}`;

/** Release the tab's NodeStore resources (metadata subscription). */
const cleanupTabStore = (tab: SubgraphTab): void => {
  try {
    tab.store.getState().cleanup();
  } catch (err) {
    console.warn(`[SubgraphTabs] NodeStore cleanup failed for ${tab.key}`, err);
  }
};

const buildSubgraphWorkflow = (
  key: string,
  label: string,
  graph: { nodes: unknown[]; edges: unknown[] }
): Workflow =>
  ({
    id: key,
    name: label,
    access: "private",
    description: "",
    thumbnail: "",
    tags: [],
    settings: {},
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    graph: graph as Workflow["graph"]
  }) as Workflow;

export const useSubgraphTabsStore = create<SubgraphTabsState>()((set, get) => ({
  tabs: [],
  activeKey: null,

  openTab: ({ workflowId, nodeId, label, initialGraph }) => {
    const key = tabKey(workflowId, nodeId);
    const existing = get().tabs.find((t) => t.key === key);
    if (existing) {
      set({ activeKey: key });
      return key;
    }
    const store = createNodeStore(
      buildSubgraphWorkflow(key, label, initialGraph)
    );
    const tab: SubgraphTab = { key, workflowId, nodeId, label, store };
    set((state) => ({ tabs: [...state.tabs, tab], activeKey: key }));
    return key;
  },

  closeTab: (key) => {
    const { tabs, activeKey } = get();
    const idx = tabs.findIndex((t) => t.key === key);
    if (idx === -1) return;
    // Tear down the tab's NodeStore (releases its MetadataStore
    // subscription) before dropping the reference — mirrors
    // WorkflowManagerStore.removeWorkflow; without this the store leaks
    // forever.
    cleanupTabStore(tabs[idx]);
    const newTabs = tabs.filter((t) => t.key !== key);
    let newActive = activeKey;
    if (activeKey === key) {
      const next = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      newActive = next?.key ?? null;
    }
    set({ tabs: newTabs, activeKey: newActive });
  },

  setActive: (key) => set({ activeKey: key }),

  closeForWorkflow: (workflowId) => {
    const { tabs, activeKey } = get();
    const removed = tabs.filter((t) => t.workflowId === workflowId);
    if (removed.length === 0) return;
    removed.forEach(cleanupTabStore);
    const remaining = tabs.filter((t) => t.workflowId !== workflowId);
    const stillActive = remaining.some((t) => t.key === activeKey);
    set({
      tabs: remaining,
      activeKey: stillActive ? activeKey : null
    });
  },

  getTab: (key) => get().tabs.find((t) => t.key === key)
}));
