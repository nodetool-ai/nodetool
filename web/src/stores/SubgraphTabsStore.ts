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

/** A SubgraphNode's inner graph, as stored in `data.properties.graph`. */
export interface SubgraphGraph {
  nodes: unknown[];
  edges: unknown[];
}

interface SubgraphTabsState {
  tabs: SubgraphTab[];
  activeKey: string | null;
  /**
   * Opens the tab for a SubgraphNode, or activates it if it is open. An open
   * tab is rebuilt from `initialGraph` when that differs from what the tab
   * last loaded or wrote back, e.g. after an undo in the parent.
   */
  openTab: (params: {
    workflowId: string;
    nodeId: string;
    label: string;
    initialGraph: SubgraphGraph;
  }) => string;
  /** Closes a tab and every subgraph opened from it; returns their keys. */
  closeTab: (key: string) => string[];
  setActive: (key: string | null) => void;
  closeForWorkflow: (workflowId: string) => void;
  getTab: (key: string) => SubgraphTab | undefined;
  /** Records the graph a tab just wrote onto its SubgraphNode. */
  markSynced: (key: string, graph: SubgraphGraph) => void;
  /**
   * Brings a tab in line with its SubgraphNode: closes it when the node is
   * gone (`graph` undefined) and rebuilds it when the node's graph changed
   * since the tab last loaded or wrote it. Returns the keys it closed.
   */
  reconcileTab: (key: string, graph: SubgraphGraph | undefined) => string[];
}

const tabKey = (workflowId: string, nodeId: string) => `${workflowId}:${nodeId}`;

/**
 * The graph each tab last loaded from or wrote to its SubgraphNode, compared
 * by array identity. Bookkeeping only, so it lives outside the store state and
 * never triggers a render.
 */
const syncedGraphs = new Map<string, SubgraphGraph>();

const sameGraph = (a: SubgraphGraph, b: SubgraphGraph): boolean =>
  (a.nodes === b.nodes ||
    (a.nodes.length === 0 && b.nodes.length === 0)) &&
  (a.edges === b.edges || (a.edges.length === 0 && b.edges.length === 0));

/** Every tab opened, directly or through other tabs, from `hostKey`. */
const descendantKeys = (
  tabs: readonly SubgraphTab[],
  hostKey: string
): string[] => {
  const keys: string[] = [];
  const pending = [hostKey];
  while (pending.length > 0) {
    const host = pending.pop();
    for (const tab of tabs) {
      if (tab.workflowId === host && !keys.includes(tab.key)) {
        keys.push(tab.key);
        pending.push(tab.key);
      }
    }
  }
  return keys;
};

/**
 * The tab opened directly from `hostId` (a workflow id or a tab key) that is
 * active or contains the active tab, or undefined when the host itself is
 * what should show.
 */
export const findActiveChildTab = (
  tabs: readonly SubgraphTab[],
  activeKey: string | null,
  hostId: string
): SubgraphTab | undefined => {
  const seen = new Set<string>();
  let tab = tabs.find((candidate) => candidate.key === activeKey);
  while (tab && !seen.has(tab.key)) {
    if (tab.workflowId === hostId) {
      return tab;
    }
    seen.add(tab.key);
    const parentKey = tab.workflowId;
    tab = tabs.find((candidate) => candidate.key === parentKey);
  }
  return undefined;
};

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

const createTabStore = (
  key: string,
  label: string,
  graph: SubgraphGraph
): NodeStore => {
  syncedGraphs.set(key, graph);
  return createNodeStore(buildSubgraphWorkflow(key, label, graph));
};

export const useSubgraphTabsStore = create<SubgraphTabsState>()((set, get) => ({
  tabs: [],
  activeKey: null,

  openTab: ({ workflowId, nodeId, label, initialGraph }) => {
    const key = tabKey(workflowId, nodeId);
    const existing = get().tabs.find((t) => t.key === key);
    if (existing) {
      get().reconcileTab(key, initialGraph);
      set({ activeKey: key });
      return key;
    }
    const store = createTabStore(key, label, initialGraph);
    const tab: SubgraphTab = { key, workflowId, nodeId, label, store };
    set((state) => ({ tabs: [...state.tabs, tab], activeKey: key }));
    return key;
  },

  closeTab: (key) => {
    const { tabs, activeKey } = get();
    const closing = tabs.find((t) => t.key === key);
    if (!closing) {
      return [];
    }
    const removedKeys = [key, ...descendantKeys(tabs, key)];
    const removed = tabs.filter((t) => removedKeys.includes(t.key));
    // Tear down each NodeStore (releases its MetadataStore subscription)
    // before dropping the reference — mirrors
    // WorkflowManagerStore.removeWorkflow; without this the store leaks
    // forever.
    removed.forEach(cleanupTabStore);
    removedKeys.forEach((removedKey) => syncedGraphs.delete(removedKey));
    const newTabs = tabs.filter((t) => !removedKeys.includes(t.key));
    let newActive = activeKey;
    if (activeKey !== null && removedKeys.includes(activeKey)) {
      // Stay with the same canvas: a sibling opened from the same host, or
      // the host itself. Never another workflow's subgraph.
      const siblings = tabs.filter((t) => t.workflowId === closing.workflowId);
      const idx = siblings.findIndex((t) => t.key === key);
      const next = siblings[idx + 1] ?? siblings[idx - 1];
      const hostIsTab = newTabs.some((t) => t.key === closing.workflowId);
      newActive = next?.key ?? (hostIsTab ? closing.workflowId : null);
    }
    set({ tabs: newTabs, activeKey: newActive });
    return removedKeys;
  },

  setActive: (key) => set({ activeKey: key }),

  closeForWorkflow: (workflowId) => {
    const { tabs, activeKey } = get();
    const removedKeys = descendantKeys(tabs, workflowId);
    if (removedKeys.length === 0) return;
    const removed = tabs.filter((t) => removedKeys.includes(t.key));
    removed.forEach(cleanupTabStore);
    removedKeys.forEach((removedKey) => syncedGraphs.delete(removedKey));
    const remaining = tabs.filter((t) => !removedKeys.includes(t.key));
    const stillActive = remaining.some((t) => t.key === activeKey);
    set({
      tabs: remaining,
      activeKey: stillActive ? activeKey : null
    });
  },

  getTab: (key) => get().tabs.find((t) => t.key === key),

  markSynced: (key, graph) => {
    syncedGraphs.set(key, graph);
  },

  reconcileTab: (key, graph) => {
    const tab = get().tabs.find((t) => t.key === key);
    if (!tab) {
      return [];
    }
    if (!graph) {
      return get().closeTab(key);
    }
    const synced = syncedGraphs.get(key);
    if (synced && sameGraph(synced, graph)) {
      return [];
    }
    // Subgraphs opened from this tab were seeded from the stale graph too.
    const staleKeys = descendantKeys(get().tabs, key);
    staleKeys.forEach((staleKey) => get().closeTab(staleKey));
    cleanupTabStore(tab);
    const rebuilt: SubgraphTab = {
      ...tab,
      store: createTabStore(key, tab.label, graph)
    };
    set((state) => ({
      tabs: state.tabs.map((t) => (t.key === key ? rebuilt : t)),
      activeKey:
        state.activeKey !== null && staleKeys.includes(state.activeKey)
          ? key
          : state.activeKey
    }));
    return staleKeys;
  }
}));
