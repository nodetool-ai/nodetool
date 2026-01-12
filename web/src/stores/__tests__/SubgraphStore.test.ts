/**
 * Tests for SubgraphStore
 */

import { renderHook, act } from "@testing-library/react";
import {
  useSubgraphStore,
  ROOT_GRAPH_ID
} from "../SubgraphStore";
import { SubgraphDefinition } from "../../types/subgraph";

describe("SubgraphStore", () => {
  beforeEach(() => {
    // Reset store before each test
    act(() => {
      useSubgraphStore.getState().reset();
    });
  });

  describe("Definition management", () => {
    it("should add a definition", () => {
      const definition: SubgraphDefinition = {
        id: "test-1",
        name: "Test Subgraph",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      act(() => {
        useSubgraphStore.getState().addDefinition(definition);
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.hasDefinition("test-1")).toBe(true);
      expect(result.current.getDefinition("test-1")).toEqual(definition);
    });

    it("should remove a definition", () => {
      const definition: SubgraphDefinition = {
        id: "test-1",
        name: "Test Subgraph",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      act(() => {
        useSubgraphStore.getState().addDefinition(definition);
        useSubgraphStore.getState().removeDefinition("test-1");
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.hasDefinition("test-1")).toBe(false);
    });

    it("should update a definition", () => {
      const definition: SubgraphDefinition = {
        id: "test-1",
        name: "Test Subgraph",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: "2020-01-01T00:00:00.000Z" // Fixed timestamp for testing
      };

      act(() => {
        useSubgraphStore.getState().addDefinition(definition);
        // Small delay to ensure updated_at changes
        jest.useFakeTimers();
        jest.advanceTimersByTime(1000);
        useSubgraphStore.getState().updateDefinition("test-1", {
          name: "Updated Name"
        });
        jest.useRealTimers();
      });

      const { result } = renderHook(() => useSubgraphStore());
      const updated = result.current.getDefinition("test-1");
      expect(updated?.name).toBe("Updated Name");
      expect(updated?.updated_at).not.toBe(definition.updated_at);
    });

    it("should get all definitions", () => {
      const def1: SubgraphDefinition = {
        id: "test-1",
        name: "Test 1",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const def2: SubgraphDefinition = {
        id: "test-2",
        name: "Test 2",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      act(() => {
        useSubgraphStore.getState().addDefinition(def1);
        useSubgraphStore.getState().addDefinition(def2);
      });

      const { result } = renderHook(() => useSubgraphStore());
      const all = result.current.getAllDefinitions();
      expect(all).toHaveLength(2);
      expect(all.map(d => d.id).sort()).toEqual(["test-1", "test-2"]);
    });
  });

  describe("Navigation", () => {
    it("should start at root", () => {
      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.currentGraphId).toBe(ROOT_GRAPH_ID);
      expect(result.current.navigationPath).toEqual([]);
      expect(result.current.isAtRoot()).toBe(true);
      expect(result.current.getCurrentDepth()).toBe(0);
    });

    it("should open a subgraph", () => {
      act(() => {
        useSubgraphStore.getState().openSubgraph("subgraph-1");
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.currentGraphId).toBe("subgraph-1");
      expect(result.current.navigationPath).toEqual(["subgraph-1"]);
      expect(result.current.isAtRoot()).toBe(false);
      expect(result.current.getCurrentDepth()).toBe(1);
    });

    it("should navigate nested subgraphs", () => {
      act(() => {
        useSubgraphStore.getState().openSubgraph("subgraph-1");
        useSubgraphStore.getState().openSubgraph("subgraph-2");
        useSubgraphStore.getState().openSubgraph("subgraph-3");
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.currentGraphId).toBe("subgraph-3");
      expect(result.current.navigationPath).toEqual([
        "subgraph-1",
        "subgraph-2",
        "subgraph-3"
      ]);
      expect(result.current.getCurrentDepth()).toBe(3);
    });

    it("should exit a subgraph", () => {
      act(() => {
        useSubgraphStore.getState().openSubgraph("subgraph-1");
        useSubgraphStore.getState().openSubgraph("subgraph-2");
        useSubgraphStore.getState().exitSubgraph();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.currentGraphId).toBe("subgraph-1");
      expect(result.current.navigationPath).toEqual(["subgraph-1"]);
      expect(result.current.getCurrentDepth()).toBe(1);
    });

    it("should exit to root", () => {
      act(() => {
        useSubgraphStore.getState().openSubgraph("subgraph-1");
        useSubgraphStore.getState().openSubgraph("subgraph-2");
        useSubgraphStore.getState().exitToRoot();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.currentGraphId).toBe(ROOT_GRAPH_ID);
      expect(result.current.navigationPath).toEqual([]);
      expect(result.current.isAtRoot()).toBe(true);
    });

    it("should not exit when already at root", () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      act(() => {
        useSubgraphStore.getState().exitSubgraph();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.isAtRoot()).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Viewport caching", () => {
    it("should save and retrieve viewport", () => {
      const viewport = { x: 100, y: 200, zoom: 1.5 };

      act(() => {
        useSubgraphStore.getState().saveViewport("graph-1", viewport);
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getViewport("graph-1")).toEqual(viewport);
    });

    it("should return undefined for non-existent viewport", () => {
      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getViewport("non-existent")).toBeUndefined();
    });

    it("should clear viewport cache", () => {
      const viewport = { x: 100, y: 200, zoom: 1.5 };

      act(() => {
        useSubgraphStore.getState().saveViewport("graph-1", viewport);
        useSubgraphStore.getState().clearViewportCache();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getViewport("graph-1")).toBeUndefined();
    });
  });

  describe("Graph caching", () => {
    it("should save and retrieve graph", () => {
      const nodes = [
        { id: "node-1", type: "test", position: { x: 0, y: 0 }, data: { properties: {}, workflow_id: "test" } }
      ] as any[];
      const edges = [{ id: "edge-1", source: "node-1", target: "node-2" }] as any[];

      act(() => {
        useSubgraphStore.getState().saveGraph("graph-1", nodes, edges, "subgraph-id-1");
      });

      const { result } = renderHook(() => useSubgraphStore());
      const cached = result.current.getGraph("graph-1");
      expect(cached).toBeDefined();
      expect(cached?.nodes).toHaveLength(1);
      expect(cached?.edges).toHaveLength(1);
      expect(cached?.subgraphId).toBe("subgraph-id-1");
    });

    it("should return undefined for non-existent graph", () => {
      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getGraph("non-existent")).toBeUndefined();
    });

    it("should clear graph cache", () => {
      const nodes = [{ id: "node-1", type: "test", position: { x: 0, y: 0 }, data: {} }] as any[];

      act(() => {
        useSubgraphStore.getState().saveGraph("graph-1", nodes, [], undefined);
        useSubgraphStore.getState().clearGraphCache();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getGraph("graph-1")).toBeUndefined();
    });
  });

  describe("Reset", () => {
    it("should reset all state", () => {
      const definition: SubgraphDefinition = {
        id: "test-1",
        name: "Test Subgraph",
        version: 1,
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const viewport = { x: 100, y: 200, zoom: 1.5 };
      const nodes = [{ id: "node-1", type: "test", position: { x: 0, y: 0 }, data: {} }] as any[];

      act(() => {
        useSubgraphStore.getState().addDefinition(definition);
        useSubgraphStore.getState().openSubgraph("subgraph-1");
        useSubgraphStore.getState().saveViewport("graph-1", viewport);
        useSubgraphStore.getState().saveGraph("graph-1", nodes, [], undefined);
        useSubgraphStore.getState().reset();
      });

      const { result } = renderHook(() => useSubgraphStore());
      expect(result.current.getAllDefinitions()).toHaveLength(0);
      expect(result.current.isAtRoot()).toBe(true);
      expect(result.current.getViewport("graph-1")).toBeUndefined();
      expect(result.current.getGraph("graph-1")).toBeUndefined();
    });
  });
});
