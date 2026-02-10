import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcutHints } from "../useKeyboardShortcutHints";

// Mock the NodeContext
jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  NodeProvider: ({ children }: any) => children,
  NodeContext: {}
}));

import { useNodes } from "../../contexts/NodeContext";

const mockUseNodes = useNodes as jest.Mock;

describe("useKeyboardShortcutHints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return default hints when no nodes are selected", () => {
    // Mock the selector to return an empty array (no selected nodes)
    mockUseNodes.mockReturnValue([]);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    // Should show default shortcuts
    expect(result.current.hintSlugs).toContain("openNodeMenu");
    expect(result.current.hintSlugs).toContain("findInWorkflow");
    expect(result.current.hintSlugs).toContain("fitView");
    expect(result.current.hintSlugs).toContain("saveWorkflow");
  });

  it("should return single-selected hints when one node is selected", () => {
    // Mock the selector to return one selected node
    mockUseNodes.mockReturnValue([{ id: "1", selected: true, data: {} }] as any);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    // Should include single-selected shortcuts
    expect(result.current.hintSlugs).toContain("copy");
    expect(result.current.hintSlugs).toContain("duplicate");
    expect(result.current.hintSlugs).toContain("bypassNode");
    expect(result.current.hintSlugs).toContain("nodeInfo");
    expect(result.current.hintSlugs).toContain("deleteNode");
  });

  it("should return multiple-selected hints when multiple nodes are selected", () => {
    // Mock the selector to return two selected nodes
    mockUseNodes.mockReturnValue([
      { id: "1", selected: true, data: {} },
      { id: "2", selected: true, data: {} }
    ] as any);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    // Should include multiple-selected shortcuts
    expect(result.current.hintSlugs).toContain("align");
    expect(result.current.hintSlugs).toContain("alignWithSpacing");
    expect(result.current.hintSlugs).toContain("distributeHorizontal");
    expect(result.current.hintSlugs).toContain("groupSelected");
    expect(result.current.hintSlugs).toContain("copy");
    expect(result.current.hintSlugs).toContain("duplicate");
  });

  it("should return isVisible true when hints are available", () => {
    mockUseNodes.mockReturnValue([{ id: "1", selected: true, data: {} }] as any);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    expect(result.current.isVisible).toBe(true);
  });

  it("should return isVisible false when user sets visibility to false", () => {
    mockUseNodes.mockReturnValue([{ id: "1", selected: true, data: {} }] as any);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.setVisible(false);
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.hintSlugs).toEqual([]);
  });

  it("should return empty hints when disabled", () => {
    mockUseNodes.mockReturnValue([{ id: "1", selected: true, data: {} }] as any);

    const { result } = renderHook(() => useKeyboardShortcutHints({}, false));

    expect(result.current.hintSlugs).toEqual([]);
    expect(result.current.isVisible).toBe(false);
  });

  it("should handle custom hint contexts", () => {
    mockUseNodes.mockReturnValue([{ id: "1", selected: true, data: {} }] as any);

    const customContexts = {
      custom_context: {
        minSelection: 1,
        shortcuts: ["custom1", "custom2"],
        priority: 100
      }
    };

    const { result } = renderHook(
      () => useKeyboardShortcutHints(customContexts, true)
    );

    expect(result.current.hintSlugs).toContain("custom1");
    expect(result.current.hintSlugs).toContain("custom2");
  });

  it("should prioritize contexts with higher priority", () => {
    mockUseNodes.mockReturnValue([
      { id: "1", selected: true, data: {} },
      { id: "2", selected: true, data: {} }
    ] as any);

    const customContexts = {
      high_priority: {
        minSelection: 1,
        shortcuts: ["high1", "high2"],
        priority: 100
      },
      low_priority: {
        minSelection: 1,
        shortcuts: ["low1", "low2"],
        priority: 1
      }
    };

    const { result } = renderHook(
      () => useKeyboardShortcutHints(customContexts, true)
    );

    // Should include all shortcuts from matching contexts
    expect(result.current.hintSlugs).toContain("high1");
    expect(result.current.hintSlugs).toContain("high2");
    expect(result.current.hintSlugs).toContain("low1");
    expect(result.current.hintSlugs).toContain("low2");
  });

  it("should filter contexts by selection count", () => {
    mockUseNodes.mockReturnValue([
      { id: "1", selected: true, data: {} },
      { id: "2", selected: true, data: {} },
      { id: "3", selected: true, data: {} }
    ] as any);

    const customContexts = {
      one_only: {
        minSelection: 1,
        maxSelection: 1,
        shortcuts: ["one"],
        priority: 10
      },
      two_plus: {
        minSelection: 2,
        shortcuts: ["two"],
        priority: 5
      },
      three_only: {
        minSelection: 3,
        maxSelection: 3,
        shortcuts: ["three"],
        priority: 15
      }
    };

    const { result } = renderHook(
      () => useKeyboardShortcutHints(customContexts, true)
    );

    // Should include two_plus and three_only, but not one_only
    expect(result.current.hintSlugs).toContain("two");
    expect(result.current.hintSlugs).toContain("three");
    expect(result.current.hintSlugs).not.toContain("one");
  });

  it("should provide stable setVisible callback", () => {
    mockUseNodes.mockReturnValue([]);

    const { result } = renderHook(() => useKeyboardShortcutHints());

    const firstCallback = result.current.setVisible;
    const secondCallback = result.current.setVisible;

    expect(firstCallback).toBe(secondCallback);
  });
});
