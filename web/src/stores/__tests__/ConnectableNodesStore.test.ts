describe("ConnectableNodesStore", () => {

  beforeEach(() => {
    jest.resetModules();
  });

  it("should export useConnectableNodes hook", async () => {
    const module = await import("../ConnectableNodesStore");
    expect(typeof module.useConnectableNodes).toBe("function");
  });

  it("should export ConnectableNodesState interface", () => {
    const state: Partial<import("../ConnectableNodesStore").ConnectableNodesState> = {
      nodeMetadata: [],
      filterType: null,
      typeMetadata: null,
      isVisible: false,
      sourceHandle: null,
      targetHandle: null,
      nodeId: null,
      menuPosition: null,
      setSourceHandle: jest.fn(),
      setTargetHandle: jest.fn(),
      setNodeId: jest.fn(),
      setFilterType: jest.fn(),
      setTypeMetadata: jest.fn(),
      getConnectableNodes: jest.fn(),
      showMenu: jest.fn(),
      hideMenu: jest.fn(),
    };
    expect(state.setSourceHandle).toBeDefined();
    expect(state.setTargetHandle).toBeDefined();
  });

  it("should have correct function overloads", () => {
    const overloads = [
      "export function useConnectableNodes(): ConnectableNodesState;",
      "export function useConnectableNodes<Selected>(selector: (state: ConnectableNodesState) => Selected): Selected;",
    ];
    expect(overloads.length).toBe(2);
  });
});
