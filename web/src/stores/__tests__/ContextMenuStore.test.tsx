import * as React from "react";
import { renderHook } from "@testing-library/react";
import {
  ContextMenuContext,
  useContextMenu,
  ContextMenuContextType
} from "../ContextMenuStore";

describe("ContextMenuStore", () => {
  const createMockContextValue = (
    overrides: Partial<ContextMenuContextType> = {}
  ): ContextMenuContextType => ({
    openMenuType: null,
    nodeId: null,
    menuPosition: null,
    type: null,
    handleId: null,
    description: undefined,
    isDynamicProperty: undefined,
    payload: undefined,
    openContextMenu: jest.fn(),
    closeContextMenu: jest.fn(),
    ...overrides
  });

  // Helper to create wrapper function
  const createWrapper = (contextValue: ContextMenuContextType) => {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <ContextMenuContext.Provider value={contextValue}>
          {children}
        </ContextMenuContext.Provider>
      );
    };
  };

  describe("useContextMenu hook", () => {
    describe("without selector", () => {
      it("returns the full context when no selector is provided", () => {
        const mockContext = createMockContextValue({
          openMenuType: "node-menu",
          nodeId: "test-node-1",
          menuPosition: { x: 100, y: 200 }
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(() => useContextMenu(), { wrapper });

        expect(result.current).toBe(mockContext);
        expect(result.current.openMenuType).toBe("node-menu");
        expect(result.current.nodeId).toBe("test-node-1");
        expect(result.current.menuPosition).toEqual({ x: 100, y: 200 });
      });

      it("returns openContextMenu and closeContextMenu functions", () => {
        const openContextMenu = jest.fn();
        const closeContextMenu = jest.fn();
        const mockContext = createMockContextValue({
          openContextMenu,
          closeContextMenu
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(() => useContextMenu(), { wrapper });

        expect(result.current.openContextMenu).toBe(openContextMenu);
        expect(result.current.closeContextMenu).toBe(closeContextMenu);
      });
    });

    describe("with selector", () => {
      it("returns only the selected value", () => {
        const mockContext = createMockContextValue({
          openMenuType: "property-menu",
          nodeId: "selected-node"
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(
          () => useContextMenu((state) => state.openMenuType),
          { wrapper }
        );

        expect(result.current).toBe("property-menu");
      });

      it("can select nested properties", () => {
        const mockContext = createMockContextValue({
          menuPosition: { x: 50, y: 75 }
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(
          () => useContextMenu((state) => state.menuPosition?.x),
          { wrapper }
        );

        expect(result.current).toBe(50);
      });

      it("can select multiple properties as object", () => {
        const mockContext = createMockContextValue({
          nodeId: "node-123",
          handleId: "handle-abc"
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(
          () =>
            useContextMenu((state) => ({
              nodeId: state.nodeId,
              handleId: state.handleId
            })),
          { wrapper }
        );

        expect(result.current).toEqual({
          nodeId: "node-123",
          handleId: "handle-abc"
        });
      });
    });

    describe("error handling", () => {
      it("throws error when used outside of ContextMenuProvider", () => {
        // Suppress console.error for this test
        const consoleSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => {});

        expect(() => {
          renderHook(() => useContextMenu());
        }).toThrow("useContextMenu must be used within a ContextMenuProvider");

        consoleSpy.mockRestore();
      });
    });

    describe("context state properties", () => {
      it("provides all expected state properties", () => {
        const mockContext = createMockContextValue({
          openMenuType: "test-menu",
          nodeId: "node-1",
          menuPosition: { x: 10, y: 20 },
          type: { type: "str", optional: false, type_args: [] },
          handleId: "handle-1",
          description: "Test description",
          isDynamicProperty: true,
          payload: { custom: "data" }
        });
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(() => useContextMenu(), { wrapper });

        expect(result.current.openMenuType).toBe("test-menu");
        expect(result.current.nodeId).toBe("node-1");
        expect(result.current.menuPosition).toEqual({ x: 10, y: 20 });
        expect(result.current.type).toEqual({ type: "str", optional: false, type_args: [] });
        expect(result.current.handleId).toBe("handle-1");
        expect(result.current.description).toBe("Test description");
        expect(result.current.isDynamicProperty).toBe(true);
        expect(result.current.payload).toEqual({ custom: "data" });
      });

      it("handles null values correctly", () => {
        const mockContext = createMockContextValue();
        const wrapper = createWrapper(mockContext);

        const { result } = renderHook(() => useContextMenu(), { wrapper });

        expect(result.current.openMenuType).toBeNull();
        expect(result.current.nodeId).toBeNull();
        expect(result.current.menuPosition).toBeNull();
        expect(result.current.type).toBeNull();
        expect(result.current.handleId).toBeNull();
      });
    });
  });

  describe("ContextMenuContext default value", () => {
    it("throws error when accessed outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useContextMenu());
      }).toThrow("useContextMenu must be used within a ContextMenuProvider");

      consoleSpy.mockRestore();
    });
  });
});
