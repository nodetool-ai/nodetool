import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  findActiveChildTab,
  useSubgraphTabsStore,
  type SubgraphGraph
} from "../SubgraphTabsStore";

const resetStore = () =>
  act(() => {
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
  });

const open = (workflowId: string, nodeId: string, label = "Subgraph"): string =>
  useSubgraphTabsStore.getState().openTab({
    workflowId,
    nodeId,
    label,
    initialGraph: { nodes: [], edges: [] }
  });

describe("SubgraphTabsStore", () => {
  beforeEach(resetStore);

  describe("openTab", () => {
    it("opens a tab and sets it active", () => {
      let key = "";
      act(() => {
        key = open("wf-1", "node-a");
      });
      const state = useSubgraphTabsStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.activeKey).toBe(key);
      expect(state.tabs[0].workflowId).toBe("wf-1");
      expect(state.tabs[0].nodeId).toBe("node-a");
    });

    it("reuses an existing tab for the same node", () => {
      let firstKey = "";
      let secondKey = "";
      act(() => {
        firstKey = open("wf-1", "node-a");
      });
      act(() => {
        useSubgraphTabsStore.getState().setActive(null);
      });
      act(() => {
        secondKey = open("wf-1", "node-a");
      });
      expect(firstKey).toBe(secondKey);
      expect(useSubgraphTabsStore.getState().tabs).toHaveLength(1);
      expect(useSubgraphTabsStore.getState().activeKey).toBe(firstKey);
    });

    it("keeps tabs for different workflows isolated", () => {
      act(() => {
        open("wf-1", "node-a");
        open("wf-2", "node-a");
      });
      const tabs = useSubgraphTabsStore.getState().tabs;
      expect(tabs).toHaveLength(2);
      expect(tabs.map((t) => t.workflowId).sort()).toEqual(["wf-1", "wf-2"]);
    });
  });

  describe("closeTab", () => {
    it("removes the tab and clears active when closing the active one", () => {
      let key = "";
      act(() => {
        key = open("wf-1", "node-a");
      });
      act(() => {
        useSubgraphTabsStore.getState().closeTab(key);
      });
      const state = useSubgraphTabsStore.getState();
      expect(state.tabs).toHaveLength(0);
      expect(state.activeKey).toBeNull();
    });

    it("activates the next tab when closing the active one", () => {
      let keyA = "";
      let keyB = "";
      act(() => {
        keyA = open("wf-1", "node-a");
        keyB = open("wf-1", "node-b");
      });
      // node-b is now active
      act(() => {
        useSubgraphTabsStore.getState().closeTab(keyB);
      });
      // active should fall back to node-a
      expect(useSubgraphTabsStore.getState().activeKey).toBe(keyA);
    });

    it("never activates another workflow's subgraph", () => {
      let keyA = "";
      act(() => {
        keyA = open("wf-1", "node-a");
        open("wf-2", "node-b");
      });
      act(() => {
        useSubgraphTabsStore.getState().setActive(keyA);
      });
      act(() => {
        useSubgraphTabsStore.getState().closeTab(keyA);
      });
      expect(useSubgraphTabsStore.getState().activeKey).toBeNull();
    });

    it("closes subgraphs opened inside the tab and returns to its host", () => {
      let outer = "";
      let inner = "";
      let deepest = "";
      act(() => {
        outer = open("wf-1", "outer");
        inner = open(outer, "inner");
        deepest = open(inner, "deepest");
      });
      let closed: string[] = [];
      act(() => {
        closed = useSubgraphTabsStore.getState().closeTab(inner);
      });
      expect(closed.sort()).toEqual([deepest, inner].sort());
      expect(useSubgraphTabsStore.getState().tabs.map((t) => t.key)).toEqual([
        outer
      ]);
      // The closed tabs held the active one; the outer subgraph shows again.
      expect(useSubgraphTabsStore.getState().activeKey).toBe(outer);
    });
  });

  describe("findActiveChildTab", () => {
    it("finds the top-level tab holding an active nested subgraph", () => {
      let outer = "";
      let inner = "";
      act(() => {
        outer = open("wf-1", "outer");
        inner = open(outer, "inner");
      });
      const { tabs, activeKey } = useSubgraphTabsStore.getState();
      expect(activeKey).toBe(inner);
      expect(findActiveChildTab(tabs, activeKey, "wf-1")?.key).toBe(outer);
      expect(findActiveChildTab(tabs, activeKey, outer)?.key).toBe(inner);
      expect(findActiveChildTab(tabs, activeKey, inner)).toBeUndefined();
      expect(findActiveChildTab(tabs, activeKey, "wf-2")).toBeUndefined();
    });
  });

  describe("reconcileTab", () => {
    const graphWith = (id: string): SubgraphGraph => ({
      nodes: [{ id, type: "nodetool.constant.String", data: {} }],
      edges: []
    });

    it("keeps the tab when its node still holds what the tab last wrote", () => {
      let key = "";
      act(() => {
        key = open("wf-1", "node-a");
      });
      const written = graphWith("x");
      const store = useSubgraphTabsStore.getState().getTab(key)?.store;
      act(() => {
        useSubgraphTabsStore.getState().markSynced(key, written);
        useSubgraphTabsStore.getState().reconcileTab(key, written);
      });
      expect(useSubgraphTabsStore.getState().getTab(key)?.store).toBe(store);
    });

    it("rebuilds a reopened tab from the node's changed graph", () => {
      let key = "";
      act(() => {
        key = open("wf-1", "node-a");
      });
      const stale = useSubgraphTabsStore.getState().getTab(key)?.store;
      act(() => {
        useSubgraphTabsStore.getState().openTab({
          workflowId: "wf-1",
          nodeId: "node-a",
          label: "Subgraph",
          initialGraph: graphWith("restored")
        });
      });
      const rebuilt = useSubgraphTabsStore.getState().getTab(key)?.store;
      expect(rebuilt).not.toBe(stale);
      expect(rebuilt?.getState().nodes.map((n) => n.id)).toEqual(["restored"]);
    });

    it("closes the tab when its node is gone", () => {
      let key = "";
      act(() => {
        key = open("wf-1", "node-a");
      });
      act(() => {
        useSubgraphTabsStore.getState().reconcileTab(key, undefined);
      });
      expect(useSubgraphTabsStore.getState().getTab(key)).toBeUndefined();
      expect(useSubgraphTabsStore.getState().activeKey).toBeNull();
    });
  });

  describe("closeForWorkflow", () => {
    it("removes only tabs for the given workflow", () => {
      act(() => {
        open("wf-1", "node-a");
        open("wf-1", "node-b");
        open("wf-2", "node-c");
      });
      act(() => {
        useSubgraphTabsStore.getState().closeForWorkflow("wf-1");
      });
      const tabs = useSubgraphTabsStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].workflowId).toBe("wf-2");
    });

    it("clears activeKey if the active tab belonged to the closed workflow", () => {
      let activeKey = "";
      act(() => {
        open("wf-2", "node-c");
        activeKey = open("wf-1", "node-a");
      });
      expect(useSubgraphTabsStore.getState().activeKey).toBe(activeKey);
      act(() => {
        useSubgraphTabsStore.getState().closeForWorkflow("wf-1");
      });
      expect(useSubgraphTabsStore.getState().activeKey).toBeNull();
    });

    it("preserves activeKey if the active tab belonged to another workflow", () => {
      let activeKey = "";
      act(() => {
        open("wf-1", "node-a");
        activeKey = open("wf-2", "node-c");
      });
      act(() => {
        useSubgraphTabsStore.getState().closeForWorkflow("wf-1");
      });
      expect(useSubgraphTabsStore.getState().activeKey).toBe(activeKey);
    });
  });
});
