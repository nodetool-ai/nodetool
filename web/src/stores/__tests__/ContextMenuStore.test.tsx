import { ContextMenuContext, useContextMenu } from "../ContextMenuStore";
import { TypeMetadata } from "../ApiTypes";
import { renderHook } from "@testing-library/react";

describe("ContextMenuStore", () => {
  const createMockContextValue = (overrides = {}) => ({
    openMenuType: null as string | null,
    nodeId: null as string | null,
    menuPosition: null as { x: number; y: number } | null,
    type: null as TypeMetadata | null,
    handleId: null as string | null,
    description: undefined as string | undefined,
    isDynamicProperty: undefined as boolean | undefined,
    payload: undefined as unknown,
    openContextMenu: jest.fn(),
    closeContextMenu: jest.fn(),
    ...overrides
  });

  describe("useContextMenu", () => {
    it("throws error when used outside provider", () => {
      let error: Error | null = null;
      try {
        renderHook(() => useContextMenu());
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toContain("useContextMenu must be used within a ContextMenuProvider");
    });

    it("returns context when used within provider", () => {
      const mockContextValue = createMockContextValue();

      const { result } = renderHook(() => useContextMenu(), {
        wrapper: ({ children }) => (
          <ContextMenuContext.Provider value={mockContextValue}>
            {children}
          </ContextMenuContext.Provider>
        )
      });

      expect(result.current).toEqual(mockContextValue);
    });

    it("returns full context when no selector provided", () => {
      const mockContextValue = createMockContextValue({
        openMenuType: "node-context",
        nodeId: "test-node-1",
        menuPosition: { x: 100, y: 200 }
      });

      const { result } = renderHook(() => useContextMenu(), {
        wrapper: ({ children }) => (
          <ContextMenuContext.Provider value={mockContextValue}>
            {children}
          </ContextMenuContext.Provider>
        )
      });

      expect(result.current.openMenuType).toBe("node-context");
      expect(result.current.nodeId).toBe("test-node-1");
      expect(result.current.menuPosition).toEqual({ x: 100, y: 200 });
    });

    it("returns selected state when selector provided", () => {
      const mockContextValue = createMockContextValue({
        openMenuType: "test-menu",
        nodeId: "node-123"
      });

      const { result } = renderHook(
        () => useContextMenu((state) => ({ isOpen: state.openMenuType !== null })),
        {
          wrapper: ({ children }) => (
            <ContextMenuContext.Provider value={mockContextValue}>
              {children}
            </ContextMenuContext.Provider>
          )
        }
      );

      expect(result.current.isOpen).toBe(true);
    });

    it("handles selector returning partial state", () => {
      const mockContextValue = createMockContextValue({
        menuPosition: { x: 50, y: 75 }
      });

      const { result } = renderHook(
        () => useContextMenu((state) => state.menuPosition?.x ?? 0),
        {
          wrapper: ({ children }) => (
            <ContextMenuContext.Provider value={mockContextValue}>
              {children}
            </ContextMenuContext.Provider>
          )
        }
      );

      expect(result.current).toBe(50);
    });

    it("handles null menu position", () => {
      const mockContextValue = createMockContextValue({
        menuPosition: null
      });

      const { result } = renderHook(
        () => useContextMenu((state) => ({
          hasPosition: state.menuPosition !== null,
          x: state.menuPosition?.x ?? 0
        })),
        {
          wrapper: ({ children }) => (
            <ContextMenuContext.Provider value={mockContextValue}>
              {children}
            </ContextMenuContext.Provider>
          )
        }
      );

      expect(result.current.hasPosition).toBe(false);
      expect(result.current.x).toBe(0);
    });

    it("handles all optional fields", () => {
      const mockContextValue = createMockContextValue({
        openMenuType: "property-context",
        nodeId: "prop-node",
        handleId: "input-handle-1",
        description: "Test property description",
        isDynamicProperty: true,
        payload: { customData: "test" }
      });

      const { result } = renderHook(() => useContextMenu(), {
        wrapper: ({ children }) => (
          <ContextMenuContext.Provider value={mockContextValue}>
            {children}
          </ContextMenuContext.Provider>
        )
      });

      expect(result.current.handleId).toBe("input-handle-1");
      expect(result.current.description).toBe("Test property description");
      expect(result.current.isDynamicProperty).toBe(true);
      expect(result.current.payload).toEqual({ customData: "test" });
    });
  });

  describe("ContextMenuState interface", () => {
    it("accepts valid state object", () => {
      const state: import("../ContextMenuStore").ContextMenuState = {
        openMenuType: "test",
        nodeId: "node-1",
        menuPosition: { x: 10, y: 20 },
        type: null,
        handleId: null,
        description: undefined,
        isDynamicProperty: undefined,
        payload: undefined
      };

      expect(state.openMenuType).toBe("test");
      expect(state.nodeId).toBe("node-1");
      expect(state.menuPosition).toEqual({ x: 10, y: 20 });
    });

    it("accepts state with all optional fields defined", () => {
      const typeMetadata: TypeMetadata = {
        name: "TestType",
        input_types: ["text"],
        output_types: ["image"]
      };

      const state: import("../ContextMenuStore").ContextMenuState = {
        openMenuType: "full-menu",
        nodeId: "full-node",
        menuPosition: { x: 100, y: 200 },
        type: typeMetadata,
        handleId: "handle-1",
        description: "Full state description",
        isDynamicProperty: false,
        payload: { key: "value" }
      };

      expect(state.type).toEqual(typeMetadata);
      expect(state.isDynamicProperty).toBe(false);
      expect(state.payload).toEqual({ key: "value" });
    });
  });
});
