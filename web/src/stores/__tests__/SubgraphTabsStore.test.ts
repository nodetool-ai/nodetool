import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useSubgraphTabsStore } from "../SubgraphTabsStore";

const resetStore = () =>
  act(() => {
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
  });

const open = (workflowId: string, nodeId: string, label = "Subgraph") =>
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
