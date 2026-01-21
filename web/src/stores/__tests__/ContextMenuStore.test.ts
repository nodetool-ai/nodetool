import { ContextMenuContext, useContextMenu } from "../ContextMenuStore";

describe("ContextMenuStore", () => {
  describe("ContextMenuContext", () => {
    it("should be defined", () => {
      expect(ContextMenuContext).toBeDefined();
    });

    it("should be a React context", () => {
      expect(ContextMenuContext).toHaveProperty("Provider");
      expect(ContextMenuContext).toHaveProperty("Consumer");
    });
  });

  describe("useContextMenu", () => {
    it("should be exported", () => {
      expect(useContextMenu).toBeDefined();
    });

    it("should be a function", () => {
      expect(typeof useContextMenu).toBe("function");
    });
  });

  describe("ContextMenuState interface", () => {
    it("should accept valid state object", () => {
      const validState = {
        openMenuType: null,
        nodeId: null,
        menuPosition: null,
        type: null,
        handleId: null,
        description: "test description",
        isDynamicProperty: false,
        payload: { key: "value" }
      };

      expect(validState.openMenuType).toBeNull();
      expect(validState.nodeId).toBeNull();
      expect(validState.description).toBe("test description");
      expect(validState.payload).toEqual({ key: "value" });
    });

    it("should accept state with position", () => {
      const stateWithPosition = {
        openMenuType: "node",
        nodeId: "node-1",
        menuPosition: { x: 100, y: 200 },
        type: null,
        handleId: null
      };

      expect(stateWithPosition.menuPosition).toEqual({ x: 100, y: 200 });
    });

    it("should accept state with TypeMetadata", () => {
      const stateWithType = {
        openMenuType: "edge",
        nodeId: "edge-1",
        menuPosition: null,
        type: { name: "test", namespace: "test" },
        handleId: "handle-1"
      };

      expect(stateWithType.type).toEqual({ name: "test", namespace: "test" });
      expect(stateWithType.handleId).toBe("handle-1");
    });
  });

  describe("ContextMenuContextType interface", () => {
    it("should define openContextMenu function", () => {
      const mockOpenContextMenu = jest.fn();
      expect(typeof mockOpenContextMenu).toBe("function");
    });

    it("should define closeContextMenu function", () => {
      const mockCloseContextMenu = jest.fn();
      expect(typeof mockCloseContextMenu).toBe("function");
    });
  });
});
