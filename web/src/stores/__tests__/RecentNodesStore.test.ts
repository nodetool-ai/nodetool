/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useRecentNodesStore } from "../RecentNodesStore";

describe("RecentNodesStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset the store to initial state
    const { result } = renderHook(() => useRecentNodesStore());
    act(() => {
      result.current.clearRecentNodes();
    });
  });

  it("should initialize with empty recent nodes", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    expect(result.current.recentNodeTypes).toEqual([]);
  });

  it("should add a node type to recent nodes", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    
    act(() => {
      result.current.addRecentNode("nodetool.text.TextInput");
    });

    expect(result.current.recentNodeTypes).toEqual(["nodetool.text.TextInput"]);
  });

  it("should move existing node type to the front", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    
    act(() => {
      result.current.addRecentNode("nodetool.text.TextInput");
      result.current.addRecentNode("nodetool.image.ImageInput");
      result.current.addRecentNode("nodetool.audio.AudioInput");
    });

    expect(result.current.recentNodeTypes).toEqual([
      "nodetool.audio.AudioInput",
      "nodetool.image.ImageInput",
      "nodetool.text.TextInput"
    ]);

    // Add the first node again - it should move to front
    act(() => {
      result.current.addRecentNode("nodetool.text.TextInput");
    });

    expect(result.current.recentNodeTypes).toEqual([
      "nodetool.text.TextInput",
      "nodetool.audio.AudioInput",
      "nodetool.image.ImageInput"
    ]);
  });

  it("should maintain maximum of 10 recent nodes", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    
    act(() => {
      // Add 12 different node types
      for (let i = 0; i < 12; i++) {
        result.current.addRecentNode(`nodetool.test.Node${i}`);
      }
    });

    // Should only keep the last 10
    expect(result.current.recentNodeTypes.length).toBe(10);
    expect(result.current.recentNodeTypes[0]).toBe("nodetool.test.Node11");
    expect(result.current.recentNodeTypes[9]).toBe("nodetool.test.Node2");
  });

  it("should clear all recent nodes", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    
    act(() => {
      result.current.addRecentNode("nodetool.text.TextInput");
      result.current.addRecentNode("nodetool.image.ImageInput");
      result.current.addRecentNode("nodetool.audio.AudioInput");
    });

    expect(result.current.recentNodeTypes.length).toBe(3);

    act(() => {
      result.current.clearRecentNodes();
    });

    expect(result.current.recentNodeTypes).toEqual([]);
  });

  it("should persist recent nodes to localStorage", () => {
    const { result } = renderHook(() => useRecentNodesStore());
    
    act(() => {
      result.current.addRecentNode("nodetool.text.TextInput");
      result.current.addRecentNode("nodetool.image.ImageInput");
    });

    // Get a fresh store instance to test persistence
    const { result: newResult } = renderHook(() => useRecentNodesStore());
    
    expect(newResult.current.recentNodeTypes).toEqual([
      "nodetool.image.ImageInput",
      "nodetool.text.TextInput"
    ]);
  });
});
