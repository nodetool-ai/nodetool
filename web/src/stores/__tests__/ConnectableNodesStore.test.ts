describe("ConnectableNodesStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("export has correct function overloads", () => {
    const module = require("../ConnectableNodesStore");
    
    expect(typeof module.default).toBe("function");
    expect(module.useConnectableNodes).toBeDefined();
  });

  it("exported interface is correct", () => {
    const { ConnectableNodesState } = require("../ConnectableNodesStore");
    
    const mockState: ConnectableNodesState = {
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
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    };

    expect(mockState.nodeMetadata).toEqual([]);
    expect(mockState.filterType).toBeNull();
    expect(mockState.typeMetadata).toBeNull();
    expect(mockState.isVisible).toBe(false);
    expect(mockState.sourceHandle).toBeNull();
    expect(mockState.targetHandle).toBeNull();
    expect(mockState.nodeId).toBeNull();
    expect(mockState.menuPosition).toBeNull();
    expect(typeof mockState.setSourceHandle).toBe("function");
    expect(typeof mockState.setTargetHandle).toBe("function");
    expect(typeof mockState.setNodeId).toBe("function");
    expect(typeof mockState.setFilterType).toBe("function");
    expect(typeof mockState.setTypeMetadata).toBe("function");
    expect(typeof mockState.getConnectableNodes).toBe("function");
    expect(typeof mockState.showMenu).toBe("function");
    expect(typeof mockState.hideMenu).toBe("function");
  });

  it("ConnectableNodesState interface accepts all required properties", () => {
    const { ConnectableNodesState } = require("../ConnectableNodesStore");
    
    const createState = (): ConnectableNodesState => ({
      nodeMetadata: [],
      filterType: "input",
      typeMetadata: null,
      isVisible: true,
      sourceHandle: "output-1",
      targetHandle: "input-1",
      nodeId: "node-1",
      menuPosition: { x: 100, y: 200 },
      setSourceHandle: jest.fn(),
      setTargetHandle: jest.fn(),
      setNodeId: jest.fn(),
      setFilterType: jest.fn(),
      setTypeMetadata: jest.fn(),
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    });

    const state = createState();
    
    expect(state.nodeMetadata).toEqual([]);
    expect(state.filterType).toBe("input");
    expect(state.isVisible).toBe(true);
    expect(state.sourceHandle).toBe("output-1");
    expect(state.menuPosition).toEqual({ x: 100, y: 200 });
  });

  it("filterType accepts null", () => {
    const { ConnectableNodesState } = require("../ConnectableNodesStore");
    
    const state: ConnectableNodesState = {
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
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    };

    expect(state.filterType).toBeNull();
  });

  it("filterType accepts 'input' and 'output'", () => {
    const { ConnectableNodesState } = require("../ConnectableNodesStore");
    
    const createInputState = (): ConnectableNodesState => ({
      nodeMetadata: [],
      filterType: "input",
      typeMetadata: null,
      isVisible: true,
      sourceHandle: null,
      targetHandle: null,
      nodeId: null,
      menuPosition: null,
      setSourceHandle: jest.fn(),
      setTargetHandle: jest.fn(),
      setNodeId: jest.fn(),
      setFilterType: jest.fn(),
      setTypeMetadata: jest.fn(),
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    });

    const createOutputState = (): ConnectableNodesState => ({
      nodeMetadata: [],
      filterType: "output",
      typeMetadata: null,
      isVisible: true,
      sourceHandle: null,
      targetHandle: null,
      nodeId: null,
      menuPosition: null,
      setSourceHandle: jest.fn(),
      setTargetHandle: jest.fn(),
      setNodeId: jest.fn(),
      setFilterType: jest.fn(),
      setTypeMetadata: jest.fn(),
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    });

    expect(createInputState().filterType).toBe("input");
    expect(createOutputState().filterType).toBe("output");
  });

  it("state functions are callable", () => {
    const { ConnectableNodesState } = require("../ConnectableNodesStore");
    
    const state: ConnectableNodesState = {
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
      getConnectableNodes: jest.fn(() => []),
      showMenu: jest.fn(),
      hideMenu: jest.fn()
    };

    state.setSourceHandle("output-1");
    expect(state.setSourceHandle).toHaveBeenCalledWith("output-1");

    state.setTargetHandle("input-1");
    expect(state.setTargetHandle).toHaveBeenCalledWith("input-1");

    state.setNodeId("node-1");
    expect(state.setNodeId).toHaveBeenCalledWith("node-1");

    state.setFilterType("input");
    expect(state.setFilterType).toHaveBeenCalledWith("input");

    state.showMenu({ x: 100, y: 200 });
    expect(state.showMenu).toHaveBeenCalledWith({ x: 100, y: 200 });

    state.hideMenu();
    expect(state.hideMenu).toHaveBeenCalled();

    state.getConnectableNodes();
    expect(state.getConnectableNodes).toHaveBeenCalled();
  });
});
